var _ = require('lodash'),
    Promise = require('bluebird'),
    helpers = require('./helpers'),
    logger = require('./logger');

var MaiorDomus = function () {
    this.$steps = [];
    this.$actions = [];
    this.$flow = [];
    return this;
};

// Public API
var api = {
    base: ['log'],
    cmd: ['mkdirp', 'exec'],
    git: ['clone'],
    ssh: ['connect']
};

_.forIn(api, function (methods, module) {
    _.each(methods, function (method) {
        MaiorDomus.prototype[method] = function () {
            this.$flow.push({
                module: module,
                method: method,
                args: arguments,
                maiordomus: this
            });
            return this;
        };
    });
});

MaiorDomus.prototype.done = function (message) {
    var maiordomus = this;

    Promise.each(this.$flow, function (el) {
        return require('../modules/' + el.module)[el.method](el.args, maiordomus);;
    }).then(function () {
        logger.log(maiordomus.$currentStep.name, message || 'Done.');
        maiordomus.$flow = [];
        maiordomus.$flowStart();
    });
};

MaiorDomus.prototype.step = function(name, description, actions) {
    
    var stepExist = helpers._findStepByName(this.$steps, name);

    if(stepExist) {
        throw new Error('step [' + name + ']' + ' is already defined');
    }
    
    this.$steps.push({
        name: name,
        description: description,
        actions: actions
    });
    
    return this;
};

// Private API
MaiorDomus.prototype.$start = function(config, environment, task, stepName) {
    //TODO remove unused properties
    this.$config = config;
    this.$env = environment;
    this.$task = task;
    this.$stepName = stepName;
    this.$flowStart();
};

MaiorDomus.prototype.$flowStart = function() {
    // get step by name (if exists)
    var step;

    if (this.$stepName) {

        step = helpers._findStepByName(this.$steps, this.$stepName);
        this.$stepName = null;

        if (!step) {
            throw new Error('Step not found');
        }
    } else {
        step = this.$steps.shift();
    }

    if (step) {
        this.$currentStep = step;

        var maiordomus = this;

        _.each(step.actions, function (action) {
            maiordomus.$actions.push(action);
        });

        var action = this.$actions.shift();

        action.call(this);
    }
};

module.exports = new MaiorDomus();