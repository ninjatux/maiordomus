//#Maiordomus

'use strict';
var fs = require('fs'),
    path = require('path'),
    _ = require('lodash'),
    Promise = require('bluebird'),
    logger = require('./logger');

/* utility functions */
// check if a step with the given name already exists
function findStepByName(steps, name) {
    return _.find(steps, function(step) {
        return step.name === name;
    });
}
// fill user inputs with config content
function transform(content, env, conf) {
    return _.template(content,
        _.merge(conf.variables, conf.environments[env].variables));
}

/* Maiordomus*/
var MaiorDomus = function () {
    // Maiordomus uses 3 containers for keeping track of the current flow
    this.$steps = []; // steps container
    // 
    this.$actions = [];
    // conatins the flow for the current action
    this.$flow = [];
    return this;
};

var modulesFolder = path.resolve(__dirname, 'modules');

_.each(fs.readdirSync(modulesFolder), function (moduleFile) {
    var module = require(path.resolve(modulesFolder, moduleFile));
    _.each(_.functions(module), function (method) {
        var args = [];
        MaiorDomus.prototype[method] = function () {
            _.each(arguments, function (argument) {
                args.push(transform(argument, this.$env, this.$config));
            });
            this.$flow.push({
                module: moduleFile,
                method: method,
                args: args,
                maiordomus: this
            });
            return this;
        };
    });
});

MaiorDomus.prototype.done = function (message) {
    var maiordomus = this;

    Promise.each(this.$flow, function (el) {
        return require('./modules/' +
            el.module)[el.method](el.args, maiordomus);
    }).then(function () {
        logger.log(maiordomus.$currentStep.name, message || 'Done.');
        maiordomus.$flow = [];
        maiordomus.$next();
    }).catch(function (err) {
        logger.error(maiordomus.$currentStep.name, 'MaiorDomus flow interrupted, closing process');
        // log error
        maiordomus.$closeConnections();
        process.exit(1);
    });
};
// TODO add method for running checks, with timeouts and number of retries
// TODO make this callable inside actions (insertNext, insertLast)
MaiorDomus.prototype.step = function(name, actions /*, description */) {

    var stepExist = findStepByName(this.$steps, name);

    if(stepExist) {
        throw new Error('Step [' + name + ']' + ' is already defined');
    }

    this.$steps.push({
        name: name,
        actions: actions /*,
        description: description */
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
    this.step = null; // Remove step function to avoid bad usage inside actions
    this.$flowStart();
};

MaiorDomus.prototype.$flowStart = function() {
    // get step by name (if exists)
    var step;

    if (this.$stepName) {

        step = findStepByName(this.$steps, this.$stepName);
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

module.exports = new MaiorDomus();
