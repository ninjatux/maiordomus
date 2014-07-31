'use strict';

var Connection = require('ssh2'),
    _ = require('lodash'),
    logger = require('../logger'),
    Promise = require('bluebird');

function _checkSSHOptions(options) {
    var errorTemplate = _.template(
        '"<%= property %>" property is mandatory in enviroment configuration');

    if (!options.host) {
        throw new Error(errorTemplate({ property: 'host'}));
    }

    if (!options.port) {
        options.port = 22;
    }

    if (!options.username) {
        throw new Error(errorTemplate({ property: 'username'}));
    }

    if (!options.password && !options.privateKey) {
        throw new Error(errorTemplate({ property: 'username or privateKey'}));
    }

    return options;
}

var logTemplate = _.template('[<%= env %> - <%= address %>] <%= message %>');

module.exports = {
    sshConnect: function(options, maiordomus) {
        return new Promise(function(resolve, reject) {

            maiordomus.$sshSessions = [];
            
            var sshOptions = _checkSSHOptions(
                maiordomus.$config.environments[maiordomus.$env]);

            if (!_.isArray(sshOptions.host)) {
                sshOptions.host = [sshOptions.host];
            }
            
            Promise.each(sshOptions.host, function (address) {
                return new Promise(function (resolve, reject) {
                    var conn = new Connection();
                    
                    conn.connect({
                        host: address,
                        port: sshOptions.port,
                        username: sshOptions.username,
                        password: sshOptions.password,
                        privateKey: sshOptions.privateKey
                    });

                    conn.on('ready', function () {
                        logger.info(maiordomus.$currentStep.name,
                            logTemplate({
                                address: address,
                                env: maiordomus.$env,
                                message: 'Connection succesful'}));
                        maiordomus.$sshSessions.push(conn);
                        resolve();
                    });

                    conn.on('error', function (err) {
                        logger.error(maiordomus.$currentStep.name,
                            logTemplate({
                                env: maiordomus.$env,
                                address: address,
                                message: 'Connection error'}));
                        logger.error(maiordomus.$currentStep.name, err.message);
                        reject(err);
                    });

                    conn.on('close', function () {
                        logger.log(maiordomus.$currentStep.name,
                            logTemplate({
                                address: address,
                                env: maiordomus.$env,
                                message: 'Closing connection'}));
                        conn.end();
                    });

                });
            }).then(function () {
                logger.user(maiordomus.$currentStep.name, options[0]);
                resolve();
            });
        });
    },

    sshSend: function (options, maiordomus) {
        return new Promise(function (resolve, reject) {
            _.each(maiordomus.$sshSessions, function (conn) {

                conn.exec(options[0], function (err, stream) {
                    if (err) {
                        logger.error(maiordomus.$currentStep.name,
                            logTemplate({
                                address: conn._host,
                                env: maiordomus.$env,
                                message: 'Command execution error'}));
                        logger.error(maiordomus.$currentStep.name,
                            err.message);
                        reject(err);
                    }

                    stream.on('close', function () {
                        logger.info(maiordomus.$currentStep.name,
                            logTemplate({
                                address: conn._host,
                                env: maiordomus.$env,
                                message: 'Command executed'}));
                        resolve();
                    });

                    stream.on('data', function (data) {
                        logger.log(maiordomus.$currentStep.name,
                            logTemplate({
                                address: conn._host,
                                env: maiordomus.$env,
                                message: 'STDOUT: ' + data}));
                    }).stderr.on('data', function (data) {
                        logger.warn(maiordomus.$currentStep.name,
                            logTemplate({
                                address: conn._host,
                                env: maiordomus.$env,
                                message: 'STDERR: ' + data}));
                    });
                });
            });
        });
    }
};