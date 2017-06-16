'use strict';
import { execSync } from 'child_process';
import * as R from 'ramda';

export interface configs {
    user?: {
        username?: string
        token?: string
    }
    gitflow?: {
        develop?: string
    }
    remote?: {
        origin?: {
            url?: string
        }
    }
    current_issue_url?: string
    hub?: {
        issue: {
            url: string
            title: string
            owner: string
            repo: string
            number: string
        }
    }
}

export const config: configs = (execSync('git config -l') as Buffer).toString().split('\n')
.map(R.split('='))
.reduce((o, $) => $[1] ? R.assocPath($[0].split('.'), $[1].trim(), o) : o, {}) as configs

