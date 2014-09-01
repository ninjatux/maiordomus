#Description
**Maiordomus** is a command line application that allows to define multiple operation flows which can be executed locally or on one or many remote machines simultaneously.
Check the project [maiordomus-examples](https://github.com/NinjaTux/maiordomus-examples) for real use case.

<img src="https://raw.githubusercontent.com/NinjaTux/maiordomus/master/screenshot.png" alt="screenshot" />

##Requirements
To run it needs OpenSSH and node in the local machine and an OpenSSH server in the remote ones.

##Install
`npm install -g maiordomus`

##Usage
Maiordomus can be launched from the command line using the following arguments:

* **environment**, mandatory, used to select the environment to work on. Environment must exist in the config file.
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
This is an example of a configuration file:

```js
/* MaiorDomus configuration */
module.exports = {
    // List of all the possible vbariables used to enrich commands
    variables: {
        logMessage: 'Application deployed'
    },
    // List of all the possible environments
    environments: {
        staging: {
            // list of hosts that compose the environment
            host: ['staging'],
            // Username used to connect
            username: 'nodeuser',
            // Private key used for authentication
            privateKey: require('fs').readFileSync('/path/to/key'),
        },
    	// environment name
        production: {
        	// list of hosts that compose the environment
            host: ['production.01', 'production.02'],
            // SSH port used to connect
            port: 2222,
            // Username used to connect
            username: 'ec2-user',
            // Private key used for authentication
            privateKey: require('fs').readFileSync('/path/to/key'),
            // Define enviornment specif values for variables
            variables: {
                logMessage: 'Application deployed in production'
            }
        }
    }
};

```

####Tasks files
Tasks are used to define one or more steps. Take a look at this simple task:

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
        .done('<%= logMessage %>');
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

The task is pretty self explanatory, check [this repo](https://github.com/NinjaTux/maiordomus-examples) for more real use cases.
Actions need to use the _Maiordomus API_ to let the main application manage the steps and the actions flow in the right order; **done** must be called always at the end of each action.

####Templating
Maiorodmus uses the [lodash template syntax](http://lodash.com/docs#template) to enrich logs and commands passed to its API. It uses properties coming from the ```configuration.variables``` object extended with
environment specific ```variables``` object.

##API
Currently Maiordomus provides different API if it's used inside an action or inside the body of a task.
Inside a task it just provides the **step** method that allow you to define a list of steps, all the other methods are available inside actions.

* **step (stepName, actions)**, defines a step of the task. Every step needs to have a name and a list of one or more actions defined.
* **log (message)**, output ```message``` on the current console.
* **connect (_logMessage_)**, opens an SSH connection to all the hosts configured for the current environment. If *logMessage* is passed it will be printed before starting the connection attempt.
* **disconnect (_logMessage_)**, close all the current SSH connections opened with the current environment hosts.  If *logMessage* is passed it will be printed before starting the disconnect attempt.
* **exec (command)**, execute the given command on the remote machines or on the local one if no connections are openend. Eg:

```js
function mixedExecute() {
    var maiordomus = this;
    maiordomus
        // executed locally
        .exec('ls -la /var/wwww')
        .connect()
        // executed remotely
        .exec('ls -la /var/www')
        .disconnect()
        // executed locally
        .exec('ls -la /var/www')
        .done();
}
```
* **get (remotePath, localPath, _logMessage_)**, downloads a remote file located in a *remotePath* to *localPath* using an SFTP connection. If *logMessage* is passed it will be printed before the download attempt.
* **put (localPath, remotePath, _logMessage_)**, uploads a local file located in *localPath* to *remotePath* on remote machines. If *logMessage* is passed it will be printed before the download attempt.
* **done (_logMessage_)**, closes the current action flow. **Must be called** in order to let *Maiordomus* know that the flow is terminated. If *logMessage* is passed it will be printed instead of the default ```Done``` message.
