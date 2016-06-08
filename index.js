#!/usr/bin/env node
'use strict';
const config = require('./config.js');
const https = require('https');
const program = require('commander');
const current = {
    branch: require('child_process').execSync('git rev-parse --abbrev-ref HEAD').toString().trim(),
};

//console.log(config);
let match;
if (!(config.user && config.user.username && config.user.token)) throw new Error('must set user.username and user.token in git config');
if (!(config.gitflow && config.gitflow.develop)) throw new Error('must set gitflow.develop in git config');
if (config.remote && config.remote.origin && config.remote.origin.url &&
    ((match = config.remote.origin.url.match(/https:\/\/github\.com\/([^\/]+)\/([^\/]+)\.git/)) ||
        (match = config.remote.origin.url.match(/git@github.com:([^\/]+)\/([^\/]+)\.git/)))) {
    current.owner = match[1];
    current.repo = match[2];
} else {
    throw new Error('must have a github origin');
}


program
  .version('1.0.0')
  .command('pulls <action>')
  .option("--title <title>", '', current.branch)
  .option("--head <head>", '', current.branch)
  .option("--base <base>", '', config.gitflow.develop)
  .option("--body <body>", '', '')
  .action(function (action, command) {
    const reqOptions = {
        auth: config.user.username + ':' + config.user.token,
        hostname: 'api.github.com',
        method: 'POST',
        headers: {
            'User-Agent': 'git-hub-cli',
            'Content-Type': 'application/json',
        }
    }
    if (action === 'create') {
        reqOptions.path = `/repos/${current.owner}/${current.repo}/pulls`;
        const postData = command.opts();
        const request = https.request(reqOptions, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                body = JSON.parse(body);
                console.log(body);
            })
        });
        request.write(JSON.stringify(postData));
        request.end();
    } else {
        throw new Error(`Unkown action: ${action}`)
    }
  });

program.parse(process.argv);