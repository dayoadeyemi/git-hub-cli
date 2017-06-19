#!/usr/bin/env node
'use strict';
import { config } from './config'
import * as https from 'https'
import * as program from 'commander'
import { spawnSync, execSync } from 'child_process'
import { spawn } from 'child_pty'
import { Readable } from 'stream'
import * as marked from 'marked'
import * as TerminalRenderer from 'marked-terminal'
import * as readline from 'readline'


function input(){
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.on('line', (answer) => {
      rl.close();
      resolve(answer)
    });
  })
}

marked.setOptions({
  renderer: new TerminalRenderer()
});

const current = {
  branch: execSync('git rev-parse --abbrev-ref HEAD')
    .toString()
    .trim(),
  owner: '',
  repo: '',
  issue_url: config.hub && config.hub.issue && config.hub.issue.url || '',
  issue_title: config.hub && config.hub.issue && config.hub.issue.title || ''
};

if (!(config.gitflow && config.gitflow.develop)) config.gitflow = { develop: 'master' }

let match;
if (config.remote && config.remote.origin && config.remote.origin.url &&
  ((match = config.remote.origin.url.match(/https:\/\/github\.com\/([^\/]+)\/([^\/]+)\.git/)) ||
    (match = config.remote.origin.url.match(/git@github.com:([^\/]+)\/([^\/]+)\.git/)))) {
  current.owner = match[1];
  current.repo = match[2];
} else {
  Object.defineProperties(current, {
    owner: { get(){ throw new Error('Must be in a repo with a github origin!'); } },
    repo: { get(){ throw new Error('Must be in a repo with a github origin!'); } },
  });
}

function repoReq(
  method: 'POST' | 'PATCH' | 'GET',
  resource: 'issues' | 'merges' | 'pulls',
  postData: { owner: string, repo: string },
  params = []
) {
  if (!(config.user && config.user.username && config.user.token)) {
    throw new Error('Must set user.username and user.token in git config or run `git hub init`');
  }
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
      res.on('data', (chunk) => body += chunk)
      res.on('error', reject)
      res.on('end', () => {
        let json
        try {
          json = JSON.parse(body);
        }
        catch (e){
          return reject('Failed to parse response from GitHub')
        }
        if (json.html_url) resolve(json)
        else reject(new Error(`Got "${json.message}", when attempting to ${method} on ${reqOptions.path}, see ${json.documentation_url} from more information ${json.errors?'\nErrors:\n'+JSON.stringify(json.errors, null,2):''}`))
      })
    });
    if (method !== 'GET') request.write(JSON.stringify(postData));
    request.end();
  })
}

function handleAsyc(fn: (...args) => Promise<any>){
  return (args) => fn.apply(this, args).catch(e => {
    console.log('[ERROR]')
    console.log(e)
  })
}

program
  .version('1.0.0')
  .usage('[options]')
  .command('pulls <action>')
  .option("--title <title>", 'The title of the pull request.', current.branch)
  .option("--head <head>", 'The name of the branch where your changes are implemented. For cross-repository pull requests in the same network, namespace head with a user like this: username:branch', current.branch)
  .option("--base <base>", 'The name of the branch you want the changes pulled into. This should be an existing branch on the current repository. You cannot submit a pull request to one repository that requests a merge to a base of another repository.', config.gitflow.develop)
  .option("--body <body>", 'The contents of the pull request.', `Enables ${current.issue_url}`)
  .action(handleAsyc(async function (action, command) {
    if (action === 'create') {
      const json = await repoReq('POST', 'pulls', command.opts())
      console.log(json.html_url)
    } else {
      throw new Error(`Unkown action: ${action}`)
    }
  }));

program
  .command('issues <action>')
  .option("--title <title>", 'Required. The title of the issue.', current.branch)
  .option("--labels <labels>", '', [])
  .option("--body <body>", 'The contents of the issue.', '')
  .option("--repo <repo>", 'The repo for actions', '')
  .option("--assignees <assignees>", 'Logins for Users to assign to this issue. NOTE: Only users with push access can set assignees for new issues. Assignees are silently dropped otherwise.', [config.user.username])
  .action(handleAsyc(async function (action, command) {
    if (action === 'create') {
      const json = await repoReq('POST', 'issues', command.opts())
      console.log(json.html_url)
    } else {
      throw new Error(`Unkown action: ${action}`)
    }
  }))

program
  .command('merges <action>')
  .option("--head <head>", '', current.branch)
  .option("--base <base>", '', config.gitflow.develop)
  .action(handleAsyc(async function (action, command) {
    if (action === 'create') {
      const json = await repoReq('POST', 'merges', command.opts())
      console.log(json.html_url)
    } else {
      throw new Error(`Unkown action: ${action}`)
    }
  }));

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
  .description('Set the active GitHub issue url')
  .action(handleAsyc(async function (issue_url, command) {
    const issue = await showIssue(issue_url)
    console.log('Current the issue is set to ' + issue.title)
    console.log('    https://api.github.com/' + issue.url)
    setCurrentIssue(issue)
  }));

program
  .command('end')
  .description('Remove the active GitHUb issue')
  .action(function (action, command) {
    if (current.issue_title) console.log('Stopped working on ' + current.issue_title)
    else console.log('Not working on any issue')
    clearCurrentIssue()
  });

program
  .command('show [issue_url]')
  .description('Show the active GitHub issue')
  .action(handleAsyc(async function (issue_url, command) {
    issue_url || current.issue_url
    if (issue_url) {
      const issue = await showIssue(current.issue_url)
      console.log('Current the issue is set to ' + issue.title)
      console.log('    https://api.github.com/' + issue.url)
    }
    else console.log('Not working on any issue')
  }));

program
  .command('init')
  .description('Initialize the git hub tool')
  .action(handleAsyc(async function (action, command) {
    console.log("  What is your GitHub Username?")
    const username = await input()
    console.log('  What is your GitHub Token?')
    console.log('  If you havent got one already you can generate one at:')
    console.log('      https://github.com/settings/tokens/new')
    console.log('  Just remember to enable the "repo" permission!')
    const token = await input()
    console.log('  By default, what branch are you going to target your pull requests to?')
    console.log('  Note using the option "--base <branch>" you can override this whenever you want!')
    const develop = await input()
    execSync(`git config --unset-all --global user.username`)
    execSync(`git config --add --global user.username ${username}`)
    execSync(`git config --unset-all --global user.token`)
    execSync(`git config --add --global user.token ${token}`)
    execSync(`git config --unset-all --global gitflow.develop`)
    execSync(`git config --add --global gitflow.develop ${develop}`)
    console.log('  You have been set up to use the git hub CLI!')
    console.log('  Now you can create pull requests assigned to issues with ease')
    console.log('  When you are working on an issue you can set it as the default')
    console.log('  Just type:-')
    console.log('      git hub start <url of issue>')
  }));
program.parse(process.argv);