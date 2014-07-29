var colors = require('colors'),
    utils = require('../lib/helpers');

var Logger = function () {};

Logger.prototype.debug = function(stepName, message) {
    console.log(utils._getTime(), utils._getLoggerName(stepName), message.grey);
};

Logger.prototype.info = function(stepName, message) {
    console.log(utils._getTime(), utils._getLoggerName(stepName), message.white);
};

Logger.prototype.log = function(stepName, message) {
    console.log(utils._getTime(), utils._getLoggerName(stepName), message.green);
};

Logger.prototype.warn = function(stepName, message) {
    console.log(utils._getTime(), utils._getLoggerName(stepName), message.yellow);
};

Logger.prototype.error = function(stepName, message) {
    console.log(utils._getTime(), utils._getLoggerName(stepName), message.red);
};

Logger.prototype.user = function(stepName, message) {
    console.log(utils._getTime(), utils._getLoggerName(stepName), message.inverse);
};

module.exports = new Logger();