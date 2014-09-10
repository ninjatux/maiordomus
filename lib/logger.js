var colors = require('colors');

//formatting functions
function getTime() {
    var currentDate = new Date();
    var prefix = '[' + currentDate.getHours() +
        ':' + currentDate.getMinutes() +
        ':' + currentDate.getSeconds() + ']';
    return prefix.bold.cyan;
}

function getLoggerName(stepName) {
    var loggerName = stepName + ' => ';
    return loggerName.bold.grey;
}

//logger functions
module.exports = {
    debug: function(stepName, message) {
        console.log(getTime(), getLoggerName(stepName), message.grey);
    },
    info: function(stepName, message) {
        console.log(getTime(), getLoggerName(stepName), message.green);
    },
    log: function(stepName, message) {
        console.log(getTime(), getLoggerName(stepName), message.white);
    },
    warn: function(stepName, message) {
        console.log(getTime(), getLoggerName(stepName), message.yellow);
    },
    error: function(stepName, message) {
        console.log(getTime(), getLoggerName(stepName), message.red);
    },
    user: function(stepName, message) {
        console.log(getTime(), getLoggerName(stepName), message.inverse);
    }
};