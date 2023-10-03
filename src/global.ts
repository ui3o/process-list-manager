import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import packageJson from "../package.json";
import { POL_LOGGER, POL_SETUP, POL_SETUP_START, POL_SETUP_STOP, pol } from './daemon';
import { LOG_FILE_PATH, LOG_FILE_ROOT, msgToLog } from './logger';
import { term } from './term';


// log setup
export const TASK_INDENT = `        `;
export const log: POL_LOGGER = {
    write: console.log,
    log: console.log,
    warn: console.warn,
    err: console.error,
    end: () => { }
};


// log file setup
function cli(...args: string[]) {
    const cmd = [...arguments];
    spawnSync(cmd.shift(), [...cmd], { encoding: 'utf-8', stdio: 'ignore' });
}
if (!fs.existsSync(LOG_FILE_PATH)) {
    try {
        fs.accessSync(LOG_FILE_ROOT, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
    } catch (error) {
        log.log(`[${term.fc.red}REQUIRED${term.mc.resetAll}] Please create '/var/log/pol' folder with 'rw' access for the running user!`);
        process.exit(1);
    }
    cli(`touch`, LOG_FILE_PATH);
}

// zsh plugin setup
const polPluginFolder = `${process.env.ZSH}/custom/plugins/pol`;
const polPluginVersion = `${polPluginFolder}/pol.plugin.${packageJson.version}.version`;
if (process.env.ZSH && process.env.ZSH.endsWith('.oh-my-zsh') && !fs.existsSync(polPluginVersion)) {
    cli(`mkdir`, `-p`, `${polPluginFolder}`);
    cli(`touch`, polPluginVersion);
    cli(`cp`, `${__dirname}/../zsh-plugin/pol.plugin.zsh`, `${polPluginFolder}/pol.plugin.zsh`);
    cli(`cp`, `${__dirname}/../zsh-plugin/plugin.js`, `${polPluginFolder}/plugin.js`);
    log.log(`[${term.fc.green}  INFO  ${term.mc.resetAll}] .oh-my-zsh custom plugin installed. Please add 'pol' to enabled plugin list in '~/.zshrc' file.`);
}

// TODO service state
process.env.TZ = process.env.TZ ? process.env.TZ : fs.readFileSync('/etc/timezone').toString().split('\n')[0];


// generate standard cli and toLog objects
const cliGenerator = (controller: POL_SETUP_START | POL_SETUP_STOP, bindObject: any, type: any) => {
    Object.defineProperty(controller.cli, 'noErr', {
        get: function () { globalThis.service.__prop__.noErr = true; return controller.cli; }
    });
    Object.defineProperty(controller.cli, 'splitByLine', {
        get: function () { globalThis.service.__prop__.splitByLine = true; return controller.cli; }
    });
    Object.defineProperty(controller.cli, 'splitAll', {
        get: function () { globalThis.service.__prop__.splitAll = true; return controller.cli; }
    });
    controller.cli.wd = (wd = '') => { globalThis.service.__prop__.cwd = wd; return controller.cli; };
    controller.cli.eol = (eol = '') => { globalThis.service.__prop__.eol = eol; return controller.cli; };
    controller.cli.do = function () {
        return cliDo([...arguments], (this as POL_SETUP).serviceName!)
    }
    controller.toLog = function (str: string) {
        msgToLog(str);
    }
    // bind service name
    controller.toLog = controller.toLog.bind({ ...bindObject, type, controller });
    controller.cli.do = controller.cli.do.bind({ ...bindObject, type, controller });
}

// generate standard exec and toLog objects
const execGenerator = (controller: POL_SETUP_START, bindObject: any, type: any) => {
    Object.defineProperty(controller.exec, 'it', {
        get: function () { globalThis.service.__prop__.it = true; return controller.exec; }
    });

    controller.exec.wd = (wd = '') => { globalThis.service.__prop__.cwd = wd; return controller.exec; };
    controller.exec.do = function () {
        return execDo([...arguments], (this as POL_SETUP).serviceName!)
    }
    // bind service name
    controller.exec.do = controller.exec.do.bind({ ...bindObject, type, controller });
}

const execDo = (cmd: string[], serviceName: string) => {
    const prog = cmd.shift();
    const params = [...cmd];
    const timestamp = pol.getNanoSecTime();
    const funcName = new Error().stack?.split("at ")[3].split(' ')[0].split('.')[1];
    let options = { ...globalThis.service.__prop__ };
    globalThis.service.__prop__ = {};
    const env = {
        ...process.env,
        POL_CL_ENV: `__POL_CL__${prog}__${timestamp}__EXEC__POL_CL__`
    }

    //  multiple exec not allowed
    if (pol.isStateAfterDown(serviceName) || pol.get(serviceName).exec[funcName! as 'onStart' | 'onLogin'])
        return Promise.resolve();
    const spawnCmd = spawn(prog!, params, { cwd: options.cwd, env, stdio: options.it ? 'inherit' : undefined });
    const promise = new Promise(res => {
        if (!options.it) {
            spawnCmd.stdout?.on('data', data => {
                msgToLog(data, 'outexe');
            });
            spawnCmd.stderr?.on('data', data => {
                msgToLog(data, 'errexe');
            });
        }
        spawnCmd.on('close', (c) => {
            pol.delExec(serviceName, funcName!, timestamp);
            res(c);
        });
    });
    pol.addExec(serviceName, funcName!, timestamp, { prog, params, promise, options, timestamp })
    return promise;
}

const cliDo = (cmd: string[], serviceName: string) => {
    const lines: string[][] = [];
    const prog = cmd.shift();
    const params = [...cmd];
    const timestamp = pol.getNanoSecTime();
    const funcName = new Error().stack?.split("at ")[3].split(' ')[0].split('.')[1];
    let options = { ...globalThis.service.__prop__ };
    globalThis.service.__prop__ = {};
    const env = {
        ...process.env,
        POL_CL_ENV: `__POL_CL__${prog}__${timestamp}__CLI__POL_CL__`
    }
    if (pol.isStateAfterDown(serviceName) && funcName != "onStop")
        return Promise.resolve();
    const spawnCmd = spawn(prog!, params, { cwd: options.cwd, env });
    // cliRuns[setup.type][timestamp] = { prog, params };
    pol.addCli(serviceName, funcName!, timestamp, { prog, params });
    return new Promise(res => {
        let _out = '';
        spawnCmd.stdout.on('data', data => {
            _out += data;
        });
        spawnCmd.stderr.on('data', data => {
            if (!options.noErr) _out += data;
        });

        spawnCmd.on('close', (c) => {
            // delete cliRuns[setup.type][timestamp];
            pol.delCli(serviceName, funcName!, timestamp);
            if (options.splitAll || options.splitByLine) {
                const _lines = _out.split(options.eol ? options.eol : '\n').filter(l => l);
                if (options.splitByLine) res({ o: _lines, c });
                else {
                    _lines.forEach(l => lines.push(l.split(/[ \t]/)));
                    res({ o: lines, c });
                }
            }
            else
                res({ o: _out, c });
        });
    });
}

export interface CustomGlobal {
    service: any;
}

declare const globalThis: {
    service: any;
};


globalThis.service = {
    set setup(setup: POL_SETUP) {
        const _setup: POL_SETUP = {
            ...setup,
            serviceName: (new Error().stack?.split("at ")[2])?.trim().split('.js:')[0].replace(/.*\//, ''),
            ssOnStart: {
                cli: {},
                exec: {}
            },
            ssOnStop: {
                cli: {},
            },
            ssOnLogin: {
                cli: {},
                exec: {}
            }
        }
        // extend _setup
        cliGenerator(_setup.ssOnStart, _setup, "start");
        cliGenerator(_setup.ssOnStop, _setup, "stop");
        cliGenerator(_setup.ssOnLogin, _setup, "login");
        execGenerator(_setup.ssOnStart, _setup, "start");
        execGenerator(_setup.ssOnLogin, _setup, "login");
        pol.stateInit(_setup.serviceName!);
        pol.setSetup(_setup.serviceName!, _setup);
    },
    __prop__: {},
}

export const cliSplitByLine = function (...args: any[]) {
    const _cmd = [...arguments];

    const spawnCmd = spawn(_cmd.shift(), [..._cmd]);
    return new Promise<{ o: string[], c: number }>(res => {
        let _out = '';
        spawnCmd.stdout.on('data', data => {
            _out += data;
        });
        spawnCmd.stderr.on('data', data => {
            _out += data;
        });
        spawnCmd.on('close', (c: number) => {
            const _lines = _out.split('\n').filter(l => l);
            res({ o: _lines, c });
        });
    });
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