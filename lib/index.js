//#Maiordomus

// Copyright (C) 2014 Valerio Barrila
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
var _ = require('lodash'),
    Promise = require('bluebird'),
    utils = require('./utils'),
    logger = require('./logger');

//##Maiordomus
//Maiordomus expose a public chainable API and a private one.
//Private methods and properties starts with a dollar sign ('$'), they are not
//intended to be used.
var MaiorDomus = function () {
    //Adding methods of core api
    this.$addMethods(require('./api'));
    //Maiordomus uses 3 containers for keeping track of the current flow:
    //* steps container
    //* actions container
    //* flow container
    this.$steps = [];
    this.$actions = [];
    this.$flow = [];
    return this;
};

//####step(name, actions)
//Allow to define a new step. Steps are executed in the same order as they are defined.
MaiorDomus.prototype.step = function(name, actions) {
    var stepExist = utils.findStepByName(this.$steps, name);
    //Steps with the same name can not exists
    if(stepExist) {
        throw new Error('Step [' + name + ']' + ' is already defined');
    }
    //Push the current step to the step list
    this.$steps.push({
        name: name,
        actions: actions
    });
    return this;
};

//####done([message])
//Used to start the execution fo an action's flow of instructions
MaiorDomus.prototype.done = function (message) {
    var maiordomus = this;
    //Executes all the promises of the current flow sequentially
    Promise.each(this.$flow, function (el) {
        return el.handler(el.args, maiordomus);
    })
    //Close the current flow and call the next one
    .then(function () {
        logger.log(maiordomus.$currentStep.name, message || 'Done.');
        maiordomus.$flow = [];
        maiordomus.$next();
    })
    //Catch the errors and block the flow execution if any
    .catch(function (err) {
        logger.error(maiordomus.$currentStep.name, 'MaiorDomus flow interrupted, closing process');
        logger.error(maiordomus.$currentStep.name, err.message);
        maiordomus.$closeConnections();
        process.exit(1);
    });
};

//####loadModule(module);
//Allow to add user custom module to MaiorDomus API
MaiorDomus.prototype.loadModule = MaiorDomus.prototype.$addMethods;

//###Private API
//####$start(config, environment, task, stepName)
//
MaiorDomus.prototype.$start = function(config, environment, task, stepName) {
    //TODO remove unused properties
    this.$config = config;
    this.$env = environment;
    this.$task = task;
    this.$stepName = stepName;
    this.step = null; // Remove step function to avoid bad usage inside actions
    this.$flowStart();
};

MaiorDomus.prototype.$flowStart = function() {
    // get step by name (if exists)
    var step;

    if (this.$stepName) {

        step = utils.findStepByName(this.$steps, this.$stepName);
        this.$steps = [];
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
    } else {
        this.$closeConnections();
        logger.info('MaiorDomus', 'No more steps, closing...');
        process.exit(0);
    }
};

MaiorDomus.prototype.$next = function() {
    var action = this.$actions.shift();
    if (action) {
        action.call(this);
    } else {
        this.$flowStart();
    }
};

MaiorDomus.prototype.$closeConnections = function () {
    _.each(this.$sshSessions, function (conn) {
        conn.end();
    });
    this.$sshSessions = [];
};

//##Class methods
//parse an API definition and add create the relative methods for Maiordomus
MaiorDomus.prototype.$addMethods = function (api) {
    _.each(_.functions(api), function (method) {
        var args = [];
        this[method] = function () {
            //Each call to a module function simply add the operation to the current flow.
            //Flow is started when the 'done' function is called.
            _.each(arguments, function (argument) {
                args.push(utils.transform(argument, this.$env, this.$config));
            }, this);
            this.$flow.push({
                handler: api[method],
                args: args,
                maiordomus: this
            });
            return this;
        };
    }, this);   
};

module.exports = new MaiorDomus();