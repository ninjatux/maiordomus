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

module.exports = {
    sshConnect: function(options, maiordomus) {
        return new Promise(function(resolve, reject) {
            maiordomus.$connections = [];
            
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
                            'Connected to: ' +
                            maiordomus.$env + ' - ' +
                            address);
                        maiordomus.$connections.push(conn);
                        resolve();
                    });

                    conn.on('error', function (err) {
                        logger.error(maiordomus.$currentStep.name,
                            'Error connecting to: ' +
                            maiordomus.$env + ' - ' +
                            address);
                        logger.error(maiordomus.$currentStep.name, err.message);

                        reject(err);
                    });

                    conn.on('close', function () {
                        logger.info(maiordomus.$currentStep.name,
                            'Closing connection to address: ' + 
                            maiordomus.$env + ' - ' +
                            address);
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
            
        });
    }
};