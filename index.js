#!/usr/bin/env node
'use strict';
const config = require('./config.js');
const https = require('https');
const program = require('commander');
const execSync = require('child_process').execSync;
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

/**
 *
 *
 * @param {Object} postData
 * @param {string} action
 * @param {?Array.<string>} params
 */
function repoReq(postData, action, params){
    const reqOptions = {
        auth: config.user.username + ':' + config.user.token,
        hostname: 'api.github.com',
        method: 'POST',
        headers: {
            'User-Agent': 'git-hub-cli',
            'Content-Type': 'application/json',
        }
    }
    reqOptions.path = ['', 'repos', current.owner, postData.repo || current.repo, action].concat(params || []).join('/');
    delete postData.repo
    // console.log(reqOptions)
    const request = https.request(reqOptions, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            body = JSON.parse(body);
            console.log(body.html_url||body);
        })
    });
    request.write(JSON.stringify(postData));
    request.end();
}

program
  .version('1.0.0')
  .usage('[options]')
  .command('pulls <action>')
  .option("--title <title>", '', current.branch)
  .option("--head <head>", '', current.branch)
  .option("--base <base>", '', config.gitflow.develop)
  .option("--body <body>", '', '')
  .action(function (action, command) {
    if (action === 'create') {
        repoReq(command.opts(), 'pulls')
    } else {
        throw new Error(`Unkown action: ${action}`)
    }
  });

program
  .command('issues <action>')
  .option("--title <title>", 'Required. The title of the issue.', current.branch)
  .option("--labels <labels>", '', [])
  .option("--body <body>", 'The contents of the issue.', '')
  .option("--repo <repo>", 'The repo for actions', '')
  .option("--assignees <assignees>", 'Logins for Users to assign to this issue. NOTE: Only users with push access can set assignees for new issues. Assignees are silently dropped otherwise.', [config.user.username])
  .action(function (action, command) {
    if (action === 'create') {
        repoReq(command.opts(), 'issues')
    } else {
        throw new Error(`Unkown action: ${action}`)
    }
  })

program
  .command('merges <action>')
  .option("--head <head>", '', current.branch)
  .option("--base <base>", '', config.gitflow.develop)
  .action(function (action, command) {
    if (action === 'create') {
        repoReq(command.opts(), 'merges')
    } else {
        throw new Error(`Unkown action: ${action}`)
    }
  });

program.parse(process.argv);