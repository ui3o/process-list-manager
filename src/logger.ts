import fs from 'fs';

export const LOG_FILE_ROOT = '/var/log/pol';
export const LOG_FILE_PATH = `${LOG_FILE_ROOT}/pol.log`;

const log_file = fs.createWriteStream(LOG_FILE_PATH, { flags: 'a' });

export const msgToLog = (message: string, level = 'outlog', service?: string) => {
    const log = {
        time: new Date().ISOStrings(),
        level,
        service,
        message
    }
    log_file.write(`${JSON.stringify(log)}\n`);
}