'use strict';
const execSync = require('child_process').execSync;
const R = require('ramda');
const config = execSync('git config -l').toString().split('\n')
.map(R.split('='))
.reduce((o, $) => $[1] ? R.assocPath($[0].split('.'), $[1].trim(), o) : o, {})


module.exports = config;