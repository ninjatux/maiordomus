'use strict';

var _ = require('lodash'),
    logger = require('./logger');

module.exports = {
    //check if a step with the given name already exists
    findStepByName: function findStepByName(steps, name) {
        return _.find(steps, function(step) {
            return step.name === name;
        });
    },
    //extend user inputs with config content
    transform: function transform(content, env, conf) {
        return _.template(content,
            _.merge(conf.variables, conf.environments[env].variables));
    },
    //logs an user message
    userLog: function userLog(stepName, log) {
        if (typeof log === 'string') {
            logger.user(stepName, log);
        }
    },
    //checks ssh configuration options
    checkSSHConfig: function checkSSHConfig(config) {
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
    },
    //cheks if any active ssh session exist
    hasSessions: function hasSessions(maiordomus) {
        if (maiordomus.$sshSessions && maiordomus.$sshSessions.length) {
            return true;
        }
        return false;
    },
    //utility function for logging inside ssh related methods
    sshLogger: function sshLogger(level, stepName, address, env, message, err) {
        var sshLogTemplate = _.template('[<%= env %> - <%= address %>] <%= message %>');
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
};