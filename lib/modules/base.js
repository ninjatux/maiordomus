'use strict';

var logger = require('../logger'),
    Connection = require('ssh2'),
    ProgressBar = require('progress'),
    Promise = require('bluebird'),
    _ = require('lodash');

var sshLogTemplate = _.template('[<%= env %> - <%= address %>] <%= message %>');

function _transform(command, environment, config) {
    return _.template(command,
        _.merge(config.variables, config.environments[environment].variables));
}

function _checkSSHConfig(config) {
    var errorTemplate = _.template(
        '"<%= property %>" property is mandatory in enviroment configuration'
    );

    if (!config.host) {
        throw new Error(errorTemplate({
            property: 'host'
        }));
    }

    if (!config.port) {
        config.port = 22;
    }

    if (!config.username) {
        throw new Error(errorTemplate({
            property: 'username'
        }));
    }

    if (!config.password && !config.privateKey) {
        throw new Error(errorTemplate({
            property: 'username or privateKey'
        }));
    }

    return config;
}

function _hasSessions(maiordomus) {
    if (maiordomus.$sshSessions && maiordomus.$sshSessions.length) {
        return true;
    }
    return false;
}

function sshLogger(level, stepName, address, env, message, err) {
    logger[level](stepName, sshLogTemplate({
        address: address,
        env: env,
        message: message
    }));

    if (err) {
        logger.error(stepName, sshLogTemplate({
            address: address,
            env: env,
            message: err.message
        }));
    }
}

module.exports = {
    // Log user defined messages with an 'user' log level
    // args: {
    //  '0': String --> User message
    // }
    log: function(args, maiordomus) {
        return new Promise(function(resolve, reject) {
            var logTmpl = _transform(
                args[0], maiordomus.$env, maiordomus.$config);
            logger.user(maiordomus.$currentStep.name, logTmpl);
            resolve();
        });
    },
    // Create ssh session to a list of given machines
    // args: {
    //  '0': String --> User message
    // }
    connect: function(args, maiordomus) {
        var stepName = maiordomus.$currentStep.name;

        return new Promise(function (resolve, reject) {

            if (args[0]) {
                logger.user(stepName, args[0] || '');
            }

            maiordomus.$sshSessions = [];

            var sshConfig = _checkSSHConfig(
                maiordomus.$config.environments[maiordomus.$env]);

            if (!_.isArray(sshConfig.host)) {
                sshConfig.host = [sshConfig.host];
            }

            Promise.each(sshConfig.host, function(address) {
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
                        sshLogger('info', stepName, address, maiordomus.$env,
                            'Connection succesful');
                        maiordomus.$sshSessions.push(conn);
                        resolve();
                    }).on('error', function (err) {
                        sshLogger('error', stepName, address, maiordomus.$env,
                            'Connection error', err);
                        reject(err);
                    }).on('close', function () {
                        sshLogger('log', stepName, address, maiordomus.$env,
                            'Closing connection');
                        conn.end();
                    });

                });
            }).then(resolve).catch(reject);
        });
    },

    // Close, if any, all the ssh sessions currently active
    // args: {
    //  '0': String --> User message
    // }
    disconnect: function(args, maiordomus) {
        var stepName = maiordomus.$currentStep.name;
        return new Promise(function (resolve, reject) {
            if (args[0]) {
                logger.user(stepName, args[0]);
            }

            if (_hasSessions(maiordomus)) {
                _.each(maiordomus.$sshSessions, function(conn) {
                    conn.end();
                });
                maiordomus.$sshSessions = [];
            } else {
                logger.warn(stepName,
                    'Disconnect called when no ssh session were active');
            }

            resolve();
        });
    },

    // Execute a command. If Maiordomus is connected with a remote
    // server 'exec' is executed remotely, otherwise locally
    // args: {
    //  '0': String --> Command to be executed
    //  '1': String --> User message
    // }
    exec: function(args, maiordomus) {
        var stepName = maiordomus.$currentStep.name;

        return new Promise(function (resolve, reject) {
            
            if (args[1]) {
                logger.user(stepName, args[0]);
            }

            if (_hasSessions(maiordomus)) {
                Promise.each(maiordomus.$sshSessions, function(conn) {
                    return new Promise(function (resolve, reject) {
                        conn.exec(args[0], function (err, stream) {
                            if (err) {
                                sshLogger('error', stepName, conn._hot,
                                    maiordomus.$env,'Command execution error', err);
                                reject(err);
                                return;
                            }

                            stream.on('end', resolve).on('data', function(data) {
                                sshLogger('log', stepName, conn._host,
                                    maiordomus.$env, '\n' + data);
                            }).stderr.on('data', function(data) {
                                sshLogger('error', stepName, conn._host,
                                    maiordomus.$env, '\n' + data);
                                reject();
                            });
                        });
                    });
                }).then(resolve).catch(reject);
            } else {
                var exec = require('child_process').exec;
                exec(args[0], function(err, stdout,
                    stderr) {
                    if (err) {
                        logger.error(stepName,
                            'Error executing shell command: [' +
                            args[0] + ']');
                        reject(err);
                    } else {
                        if (stdout) {
                            logger.log(stepName, '\n' + stdout);
                        }
                        if (stderr) {
                            logger.error(stepName, '\n' + stderr);
                            reject(new Error('Command execution error'));
                        } else {
                            resolve();
                        }
                    }
                });
            }
        });
    },

    // Download a remote file
    // args: {
    //  '0': String --> Remote path
    //  '1': String --> Local path
    //  '2': String --> User message
    // }
    get: function (args, maiordomus) {
        return new Promise(function (resolve, reject) {

            var stepName = maiordomus.$currentStep.name;
            
            if (args[2]) {
                logger.user(stepName, args[2]);
            }

            if(!_hasSessions(maiordomus)) {
                logger.error(stepName, 'Get called when no ssh session were active');
                reject(new Error('No active SSH session found'));
                return;
            }

            Promise.each(maiordomus.$sshSessions, function (conn) {
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
                            sshLogger('info', stepName, conn._host, maiordomus.$env, 'Download complete');
                            sftpClient.end();
                            resolve();
                        })
                        .catch(function (err) {
                            sshLogger('error', stepName, conn._host, maiordomus.$env, 'Error downloading file', err);
                            sftpClient.end();
                            reject(err);
                        });
                    })
                    .catch(function (err) {
                        sshLogger('error', stepName, conn._host, maiordomus.$env, 'Error creating SFTP client', err);
                        reject(err);
                    });
                });
            }).then(resolve).catch(reject);
        });
    },

    // Upload a file to remote host
    // args: {
    //  '0': String --> Local path
    //  '1': String --> Remote path
    //  '2': String --> User message
    // }
    put: function (args, maiordomus) {
        return new Promise(function (resolve,reject) {
            // current step name
            var stepName = maiordomus.$currentStep.name;
            // if user message is present log it
            if (args[2]) {
                logger.user(stepName, args[2]);
            }
            // check if there is at least one ssh session active
            if (!_hasSessions(maiordomus)) {
                logger.error(stepName, 'Get called when no ssh session were active');
                reject(new Error('No active SSH session found'));
                return;
            }
            // uploading file to remote machines
            Promise.each(maiordomus.$sshSessions, function (conn) {
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
                            sshLogger('info', stepName, conn._host, maiordomus.$env, 'Upload complete');
                            sftpClient.end();
                            resolve();
                        })
                        .catch(function (err) {
                            sshLogger('error', stepName, conn._host, maiordomus.$env, 'Error uploading file', err);
                            sftpClient.end();
                            reject(err);
                        });
                    })
                    .catch(function (err) {
                        sshLogger('error', stepName, conn._host, maiordomus.$env, 'Error creating SFTP client', err);
                        reject(err);
                    });
                });
            }).then(resolve).catch(reject);
        });
    }
};