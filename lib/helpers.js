var _ = require('lodash');

module.exports = {
    _findStepByName: function (steps, name) {
        return _.find(steps, function (step) {
            return step.name === name;
        });
    },

    _flowStart: function(maiordomus) {
        var step = maiordomus._flow.shift();
        maiordomus.currentStep = step;
        step.action.call(maiordomus);
    },

    _getTime: function() {
        var currentDate = new Date();
        var prefix = '['
            + currentDate.getHours()
            + ":"
            + currentDate.getMinutes()
            + ":"
            + currentDate.getSeconds()
            + ']';
        return prefix.bold.cyan;
    },

    _getLoggerName: function(stepName) {
        var loggerName = stepName + ' => ';
        return loggerName.bold.grey;
    },

    _checkRepoCOnfig: function(config, stepName) {

    }
}