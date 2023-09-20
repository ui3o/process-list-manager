const { cliSplitByLine, cliRuns, execRuns, log, logFile, TASK_INDENT } = require('./global');
const { ServicesStates } = require('./states');
const { term } = require('./term');
const { serverCreate, clientCreate, serverCleanup } = require('./socket');
const fs = require('fs');
const os = require("os");

const POLD_RUNNING_MSG = `Another pol daemon is running!`;
const POSSIBLE_OPTIONS_MSG = `possible options: [--all|service_name.service]`;
const POL_CONFIG_FOLDER = process.env.POL_CONFIG_FOLDER ? [process.env.POL_CONFIG_FOLDER] : ["/etc/pol"];
POL_CONFIG_FOLDER.push(`${os.homedir()}/.config/pol`);
const envs = { ...process.env };

var PolDaemonRunning = false;

module.exports.pol = async (argv) => {
    let ServiceList, RunningServices = [], RunningProcesses = [], StoppedServices = [], Intervals = {},
        LoginServiceName, LoginService;

    const lookup = async () => {
        const _rs = await cliSplitByLine('find', ...POL_CONFIG_FOLDER, '-name', '*.service.js');
        const _loginService = await cliSplitByLine('readlink', `-e`, ...POL_CONFIG_FOLDER.map(f => `${f}/login.service.target.js`));
        const _polDaemonRunningCheck = await cliSplitByLine('sh', `-c`, `ps aux | grep ".*node.*pol.*boot$"`);
        PolDaemonRunning = _polDaemonRunningCheck.o.length < 2 ? false : true;
        _loginService.o.forEach(s => {
            LoginServiceName = s.split('/').pop().replace('.js', '');
        });
        const _uniqueServiceList = {};
        _rs.o.filter(r => !r.includes('No such file or directory')).map(r => {
            const name = r.split('/').pop().replace('.js', '');
            _uniqueServiceList[name] = {
                name: r.split('/').pop().replace('.js', ''),
                path: r
            }
        });
        // sort service list process by  name
        ServiceList = Object.values(_uniqueServiceList).sort((a, b) => {
            if (a.name.toUpperCase() < b.name.toUpperCase()) return -1;
            if (a.name.toUpperCase() > b.name.toUpperCase()) return 1;
            return 0;
        });

        const _proc = await cliSplitByLine('find', '/proc', '-maxdepth', '2', '-name', 'environ');
        const _running_envs = _proc.o.filter(e => {
            try {
                fs.accessSync(e, fs.constants.R_OK);
                return true;
            } catch (err) {
                return false;
            }
        });

        const _runningServices = {};
        for (const envFile of _running_envs) {
            try {
                const buffer = fs.readFileSync(envFile);
                const fileContent = buffer.toString();
                if (fileContent.includes("__POL__")) {
                    const subProcInfo = fileContent.split('__POL_CL__');
                    const procInfo = subProcInfo[1].split("__");
                    const _srvInfo = fileContent.split('__POL__');
                    const srvInfo = _srvInfo[1].split("__");
                    _runningServices[srvInfo[0]] = true;
                    RunningProcesses.push({
                        procId: envFile.split('/')[2],
                        procName: procInfo[0],
                        serviceName: srvInfo[0],
                        serviceStartTime: srvInfo[1]
                    });
                }
            } catch (error) { }
        }
        // sort running process by service name
        RunningProcesses = RunningProcesses.sort((a, b) => {
            if (a.serviceName.toUpperCase() < b.serviceName.toUpperCase()) return -1;
            if (a.serviceName.toUpperCase() > b.serviceName.toUpperCase()) return 1;
            return 0;
        });
        // sort running services by service name
        RunningServices = Object.keys(_runningServices).sort((a, b) => {
            if (a < b) return -1;
            if (a > b) return 1;
            return 0;
        });
        // require all service file
        for (const service of ServiceList) {
            require(service.path);
        }
        StoppedServices = [...ServiceList]
    }

    const startRunChecker = (serviceName, prePostState = "", state = "", msg = "", logger, resolve = undefined) => {
        Intervals[serviceName] = Intervals[serviceName] ? Intervals[serviceName] : {};
        Intervals[serviceName][state] = Intervals[serviceName][state] ? Intervals[serviceName][state] : {};

        let intervalTimeout = 500, interval = Intervals[serviceName][state];
        const runState = state.toLowerCase().includes("start") ? "start" : "stop";
        const runChecker = () => {
            if (cliRuns[serviceName] && cliRuns[serviceName][state] && Object.keys(cliRuns[serviceName][state]).length) {
                if (interval.id) {
                    logger.write(`         waiting ${prePostState} ${serviceName} ${runState} ...`);
                    interval.id = clearInterval(interval.id);
                    intervalTimeout = 2000;
                    interval.id = setInterval(runChecker, intervalTimeout);
                }
                return true; // have to start because there is a pending
            } else {
                if (interval.id) {
                    interval.id = clearInterval(interval.id);
                    logger.write(`[${term.fc.green}  OK  ${term.mc.resetAll}] ${serviceName} is ${msg} ...`);
                }
                if (resolve) resolve();
            }
        }

        if (runChecker()) {
            interval.id = setInterval(runChecker, intervalTimeout)
        }
    }

    const stopRunChecker = (serviceName, stage) => {
        const onStage = `on${stage}`, afterStage = `after${stage}`;

        if (Intervals[serviceName] && (Intervals[serviceName][onStage] || Intervals[serviceName][afterStage])) {
            const onInterval = Intervals[serviceName][onStage];
            const afterInterval = Intervals[serviceName][afterStage];

            if (onInterval) {
                onInterval.id = clearInterval(onInterval.id);
                if (global[serviceName].serviceStartResolver) global[serviceName].serviceStartResolver();
            }
            if (afterInterval) {
                afterInterval.id = clearInterval(afterInterval.id);
            }
        }
    }

    await lookup();

    // start process implementation
    const start = async (serviceName, logger, endLogger = true) => {
        if (!serviceName) return;
        if (!ServiceList.some(s => s.name === serviceName || serviceName === "--all")) {
            logger.write(POSSIBLE_OPTIONS_MSG);
            return;
        }
        const promiseAllService = [];

        return new Promise((resolve) => {
            for (const service of ServiceList) {
                if (serviceName !== "--all" && service.name !== serviceName) continue;

                let serviceStartResolver;
                const serv = global[service.name];
                promiseAllService.push(new Promise(r => serviceStartResolver = r));
                serv.serviceStartResolver = serviceStartResolver;
                ServicesStates.init(service.name);

                try {
                    if (serv.onLogin && service.name === LoginServiceName) {
                        if (serv.onLogin) LoginService = serv;
                    }
                    if (RunningServices.some(srvName => srvName === service.name)) {
                        logger.write(`[${term.fc.yellow} WARN ${term.mc.resetAll}] ${service.name} is already running ...`);
                        serviceStartResolver();
                        continue;
                    }
                    if (serv.onStart) {
                        process.env = {
                            ...envs,
                            POL: `__POL__${service.name}__${new Date().getTime()}__POL__`
                        };
                        logger.write(`[${term.fc.green}  OK  ${term.mc.resetAll}] start ${service.name} ...`);
                        serv.onStart(serv.ssOnStart).then(() => {
                            // TODO handle restart
                            // TODO handle if has pre started cli
                            startRunChecker(service.name, 'after', 'onStart', 'started', logFile);
                        });
                        startRunChecker(service.name, 'before', 'onStart', 'started', logger, serviceStartResolver);
                    }
                } catch (error) {
                    logger.write(`[${term.fc.red}FAILED${term.mc.resetAll}] start ${service.name} ...`);
                    logger.write(`        ${error.stack}`);
                    serviceStartResolver();
                }
            }
            Promise.all(promiseAllService).then(() => {
                logger.end();
                resolve(true);
            });
        });
    }

    // stop process implementation
    const stop = async (serviceName, logger) => {
        if (!ServiceList.some(s => s.name === serviceName || serviceName === '--all')) {
            logger.write(POSSIBLE_OPTIONS_MSG);
            return;
        }
        if (!RunningServices.some(srvName => srvName === serviceName) && serviceName !== '--all') {
            logger.write(`[${term.fc.yellow} WARN ${term.mc.resetAll}] ${serviceName} is already stopped ...`);
            return;
        }
        ServicesStates.setDownState(serviceName);
        if (serviceName === '--all') {
            for (const srv of ServiceList) {
                ServicesStates.setDownState(srv.name);
            }
        }

        const promiseAllService = [];
        return new Promise(async (resolve) => {
            for (const servName of RunningServices) {
                if (serviceName === '--all' || serviceName === servName) {
                    let serviceStopResolver, preStopResolver, postStopResolver;
                    const promiseAllPrePostStopDone = [new Promise(r => preStopResolver = r), new Promise(r => postStopResolver = r)];
                    const serv = global[servName];

                    const _stop = async () => {
                        let srv = "";
                        for (const p of RunningProcesses) {
                            if (p.serviceName === servName) {
                                stopRunChecker(servName, 'Start');
                                let headMsg = TASK_INDENT;
                                if (srv !== servName) {
                                    srv = servName;
                                    headMsg = `[${term.fc.green} STOP ${term.mc.resetAll}]`;
                                }
                                const { c } = await cliSplitByLine('kill', '-9', p.procId);
                                if (c == 0) {
                                    logger.write(`${headMsg} ${servName} service with proc/pid[${p.procName}/${p.procId}] ...`);
                                }
                            }
                        }
                    }
                    promiseAllService.push(new Promise(r => serviceStopResolver = r));
                    StoppedServices = StoppedServices.filter(s => s.name !== servName);
                    try {
                        if (serv.onStop) {
                            serv.ssOnStop.stopAll = async () => {
                                // TODO handle if has pre started cli
                                await _stop();
                                startRunChecker(servName, 'after', 'onStop', 'stopped', logger, postStopResolver);
                            };
                            serv.onStop(serv.ssOnStop);
                            startRunChecker(servName, 'before', 'onStop', 'stopped', logger, preStopResolver);
                        } else {
                            preStopResolver(); postStopResolver();
                            await _stop();
                        }

                        Promise.all(promiseAllPrePostStopDone).then(() => {
                            serviceStopResolver();
                        });
                    } catch (error) {
                        logger.write(`[${term.fc.red}FAILED${term.mc.resetAll}] stop ${service.name} ...`);
                        serviceStopResolver();
                    }
                }
            }
            if (serviceName === '--all') {
                for (const s of StoppedServices) {
                    logger.write(`[${term.fc.yellow} WARN ${term.mc.resetAll}] ${s.name} is already stopped ...`);
                }
            }
            Promise.all(promiseAllService).then(() => {
                logger.end();
                resolve();
            });
        });
    }

    switch (argv._[0]) {
        case "boot":
            if (PolDaemonRunning) {
                log.log(POLD_RUNNING_MSG);
                process.exit(1);
            }
            await serverCreate(async (msg, socket) => {

                switch (msg._[0]) {
                    case "stop":
                        if (!msg._.length || (msg._.length < 2 && !msg.all)) {
                            socket.write(POSSIBLE_OPTIONS_MSG);
                            socket.end();
                        } else {
                            await lookup();
                            await stop(msg._[1] ? msg._[1] : msg.all ? "--all" : null, socket);
                        }
                        break;
                    case "start":
                        if (!msg._.length || (msg._.length < 2 && !msg.all)) {
                            socket.write(POSSIBLE_OPTIONS_MSG);
                            socket.end();
                        } else {
                            await lookup();
                            await start(msg._[1] ? msg._[1] : msg.all ? "--all" : null, socket);
                        }
                        break;
                    case "restart":
                        if (!msg._.length || (msg._.length < 2 && !msg.all)) {
                            socket.write(POSSIBLE_OPTIONS_MSG);
                            socket.end();
                        } else {
                            await lookup();
                            const success = await stop(msg._[1] ? msg._[1] : msg.all ? "--all" : null, socket, false);
                            if (success) await start(msg._[1] ? msg._[1] : msg.all ? "--all" : null, socket);
                        }
                        break;
                }
            });
            await start("--all", log);
            if (LoginService && LoginService.onLogin) {
                const logout = async () => {
                    // only stop process if there was login
                    await lookup();
                    await stop("--all", log);
                    serverCleanup();
                }
                if (ServicesStates.isDownState(LoginService.name))
                    await logout();
                else {
                    process.env = {
                        ...envs,
                        POL: `__POL__${LoginService.name}__${new Date().getTime()}__POL__`
                    };
                    LoginService.onLogin(LoginService.ssOnLogin);
                    if (execRuns[LoginService.name]['onLogin']) {
                        execRuns[LoginService.name]['onLogin'].promise.then(async () => {
                            await logout();
                        });
                    } else {
                        await logout();
                    }
                }
            }
            break;
        case "completion":
            if (argv._[1] === 'zsh') {
                if (process.env.ZSH && process.env.ZSH.endsWith('.oh-my-zsh')) {
                    const polPluginFolder = `${process.env.ZSH}/custom/plugins/pol`;
                    await cliSplitByLine(`mkdir`, `-p`, `${polPluginFolder}`);
                    await cliSplitByLine(`cp`, `${__dirname}/../zsh-plugin/pol.plugin.zsh`, `${polPluginFolder}/pol.plugin.zsh`);
                    await cliSplitByLine(`cp`, `${__dirname}/../zsh-plugin/plugin.js`, `${polPluginFolder}/plugin.js`);
                    log.log(`[${term.fc.green}  INFO  ${term.mc.resetAll}] .oh-my-zsh custom plugin installed. Please add 'pol' to enabled plugin list in '~/.zshrc' file.`);
                }
            }
            break;
        case "ps":
            let srv = "";
            for (const p of RunningProcesses) {
                let headMsg = TASK_INDENT;
                if (srv !== p.serviceName) {
                    srv = p.serviceName;
                    headMsg = `[${term.fc.green} RUN ${term.mc.resetAll}] `;
                }
                log.log(headMsg, p.serviceName, `service with proc/pid[${p.procName}/${p.procId}] ...`);
                StoppedServices = StoppedServices.filter(s => s.name !== p.serviceName);
            }
            if (argv.all) {
                for (const s of StoppedServices) {
                    log.log(`[${term.fc.yellow} STOP ${term.mc.resetAll}]`, s.name, `service ...`);
                }
            }
            break;
        case "stop":
        case "start":
        case "restart":
            const client = await clientCreate();
            client.write(JSON.stringify(argv));
            // clientCleanup();
            break;
        default:
            require("../bin/pol").help();
            break;
    }
}
