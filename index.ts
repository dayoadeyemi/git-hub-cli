#!/usr/bin/env node
'use strict';
import { config } from './config'
import * as https from 'https'
import * as program from 'commander'
import { spawnSync } from 'child_process'
import { spawn } from 'child_pty'
import { Readable } from 'stream'
import * as marked from 'marked'
import * as TerminalRenderer from 'marked-terminal'

marked.setOptions({
  renderer: new TerminalRenderer()
});

const current = {
  branch: require('child_process')
    .spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
    .toString()
    .trim(),
  owner: '',
  repo: '',
  issue_url: config.hub && config.hub.issue && config.hub.issue.url || '',
  issue_title: config.hub && config.hub.issue && config.hub.issue.title || ''
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

function repoReq(
  method: 'POST' | 'PATCH' | 'GET',
  resource: 'issues' | 'merges' | 'pulls',
  postData: { owner: string, repo: string },
  params = []
) {
  return new Promise<{
    html_url: string
    title: string
    body: string
  }>((resolve, reject) => {
    const reqOptions = {
      auth: config.user.username + ':' + config.user.token,
      hostname: 'api.github.com',
      method,
      headers: {
        'User-Agent': 'git-hub-cli',
        'Content-Type': 'application/json',
      },
      path: [
        '',
        'repos',
        postData.owner || current.owner,
        postData.repo || current.repo,
        resource
      ].concat(params).join('/'),
    }
    delete postData.repo
    const request = https.request(reqOptions, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        const json = JSON.parse(body);
        if (json.html_url) resolve(json)
        else reject(new Error(`Got "${json.message}" requesting ${reqOptions.path}, see ${json.documention_url} from more information`))
      })
    });
    if (method !== 'GET') request.write(JSON.stringify(postData));
    request.end();
  })
}

program
  .version('1.0.0')
  .usage('[options]')
  .command('pulls <action>')
  .option("--title <title>", 'The title of the pull request.', current.branch)
  .option("--head <head>", 'The name of the branch where your changes are implemented. For cross-repository pull requests in the same network, namespace head with a user like this: username:branch', current.branch)
  .option("--base <base>", 'The name of the branch you want the changes pulled into. This should be an existing branch on the current repository. You cannot submit a pull request to one repository that requests a merge to a base of another repository.', config.gitflow.develop)
  .option("--body <body>", 'The contents of the pull request.', '')
  .action(async function (action, command) {
    if (action === 'create') {
      repoReq('POST', 'pulls', command.opts())
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
  .action(async function (action, command) {
    if (action === 'create') {
      repoReq('POST', 'issues', command.opts())
    } else {
      throw new Error(`Unkown action: ${action}`)
    }
  })

program
  .command('merges <action>')
  .option("--head <head>", '', current.branch)
  .option("--base <base>", '', config.gitflow.develop)
  .action(async function (action, command) {
    if (action === 'create') {
      repoReq('POST', 'merges', command.opts())
    } else {
      throw new Error(`Unkown action: ${action}`)
    }
  });

function clearCurrentIssue(){
  spawnSync('git', ['config', '--global', '--unset-all', 'hub.issue.url'])
  spawnSync('git', ['config', '--global', '--unset-all', 'hub.issue.title'])
  spawnSync('git', ['config', '--global', '--unset-all', 'hub.issue.owner'])
  spawnSync('git', ['config', '--global', '--unset-all', 'hub.issue.repo'])
  spawnSync('git', ['config', '--global', '--unset-all', 'hub.issue.number'])
}

function setCurrentIssue(issue){
  clearCurrentIssue()
  spawnSync('git', ['config', '--global', '--add', 'hub.issue.url', issue.url])
  spawnSync('git', ['config', '--global', '--add', 'hub.issue.title', issue.title])
  spawnSync('git', ['config', '--global', '--add', 'hub.issue.owner', issue.owner])
  spawnSync('git', ['config', '--global', '--add', 'hub.issue.repo', issue.repo])
  spawnSync('git', ['config', '--global', '--add', 'hub.issue.number', issue.number])
}

function showMarkdown(doc: string){
  const s = new Readable()
  s.push(marked(doc))
  s.push(null)
  const cp = spawn('less', ['-R'], { stdio: ['pipe', 1, 2, 'ipc']})
  s.pipe(cp.stdin)
}

async function showIssue(issue_url){
    const match = issue_url.match(/github\.com\/(\w+)\/(\w+)\/issues\/(\d+)$/)
    if (!match){
      throw new Error('Not a vaild git hub issue url')
    }
    const [url, owner, repo, number] = match
    let title: string
    try {
      const json = await repoReq('GET', 'issues', { owner, repo }, [number])
      title = json.title
      showMarkdown(json.body)
      return { url, title, owner, repo, number }
    } catch (e) {
      throw new Error('Failed to get the issue from GitHub')
    }
}
program
  .command('start <issue_url>')
  .description('Set the active GitHUb issue url')
  .action(async function (issue_url, command) {
    const issue = await showIssue(issue_url)
    console.log('Current the issue is set to ' + issue.title)
    console.log('    https://api.github.com/' + issue.url)
    setCurrentIssue(issue)
  });

program
  .command('end')
  .description('Remove the active GitHUb issue')
  .action(function (action, command) {
    if (current.issue_title) console.log('Stopped working on ' + current.issue_title)
    else console.log('Not working on any issue')
    clearCurrentIssue()
  });

program
  .command('current')
  .description('Show the active GitHub issue')
  .action(async function (action, command) {
    if (current.issue_url) {
      const issue = await showIssue(current.issue_url)
      console.log('Current the issue is set to ' + issue.title)
      console.log('    https://api.github.com/' + issue.url)
    }
    else console.log('Not working on any issue')
  });
program.parse(process.argv);