var logger = require('../logger'),
    Promise = require('bluebird');

module.exports = {
    log: function (message, maiordomus) {
        return new Promise(function (resolve, reject) {
            logger.user(maiordomus.$currentStep.name, message[0].toString());
            resolve();
        });
    }
};