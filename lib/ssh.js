'use strict';

var Connection = require('ssh2'),
    logger = require('./logger'),
    Promise = require('bluebird');

var SSH = function () {};

SSH.prototype.connect = function(config, stepName) {
    logger.debug(stepName, 'SSH connect');
    logger.debug(stepName, JSON.stringify(config));

    return new Promise(function (resolve, reject) {
        if (typeof config.host === 'string') {
            var options = {
                host: config.host,
                port: config.port || 22,
                username: config.username
            };

            if (config.password) {
                options.password = config.password;
            } else if (config.privateKey) {
                options.privateKey = config.privateKey;
            }

            var conn = new Connection(options);

            conn.on('ready', function () {
                logger.info(stepName, 'Maiordomus succesfully connected to: ' +
                    options.host);
                resolve(conn);
            }).on('error', function (err) {
                logger.error(stepName, 'Error while connecting to: ' +
                    options.host);
                reject(err);
            });
        }
    });
};

module.exports = SSH;