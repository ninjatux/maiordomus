//# maiordomus.js
//**maiordomus.js** is an automation tool for devops and developers!
//It offers an easy way to manage remote multi server connections and an
//useful git api for code management.
var _ = require('lodash'),
    utils = require('./utils');

var MaiorDomus = function () {
    this.steps = [];
    this.flow = [];
    this.logger = require('./logger');
};

//## API
//### log(message)
//It's a wrapper around console.log that add metadata to logs
MaiorDomus.prototype.log = function (message) {
    this.logger.user(this.currentStep.name, message);
};

//### step(name, description, actions)
//Each step is defined by its name, a short description and an array of actions
MaiorDomus.prototype.step = function(name, description, actions) {
    
    var stepExist = utils._findStepByName(this.steps, name);

    if(stepExist) {
        throw new Error('step [' + name + ']' + ' is already defined');
    }
    
    this.steps.push({
        name: name,
        description: description,
        actions: actions
    });
    
    return this;
};

//### done([message])
//When called the action is considered concluded and maiordomus
//call the next one (if any)
MaiorDomus.prototype.done = function(message) {
    this.logger.info(this.currentStep.name, message || 'Action terminated');
    
    var nextStep = this.flow.shift();
    this.currentStep = nextStep;

    if(nextStep) {
        nextStep.action.call(this);
    }
};

//### start(config, environment, task, [stepName])
//Used by the bin script to start the flow execution
MaiorDomus.prototype.start = function (config, environment, task, stepName) {
    var maiordomus = this;

    // Used for debug
    maiordomus.config = config;
    maiordomus.env = environment;
    maiordomus.task = task;
    maiordomus.stepName = stepName;

    var step = stepName ? maiordomus._findStepByName(stepName) : undefined;
    
    if(step) {
        maiordomus.flow = step.actions;
    } else {
        maiordomus.steps.forEach(function (step) {
            step.actions.forEach(function (action) {
                maiordomus.flow.push({
                    name: step.name,
                    action: action
                });
            });
        });
    }

    utils._flowStart(maiordomus);
};

module.exports = new MaiorDomus();