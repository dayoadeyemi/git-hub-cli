'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const R = require("ramda");
exports.config = child_process_1.execSync('git config -l').toString().split('\n')
    .map(R.split('='))
    .reduce((o, $) => $[1] ? R.assocPath($[0].split('.'), $[1].trim(), o) : o, {});
