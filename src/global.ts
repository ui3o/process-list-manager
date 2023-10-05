import { spawn } from 'child_process';
import fs from 'fs';
import packageJson from "../package.json";
import { POL_SETUP, POL_SETUP_START, POL_SETUP_STOP, pol } from './daemon';
import { LOG_FILE_PATH, LOG_FILE_ROOT, log, msgToLog } from './logger';
import { cliSplitByLineSync } from './spawn';
import { term } from './term';
import { zshCompletionInit } from './pol.client';

if (!fs.existsSync(LOG_FILE_PATH)) {
    try {
        fs.accessSync(LOG_FILE_ROOT, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
    } catch (error) {
        log.log(`[${term.fc.red}REQUIRED${term.mc.resetAll}] Please create '/var/log/pol' folder with 'rw' access for the running user!`);
        process.exit(1);
    }
    cliSplitByLineSync(`touch`, LOG_FILE_PATH);
}

// zsh plugin setup
const polPluginFolder = `${process.env.ZSH}/custom/plugins/pol`;
const polPluginVersion = `${polPluginFolder}/pol.plugin.${packageJson.version}.version`;
if (process.env.ZSH && process.env.ZSH.endsWith('.oh-my-zsh') && !fs.existsSync(polPluginVersion)) {
    cliSplitByLineSync(`touch`, polPluginVersion);
    zshCompletionInit();
}

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
    controller.cli.gid = (gid = '') => { globalThis.service.__prop__.gid = gid; return controller.cli; };
    controller.cli.uid = (uid = '') => { globalThis.service.__prop__.uid = uid; return controller.cli; };
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

    controller.exec.gid = (gid = '') => { globalThis.service.__prop__.gid = gid; return controller.exec; };
    controller.exec.uid = (uid = '') => { globalThis.service.__prop__.uid = uid; return controller.exec; };
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

    if (options.gid) {
        const gid = cliSplitByLineSync('id', '-g', `${options.gid}`);
        options.gid = !gid.c ? Number(gid.o[0]) : undefined;
    }

    if (options.uid) {
        const uid = cliSplitByLineSync('id', '-u', `${options.uid}`);
        options.uid = !uid.c ? Number(uid.o[0]) : undefined;
    }

    const spawnCmd = spawn(prog!, params, { cwd: options.cwd, env, stdio: options.it ? 'inherit' : undefined, gid: options.gid, uid: options.uid });
    const promise = new Promise(res => {
        if (!options.it) {
            spawnCmd.stdout?.on('data', data => {
                msgToLog(data.toString(), 'outexe');
            });
            spawnCmd.stderr?.on('data', data => {
                msgToLog(data.toString(), 'errexe');
            });
        }
        spawnCmd.on('close', (c) => {
            res(c);
            pol.delExec(serviceName, funcName!);
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

    if (options.gid) {
        const gid = cliSplitByLineSync('id', '-g', `${options.gid}`);
        options.gid = !gid.c ? Number(gid.o[0]) : undefined;
    }

    if (options.uid) {
        const uid = cliSplitByLineSync('id', '-u', `${options.uid}`);
        options.uid = !uid.c ? Number(uid.o[0]) : undefined;
    }

    const spawnCmd = spawn(prog!, params, { cwd: options.cwd, env, gid: options.gid, uid: options.uid });
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
            pol.delCli(serviceName, funcName!, timestamp);
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
