#Description
**Maiordomus** allow to define multiple operation flows that can be executed locally or on one or many remote machines simultaneously.
Check the project [maiordomus-examples](https://github.com/NinjaTux/maiordomus-examples) for real world examples.

##Requirements
To run it needs OpenSSH and node in the local machine and a OpenSSH server in the remote ones.

##Configuration
Maiordomus expects to find a *maiordomus* folder on the root of your project containing a configuration file called **config.js** and tasks files. Eg:
```
myAwesomeWebApp
    maiordomus
        config.js
        task.js
    server.js
    package.json
```
