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
        return new Promise(function(resolve) {
            logger.user(maiordomus.$currentStep.name, args[0]);
            resolve();
        });
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
        return Promise.each(sshConfig.host, function(address) {
            return new Promise(function (resolve, reject) {
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
        
        return new Promise(function (resolve) {
            
            utils.userLog(stepName, args[0]);

            if (utils.hasSessions(maiordomus)) {
                maiordomus.$closeConnections();
            } else {
                logger.warn(stepName,
                    'Disconnect called when no ssh session were active');
            }

            resolve();
        });
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
            return Promise.each(maiordomus.$sshSessions, function(conn) {
                return new Promise(function (resolve, reject) {
                    conn.exec(args[0], function (err, stream) {
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
            });
        } else {
            var exec = require('child_process').exec;
            exec(args[0], function(err, stdout, stderr) {
                if (err) {
                    logger.error(stepName,
                        'Error executing shell command: [' +
                        args[0] + ']');
                    return Promise.reject(err);
                } else {
                    if (stdout) {
                        logger.log(stepName, '\n' + stdout);
                    }
                    if (stderr) {
                        logger.error(stepName, '\n' + stderr);
                        return Promise.reject(new Error('Command execution error'));
                    } else {
                        return Promise.resolve();
                    }
                }
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
            return new Promise(function (resolve, reject) {
                var sftp = Promise.promisify(conn.sftp, conn);
                sftp().then(function (sftpClient) {
                    var get = Promise.promisify(sftpClient.fastGet, sftpClient);
                    var bar;
                    get(args[0], args[1], {
                        step: function (transferred, chunk, total) {
                            if (!bar) {
                                bar = new ProgressBar('Download progress [:bar] :percent', {
                                    complete: '=',
                                    incomplete: ' ',
                                    width: 50,
                                    total: total
                                });
                            }
                            bar.tick(chunk);
                        }
                    })
                    .then(function () {
                        utils.sshLogger('info', stepName, conn._host, maiordomus.$env, 'Download complete');
                        sftpClient.end();
                        resolve();
                    })
                    .catch(function (err) {
                        utils.sshLogger('error', stepName, conn._host, maiordomus.$env, 'Error downloading file', err);
                        sftpClient.end();
                        reject(err);
                    });
                })
                .catch(function (err) {
                    utils.sshLogger('error', stepName, conn._host, maiordomus.$env, 'Error creating SFTP client', err);
                    reject(err);
                });
            });
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
            return new Promise(function (resolve, reject) {
                var sftp = Promise.promisify(conn.sftp, conn);
                sftp().then(function (sftpClient) {
                    var put = Promise.promisify(sftpClient.fastPut, sftpClient);
                    var bar;
                    put(args[0], args[1], {
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
                    })
                    .then(function () {
                        utils.sshLogger('info', stepName, conn._host, maiordomus.$env, 'Upload complete');
                        sftpClient.end();
                        resolve();
                    })
                    .catch(function (err) {
                        utils.sshLogger('error', stepName, conn._host, maiordomus.$env, 'Error uploading file', err);
                        sftpClient.end();
                        reject(err);
                    });
                })
                .catch(function (err) {
                    utils.sshLogger('error', stepName, conn._host, maiordomus.$env, 'Error creating SFTP client', err);
                    reject(err);
                });
            });
        });
    }
};