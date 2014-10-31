'use strict';
var _ = require('lodash'),
    Connection = require('ssh2'),
    ProgressBar = require('progress'),
    Promise = require('bluebird'),
    logger = require('./logger'),
    utils = require('./utils');
//###Base API
//This is the Maiordomus base API. All the methods listed here are
//part of the core functionalities of Maiordomus.
module.exports = {
    //####log
    //Log an user defined messages with an 'user' log level
    //args:
    //```json
    //{
    //  '0': String --> User message
    //}```
    log: function(args, maiordomus) {
        logger.user(maiordomus.$currentStep.name, args[0]);
        return Promise.resolve();
    },
    //####connect
    //Create ssh session to a list of given machines
    //```json
    //{
    //  '0': String --> User message
    //}```
    connect: function(args, maiordomus) {
        var stepName = maiordomus.$currentStep.name;

        utils.userLog(stepName, args[0]);

        maiordomus.$sshSessions = [];

        var sshConfig = utils.checkSSHConfig(
            maiordomus.$config.environments[maiordomus.$env]);

        if (!_.isArray(sshConfig.host)) {
            sshConfig.host = [sshConfig.host];
        }
        // Connect to all the adresses contained in the config
        return promiseForEach(sshConfig.host, function(address, resolve, reject) {
            var conn = new Connection();
            conn.connect({
                host: address,
                port: sshConfig.port,
                username: sshConfig.username,
                password: sshConfig.password,
                privateKey: sshConfig.privateKey
            });
            conn.on('ready', function () {
                utils.sshLogger('info', stepName, address, maiordomus.$env,
                    'Connection succesful');
                maiordomus.$sshSessions.push(conn);
                resolve();
            }).on('error', function (err) {
                utils.sshLogger('error', stepName, address, maiordomus.$env,
                    'Connection error', err);
                reject(err);
            }).on('close', function () {
                utils.sshLogger('log', stepName, address, maiordomus.$env,
                    'Closing connection');
                conn.end();
            });
        });
    },
    //####disconnect
    //Close, if any, all the ssh sessions currently active
    //```json
    //{
    //  '0': String --> User message
    //}```
    disconnect: function(args, maiordomus) {
        var stepName = maiordomus.$currentStep.name;

        utils.userLog(stepName, args[0]);

        if (utils.hasSessions(maiordomus)) {
            maiordomus.$closeConnections();
        } else {
            logger.warn(stepName,
                'Disconnect called when no ssh session were active');
        }

        return Promise.resolve();
    },
    //####exec
    //Execute a command. If Maiordomus is connected with a remote
    //server 'exec' is executed remotely, otherwise locally
    //```json
    //{
    //  '0': String --> Command to be executed
    //  '1': String --> User message
    //}```
    exec: function(args, maiordomus) {
        var stepName = maiordomus.$currentStep.name;

        utils.userLog(stepName, args[1]);

        if (utils.hasSessions(maiordomus)) {
            return promiseForEach(maiordomus.$sshSessions, function(conn, resolve, reject) {
                conn.exec(args[0], {pty: true}, function (err, stream) {
                    if (err) {
                        utils.sshLogger('error', stepName, conn._hot,
                            maiordomus.$env,'Command execution error', err);
                        reject(err);
                        return;
                    }

                    stream.on('end', resolve).on('data', function(data) {
                        utils.sshLogger('log', stepName, conn._host,
                            maiordomus.$env, '\n' + data);
                    }).stderr.on('data', function(data) {
                        utils.sshLogger('error', stepName, conn._host,
                            maiordomus.$env, '\n' + data);
                        reject();
                    });
            });
            });
        } else {
            var exec = require('child_process').exec;
            return Promise.promisify(exec)(args[0])
                .then(function(stdout, stderr) {
                    if (stdout) {
                        logger.log(stepName, '\n' + stdout);
                    }
                    if (stderr) {
                        logger.error(stepName, '\n' + stderr);
                        return Promise.reject(new Error('Command execution error'));
                    } else {
                        return Promise.resolve();
                    }
                })
                .catch(function(err) {
                    logger.error(stepName,
                        'Error executing shell command: [' +
                        args[0] + ']');
                    return Promise.reject(err);
                });
        }
    },

    //####get
    //Download a remote file
    //```json
    //{
    // '0': String --> Remote path
    // '1': String --> Local path
    // '2': String --> User message
    //}```
    get: function (args, maiordomus) {
        var stepName = maiordomus.$currentStep.name;

        utils.userLog(stepName, args[2]);

        if(!utils.hasSessions(maiordomus)) {
            logger.error(stepName, 'Get called when no ssh session were active');
            throw new Error('No active SSH session found');
        }

        return Promise.each(maiordomus.$sshSessions, function (conn) {
            var bar;
            return new Promise(function (resolve, reject) {
                conn.sftp(function (err, sftp) {
                    sftp.fastGet(args[0], args[1], {
                        step: function (transferred, chunk, total) {
                            if (!bar) {
                                bar = new ProgressBar('Download progress: [:bar] :percent', {
                                    complete: '=',
                                    incomplete: ' ',
                                    total: total,
                                    width: 50
                                });
                            }
                            bar.tick(chunk);
                        }
                    }, function (err) {
                        if (err) {
                            utils.sshLogger('error', stepName, conn._host, maiordomus.$env, 'Error downloading file', err);
                            reject(err);
                        } else {
                            utils.sshLogger('info', stepName, conn._host, maiordomus.$env, 'Download complete');
                            resolve();
                        }
                    });
                });
            })
        });
    },

    //####put
    //Upload a file to remote host
    //```json
    //{
    // '0': String --> Local path
    // '1': String --> Remote path
    // '2': String --> User message
    //}```
    put: function (args, maiordomus) {
        // current step name
        var stepName = maiordomus.$currentStep.name;
        // if user message is present log it
        utils.userLog(stepName, args[2]);
        // check if there is at least one ssh session active
        if (!utils.hasSessions(maiordomus)) {
            logger.error(stepName, 'Get called when no ssh session were active');
            throw new Error('No active SSH session found');
        }
        // uploading file to remote machines
        return Promise.each(maiordomus.$sshSessions, function (conn) {
            var bar;
            return new Promise(function (resolve, reject) {
                conn.sftp(function (err, sftp) {
                    sftp.fastPut(args[0], args[1], {
                        step: function (transferred, chunk, total) {
                            if (!bar) {
                                bar = new ProgressBar('Upload progress: [:bar] :percent', {
                                    complete: '=',
                                    incomplete: ' ',
                                    total: total,
                                    width: 50
                                });
                            }
                            bar.tick(chunk);
                        }
                    }, function (err) {
                        if (err) {
                            utils.sshLogger('error', stepName, conn._host, maiordomus.$env, 'Error uploading file', err);
                            reject(err);
                        } else {
                            utils.sshLogger('info', stepName, conn._host, maiordomus.$env, 'Upload complete');
                            resolve();
                        }
                    });
                });
            });
        });
    }
};

//Helper function for asynchronous loops. Code like this:
//    Promise.each(list, function(item) {
//        return new Promise(function(resolve, reject) {
//            resolve('success!');
//        });
//    });
//Can be written like so:
//    promiseForEach(list, function(item, resolve, reject) {
//        resolve('success!');
//    });
function promiseForEach(list, iterator) {
    return Promise.each(list, function(item) {
        return new Promise(_.partial(iterator, item));
    });
}
