import fs from 'fs';
import { POL_LOGGER } from './daemon';

// log setup
export const TASK_INDENT = `        `;
export const LOG_FILE_ROOT = '/var/log/pol';
export const LOG_FILE_PATH = `${LOG_FILE_ROOT}/pol.log`;
let log_file: fs.WriteStream | undefined = undefined;

export const logFileInit = () => {
    log_file = fs.createWriteStream(LOG_FILE_PATH, { flags: 'a' });
}

export const msgToLog = (message: string, level = 'outlog', service?: string) => {
    const log = {
        time: new Date().ISOStrings(),
        level,
        service,
        message
    }
    log_file?.write(`${JSON.stringify(log)}\n`);
}

export const log: POL_LOGGER = {
    write: console.log,
    log: console.log,
    warn: console.warn,
    err: console.error,
    end: () => { }
};

export const logFile: POL_LOGGER = {
    write: msgToLog,
    log: () => { },
    warn: () => { },
    err: () => { },
    end: () => { }
};

console.log = console["log"].bind(global.console, TASK_INDENT);
console.warn = console["warn"].bind(global.console, TASK_INDENT);
console.error = console["error"].bind(global.console, TASK_INDENT);

declare global {
    interface Date {
        ISOStrings: () => string
    }
}

// Date overrides
Date.prototype.ISOStrings = function () {
    const tzo = -this.getTimezoneOffset();
    const dif = tzo >= 0 ? '+' : '-';
    const pad = function (num: number) {
        return (num < 10 ? '0' : '') + num;
    };
    const zone = dif + pad(Math.floor(Math.abs(tzo) / 60)) + ':' + pad(Math.abs(tzo) % 60)
    this.setTime(this.getTime() + (tzo * 60 * 1000));
    return this.toISOString().replace('Z', zone);
}
