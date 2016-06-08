#!/usr/bin/env node
'use strict';
const config = require('./config.js');
const https = require('https');
const program = require('commander');
const currentBranch = require('child_process').execSync('git rev-parse --abbrev-ref HEAD').toString();


if (!(config.user && config.user.username && config.user.token)) throw new Error('must set user.username and user.token in git config');
if (!(config.gitflow && config.gitflow.develop && config.user.token)) throw new Error('must set gitflow.develop in git config');
if (!(config.branch && config.gitflow.develop && config.user.token)) throw new Error('must set gitflow.develop in git config');

program
  .version('1.0.0')
  .command('pulls <action>')
  .option("--title <title>")
  .option("--head <head>", '', currentBranch)
  .option("--base <base>", '', config.gitflow.develop)
  .option("--body <body>", '', '')
  .action(function (action, command) {
    if (action === 'create') {
        console.log({
            hostname: 'api.github.com',
            method: 'POST',
            json: command.opts()
        })

    } else {
        throw new Error(`Unkown action: ${action}`)
    }
  });

program.parse(process.argv);