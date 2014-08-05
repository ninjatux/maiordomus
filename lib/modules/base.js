var logger = require('../logger'),
    Connection = require('ssh2'),
    ProgressBar = require('progress'),
    Promise = require('bluebird'),
    _ = require('lodash');

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

var logTemplate = _.template('[<%= env %> - <%= address %>] <%= message %>');

module.exports = {
    // Log user defined messages with an 'user' log level
    // args: {
    //  '0': String --> User message
    // }
    log: function(args, maiordomus) {
        return new Promise(function(resolve, reject) {
            logger.user(maiordomus.$currentStep.name, args[0]);
            resolve();
        });
    },
    // Create ssh session to a list of given machines
    // args: {
    //  '0': String --> User message
    // }
    connect: function(args, maiordomus) {
        return new Promise(function (resolve, reject) {

            if (args[0]) {
                logger.user(maiordomus.$currentStep.name, args[0] || '');
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
                        logger.info(maiordomus.$currentStep
                            .name,
                            logTemplate({
                                address: address,
                                env: maiordomus.$env,
                                message: 'Connection succesful'
                            }));
                        maiordomus.$sshSessions.push(
                            conn);
                        resolve();
                    });

                    conn.on('error', function (err) {
                        logger.error(maiordomus.$currentStep
                            .name,
                            logTemplate({
                                env: maiordomus.$env,
                                address: address,
                                message: 'Connection error'
                            }));
                        logger.error(maiordomus.$currentStep
                            .name, err.message);
                        reject(err);
                    });

                    conn.on('close', function () {
                        logger.log(maiordomus.$currentStep
                            .name,
                            logTemplate({
                                address: address,
                                env: maiordomus.$env,
                                message: 'Closing connection'
                            }));
                        conn.end();
                    });

                });
            }).then(function() {
                resolve();
            });
        });
    },

    // Close, if any, all the ssh sessions currently active
    // args: {
    //  '0': String --> User message
    // }
    disconnect: function(args, maiordomus) {
        return new Promise(function (resolve, reject) {
            if (args[0]) {
                logger.user(maiordomus.$currentStep.name, args[0]);
            }

            if (_hasSessions(maiordomus)) {
                _.each(maiordomus.$sshSessions, function(conn) {
                    conn.end();
                });
                maiordomus.$sshSessions = [];
            } else {
                logger.warn(maiordomus.$currentStep.name,
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
        return new Promise(function (resolve, reject) {
            
            if (args[1]) {
                logger.user(maiordomus.$currentStep.name, args[0]);
            }

            if (_hasSessions(maiordomus)) {
                Promise.each(maiordomus.$sshSessions, function(conn) {
                    return new Promise(function (resolve, reject) {
                        conn.exec(args[0], function (err, stream) {
                            if (err) {
                                logger.error(maiordomus.$currentStep.name,
                                    logTemplate({
                                        address: conn._host,
                                        env: maiordomus.$env,
                                        message: 'Command execution error'
                                    }));
                                logger.error(maiordomus.$currentStep
                                    .name,
                                    err.message);
                                reject(err);
                                return;
                            }
                            stream.on('close', function() {
                                logger.info(maiordomus.$currentStep
                                    .name,
                                    logTemplate({
                                        address: conn._host,
                                        env: maiordomus.$env,
                                        message: 'Command executed'
                                    }));
                                resolve();
                            });

                            stream.on('data', function(data) {
                                logger.log(maiordomus.$currentStep
                                    .name,
                                    logTemplate({
                                        address: conn._host,
                                        env: maiordomus.$env,
                                        message: '\n' + data
                                    }));
                            }).stderr.on('data', function(data) {
                                logger.warn(maiordomus.$currentStep
                                    .name,
                                    logTemplate({
                                        address: conn._host,
                                        env: maiordomus.$env,
                                        message: '\n' + data
                                    }));
                                reject();
                            });
                        });
                    });
                }).then(resolve);
            } else {
                var exec = require('child_process').exec;
                exec(args[0], function(err, stdout,
                    stderr) {
                    if (err) {
                        logger.error(maiordomus.$currentStep.name,
                            'Error executing shell command: [' +
                            args[0] + ']');
                        reject(err);
                    } else {
                        if (stdout) {
                            logger.log(maiordomus.$currentStep.name,
                                '\n' + stdout);
                        }
                        if (stderr) {
                            logger.error(maiordomus.$currentStep.name,
                                '\n' + stderr);
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
            
            if (args[2]) {
                logger.user(maiordomus.$currentStep.name,
                    args[2]);
            }

            if(!_hasSessions(maiordomus)) {
                logger.error(maiordomus.$currentStep.name,
                    'Get called when no ssh session were active');
                reject(new Error('No active SSH session found'));
                return;
            }

            Promise.each(maiordomus.$sshSessions, function (conn) {
                return new Promise(function (resolve, reject) {
                    var sftp = Promise.promisify(conn.sftp, conn);
                    sftp()
                    .then(function (sftpClient) {
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
                            logger.info(maiordomus.$currentStep.name,
                                logTemplate({
                                    address: conn._host,
                                    env: maiordomus.$env,
                                    message: 'Download complete'
                                }));
                            sftpClient.end();
                            resolve();
                        })
                        .catch(function (err) {
                            logger.error(maiordomus.$currentStep.name,
                                logTemplate({
                                    address: conn._host,
                                    env: maiordomus.$env,
                                    message: 'Error getting remote file'
                                }));
                            sftpClient.end();
                            reject(err);
                        });
                    })
                    .catch(function (err) {
                        logger.error(maiordomus.$currentStep.name,
                            logTemplate({
                                address: conn._host,
                                env: maiordomus.$env,
                                message: 'Error creating SFTP client'
                            }));
                        reject(err);
                    });
                });
            }).then(resolve);
        });
    },

    // Upload a file to remote host
    // args: {
    //  '0': String --> Remote path
    //  '1': String --> Local path
    //  '2': String --> User message
    // }
    put: function (args, maiordomus) {
    }
};