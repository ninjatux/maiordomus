var logger = require('../logger'),
    Connection = require('ssh2'),
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

var logTemplate = _.template('[<%= env %> - <%= address %>] <%= message %>');

module.exports = {
    /**
     * Allow user logging in console during step definition
     * @param  {String} message    Message to be logged on console
     * @param  {Object} maiordomus Maiordomus instance
     */
    log: function(message, maiordomus) {
        return new Promise(function(resolve, reject) {
            logger.user(maiordomus.$currentStep.name, message[0]);
            resolve();
        });
    },
    /**
     * Connects to a list of given machines.
     * @param  {Object} message    Contains the arguments list
     * @param  {Object} maiordomus Maiordomus instance
     */
    connect: function(message, maiordomus) {
        return new Promise(function (resolve, reject) {

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
                if (message[0]) {
                    logger.user(maiordomus.$currentStep.name, message[0] || '');
                }
                resolve();
            });
        });
    },

    /**
     * Close all ssh sessions currently active
     * @param  {Object} message    Log message
     * @param  {Object} maiordomus Maiordomus instance
     */
    disconnect: function(message, maiordomus) {
        return new Promise(function(resolve, reject) {
            if (maiordomus.$sshSessions && maiordomus.$sshSessions.length) {
                _.each(maiordomus.$sshSessions, function(conn) {
                    conn.end();
                });
                maiordomus.$sshSessions = [];
            }
            if (message[0]) {
                logger.user(maiordomus.$currentStep.name, message[0]);
            }
            resolve();
        });
    },

    /**
     * Execute the given command
     * @param  {[type]} command    Commands to be executed
     * @param  {[type]} maiordomus Maiordomus instance
     */
    exec: function(command, maiordomus) {
        return new Promise(function(resolve, reject) {
            if (maiordomus.$sshSessions && maiordomus.$sshSessions.length) {
                _.each(maiordomus.$sshSessions, function(conn) {

                    conn.exec(command[0], function(err, stream) {
                        if (err) {
                            logger.error(maiordomus.$currentStep
                                .name,
                                logTemplate({
                                    address: conn._host,
                                    env: maiordomus.$env,
                                    message: 'Command execution error'
                                }));
                            logger.error(maiordomus.$currentStep
                                .name,
                                err.message);
                            reject(err);
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
                                    message: 'STDOUT: ' +
                                        data
                                }));
                        }).stderr.on('data', function(data) {
                            logger.warn(maiordomus.$currentStep
                                .name,
                                logTemplate({
                                    address: conn._host,
                                    env: maiordomus.$env,
                                    message: 'STDERR: ' +
                                        data
                                }));
                        });
                    });
                });
            } else {
                var exec = require('child_process').exec;
                exec(command[0], function(err, stdout,
                    stderr) {
                    if (err) {
                        logger.error(maiordomus.$currentStep.name,
                            'Error executing shell command: [' +
                            command[0] + ']');
                        reject(err);
                    } else {
                        if (stdout) {
                            logger.log(maiordomus.$currentStep.name,
                                stdout);
                        }
                        if (stderr) {
                            logger.error(maiordomus.$currentStep
                                .name,
                                stderr);
                            logger.log(maiordomus.$currentStep.name,
                                'Commad execution error');
                            reject(new Error('Command execution error'));
                        } else {
                            logger.log(maiordomus.$currentStep.name,
                                'Local commad executed');
                            resolve();
                        }
                    }
                });
            }
        });
    }
};