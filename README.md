#Description
**Maiordomus** allow to define multiple operation flows that can be executed locally or on one or many remote machines simultaneously.
Check the project [maiordomus-examples](https://github.com/NinjaTux/maiordomus-examples) for real world examples.

##Requirements
To run it needs OpenSSH and node in the local machine and an OpenSSH server in the remote ones.

##Usage
Maiordomus can be launched from the command using the following arguments:

* **environment**, mandatory, used to select the environment to work on. Environment must be present in the config file.
* **task**, mandatory, used to choose wich task to perform on the given environment. Task must be defined in the maiordomus folder.
* **step**, optional, used to specify wich step to execute, otherwise all the steps will be in the way they are defined.

###Setup
Maiordomus expects to find a *maiordomus* folder on the root of your project containing a configuration file called **config.js** and tasks files. Eg:

```
myAwesomeWebApp
----maiordomus
--------config.js
--------task.js
----server.js
----package.json
```

####Configuration file
This is an example of comnfiguration file:

```js
/* MaiorDomus configuration */
module.exports = {
    environments: {
    	// environment name
        production: {
        	// list of hosts that compose the environment
            host: ['production.01', 'production.02'],
            // SSH port used to connect
            port: 2222,
            // Username used to connect
            username: 'ec2-user',
            // Private key used for authentication
            privateKey: require('fs').readFileSync('/path/to/key')
        }
    }
};

```

####Tasks files
Task are used to define one or more steps. Take a look at this simple task:

```js
// Require maiordomus
var geoffrey = require('maiordomus');

// Start defining the task and its steps sequentially
geoffrey
    // first step
    .step(
        'StopApplication', // Step name
        [ stopApplication ] // List of step actions
    ).step(
        'CleanAndStart', // Step name
        [ cleanLogs, startApplication ] // List of step actions
    );

// Function used in steps
function startApplication() {
    var maiordomus = this;
    maiordomus
        .connect()
        .exec('service myApp start')
        .done();
}

function stopApplication() {
    var maiordomus = this;
    maiordomus
        .connect()
        .exec('service myApp stop')
        .done();
}

function cleanLogs() {
    var maiordomus = this;
    maiordomus
        .connect()
        .exec('rm -f /logs/myApp/*.log')
        .done();
}

//Export the task
module.exports = geoffrey;
```

The task is pretty self explanatory, check [this repo](https://github.com/NinjaTux/maiordomus-examples) for more real world examples.
Actions needs to use the maiordomus API to let the main application manage the steps and actions flow in the right order.

##API
Currently Maiordomus provide different API if it's used inside an action or inside the body of a task.
Inside a task it just provide the **step** method that allow you to define a list of steps, all the other methods are available inside the actions

###step(stepName *<String>*, actions *<Array>*)
