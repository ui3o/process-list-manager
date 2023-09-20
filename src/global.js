const { spawn, spawnSync } = require('child_process');
const packageJson = require("../package.json");
const { ServicesStates } = require('./states');
const { term } = require('./term');
const fs = require('fs');
let LOG_FILE_ROOT = '/var/log/pol';
let LOG_FILE_PATH = `${LOG_FILE_ROOT}/pol.log`;
const cliRuns = {};
const execRuns = {};
// log setup
const TASK_INDENT = `        `;
const log = {
    write: console.log,
    log: console.log,
    warn: console.warn,
    err: console.err,
    end: () => { }
};


// log file setup
function cli(_cmd) {
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

const log_file = fs.createWriteStream(LOG_FILE_PATH, { flags: 'a' });


// TODO service state
process.env.TZ = process.env.TZ ? process.env.TZ : fs.readFileSync('/etc/timezone').toString().split('\n')[0];
const msgToLog = (message, level = 'outlog', service) => {
    const log = {
        time: new Date().ISOStrings(),
        level,
        service,
        message
    }
    log_file.write(`${JSON.stringify(log)}\n`);
}

// generate standard cli and toLog objects
const cliGenerator = (controller, bindObject, type) => {
    Object.defineProperty(controller.cli, 'noErr', {
        get: function () { global.service.__prop__.noErr = true; return controller.cli; }
    });
    Object.defineProperty(controller.cli, 'splitByLine', {
        get: function () { global.service.__prop__.splitByLine = true; return controller.cli; }
    });
    Object.defineProperty(controller.cli, 'splitAll', {
        get: function () { global.service.__prop__.splitAll = true; return controller.cli; }
    });
    controller.cli.wd = (wd = '') => { global.service.__prop__.cwd = wd; return controller.cli; };
    controller.cli.eol = (eol = '') => { global.service.__prop__.eol = eol; return controller.cli; };
    controller.cli.do = function (_cmd) {
        return cliDo([...arguments], this)
    }
    controller.toLog = function (str) {
        msgToLog(str);
    }
    // bind service name
    controller.toLog = controller.toLog.bind({ ...bindObject, type, controller });
    controller.cli.do = controller.cli.do.bind({ ...bindObject, type, controller });
}

// generate standard exec and toLog objects
const execGenerator = (controller, bindObject, type) => {
    Object.defineProperty(controller.exec, 'it', {
        get: function () { global.service.__prop__.it = true; return controller.exec; }
    });

    controller.exec.wd = (wd = '') => { global.service.__prop__.cwd = wd; return controller.exec; };
    controller.exec.do = function (_cmd) {
        return execDo([...arguments], this)
    }
    // bind service name
    controller.exec.do = controller.exec.do.bind({ ...bindObject, type, controller });
}

const execDo = (cmd, setup) => {
    const prog = cmd.shift();
    const params = [...cmd];
    const timestamp = new Date().getTime();
    const caller = new Error().stack.split("at ")[3].split(' ')[0].split('.')[1];
    let options = { ...global.service.__prop__ };
    global.service.__prop__ = {};
    const env = {
        ...process.env,
        POL_CL_ENV: `__POL_CL__${prog}__${timestamp}__EXEC__POL_CL__`
    }

    //  todo multiple exec not allowed
    const spawnCmd = spawn(prog, params, { encoding: 'utf-8', cwd: options.cwd, env, stdio: options.it ? 'inherit' : undefined });
    const promise = new Promise(res => {
        if (!options.it) {
            spawnCmd.stdout.on('data', data => {
                msgToLog(data, 'outexe');
            });
            spawnCmd.stderr.on('data', data => {
                msgToLog(data, 'errexe');
            });
        }
        spawnCmd.on('close', (c) => {
            delete execRuns[setup.name][caller];
            res(c);
        });
    });
    execRuns[setup.name] = { onStart: {}, onStop: {}, onLogin: {}, ...execRuns[setup.name] };
    execRuns[setup.name][caller] = { prog, params, promise, options, timestamp };
    return promise;
}

const cliDo = (cmd, setup) => {
    const lines = [];
    const prog = cmd.shift();
    const params = [...cmd];
    const timestamp = new Date().getTime();
    const caller = new Error().stack.split("at ")[3].split(' ')[0].split('.')[1];
    let options = { ...global.service.__prop__ };
    global.service.__prop__ = {};
    const env = {
        ...process.env,
        POL_CL_ENV: `__POL_CL__${prog}__${timestamp}__CLI__POL_CL__`
    }
    if (ServicesStates.isDownState(setup.name) && caller === "onStart")
        return Promise.resolve();
    const spawnCmd = spawn(prog, params, { encoding: 'utf-8', cwd: options.cwd, env });
    cliRuns[setup.name] = { onStart: {}, onStop: {}, onLogin: {}, ...cliRuns[setup.name] };
    // cliRuns[setup.type][timestamp] = { prog, params };
    cliRuns[setup.name][caller][timestamp] = { prog, params };
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
            delete cliRuns[setup.name][caller][timestamp];
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

global.service = {
    set setup(setup) {
        const _setup = {
            ...setup,
            name: (new Error().stack.split("at ")[2]).trim().split('.js:')[0].replace(/.*\//, ''),
            ssOnStart: {
                cli: {},
                exec: {}
            },
            ssOnStop: {
                cli: {}
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
        ServicesStates.init(_setup.name);
        global[_setup.name] = _setup;
    },
    __prop__: {},
}

module.exports.cliRuns = cliRuns;
module.exports.execRuns = execRuns;
module.exports.msgToLog = msgToLog;
module.exports.cliSplitByLine = function (cmd) {
    const _cmd = [...arguments];

    const spawnCmd = spawn(_cmd.shift(), [..._cmd], { encoding: 'utf-8' });
    return new Promise(res => {
        let _out = '';
        spawnCmd.stdout.on('data', data => {
            _out += data;
        });
        spawnCmd.stderr.on('data', data => {
            _out += data;
        });
        spawnCmd.on('close', (c) => {
            const _lines = _out.split('\n').filter(l => l);
            res({ o: _lines, c });
        });
    });
};

const logFile = {
    write: msgToLog,
    end: () => { }
};
console.log = console["log"].bind(global.console, TASK_INDENT);
console.warn = console["warn"].bind(global.console, TASK_INDENT);
console.error = console["error"].bind(global.console, TASK_INDENT);
module.exports.TASK_INDENT = TASK_INDENT;
module.exports.log = log;
module.exports.logFile = logFile;



// Date overrides
Date.prototype.ISOStrings = function () {
    const tzo = -this.getTimezoneOffset();
    const dif = tzo >= 0 ? '+' : '-';
    const pad = function (num) {
        return (num < 10 ? '0' : '') + num;
    };
    const zone = dif + pad(Math.floor(Math.abs(tzo) / 60)) + ':' + pad(Math.abs(tzo) % 60)
    this.setTime(this.getTime() + (tzo * 60 * 1000));
    return this.toISOString().replace('Z', zone);
}