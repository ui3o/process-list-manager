import fs from 'fs';
import minimist from 'minimist';
import net from 'net';
import os from "os";
import { help } from '../entry/pol';
import { pol, POL_CLB_METHOD, POL_LOGGER, SERVICE_DEF } from './daemon';
import { cliSplitByLine, log, logFile, TASK_INDENT } from './global';
import { clientCreate, serverCleanup, serverCreate } from './socket';
import { term } from './term';

const POL_DAEMON_RUNNING_MSG = `Another pol daemon is running!`;
const POSSIBLE_OPTIONS_MSG = `possible options: [--all|service_name.service]`;
const POL_CONFIG_FOLDER = process.env.POL_CONFIG_FOLDER ? [process.env.POL_CONFIG_FOLDER] : ["/etc/pol"];
POL_CONFIG_FOLDER.push(`${os.homedir()}/.config/pol`);
const envs = { ...process.env };


export const polDaemon = async (argv: minimist.ParsedArgs) => {

    const lookup = async () => {
        const _rs = await cliSplitByLine('find', ...POL_CONFIG_FOLDER, '-name', '*.service.js');
        const _loginService = await cliSplitByLine('readlink', `-e`, ...POL_CONFIG_FOLDER.map(f => `${f}/login.service.target.js`));
        const _polDaemonRunningCheck = await cliSplitByLine('sh', `-c`, `ps aux | grep ".*node.*pol.*boot$"`);
        pol.running = _polDaemonRunningCheck.o.length < 2 ? false : true;

        _rs.o.filter(r => !r.includes('No such file or directory')).map(r => {
            const name = r?.split('/')?.pop()?.replace('.js', '');
            pol.init(name!, r);
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

        for (const envFile of _running_envs) {
            try {
                const buffer = fs.readFileSync(envFile);
                const fileContent = buffer.toString();
                if (fileContent.includes("__POL__")) {
                    const subProcInfo = fileContent.split('__POL_CL__');
                    const procInfo = subProcInfo[1].split("__");
                    const _srvInfo = fileContent.split('__POL__');
                    const srvInfo = _srvInfo[1].split("__");
                    pol.setRunning(srvInfo[0]);
                    pol.addProcess(srvInfo[0], envFile.split('/')[2], procInfo[0]);
                }
            } catch (error) { }
        }


        // require all service file
        // @ts-ignore
        const dynamicRequire = (typeof __webpack_require__ === 'function') ? __non_webpack_require__ : require
        for (const service of pol.getServices()) {
            dynamicRequire(service.path!);
        }

        _loginService.o.forEach(s => {
            pol.setLoginService(s?.split('/')?.pop()?.replace('.js', '')!);
        });

    }

    await lookup();

    // start process implementation
    const start = async (serviceName: string | null, logger: POL_LOGGER | net.Socket) => {
        if (!serviceName) return;
        if (!pol.getServices().some(s => s.name === serviceName || serviceName === "--all")) {
            logger.write(POSSIBLE_OPTIONS_MSG);
            return;
        }

        const promiseAllService: Array<Promise<any>> = [];

        return new Promise((resolve) => {
            for (const service of pol.getServices()) {
                if (serviceName !== "--all" && service.name !== serviceName) continue;

                let serviceStartResolver: POL_CLB_METHOD = () => { };
                const srv = pol.get(service.name);
                promiseAllService.push(new Promise(r => serviceStartResolver = r));
                pol.stateInit(service.name);

                try {
                    if (pol.getAllRunning().some(s => s.name === service.name)) {
                        logger.write(`[${term.fc.yellow} WARN ${term.mc.resetAll}] ${service.name} is already running ...`);
                        serviceStartResolver();
                        continue;
                    }
                    if (srv.setup?.onStart) {
                        process.env = {
                            ...envs,
                            POL: `__POL__${service.name}__${pol.getNanoSecTime()}__POL__`
                        };
                        logger.write(`[${term.fc.green}  OK  ${term.mc.resetAll}] start ${service.name} ...`);
                        srv.setup.onStart(srv.setup.ssOnStart).then(() => {
                            // TODO handle restart
                            // TODO handle if has pre started cli
                            pol.startRunChecker(service.name, 'after', 'onStart', 'started', logFile);
                        });
                        pol.startRunChecker(service.name, 'before', 'onStart', 'started', logger, serviceStartResolver);
                    } else {
                        serviceStartResolver();
                    }
                } catch (error) {
                    logger.write(`[${term.fc.red}FAILED${term.mc.resetAll}] start ${service.name} ...`);
                    logger.write(`        ${(error as Error).stack}`);
                    pol.get(service.name)?.startResolver?.();
                }
            }
            Promise.all(promiseAllService).then(() => {
                resolve(true);
            });
        });
    }

    // stop process implementation
    const stop = async (serviceName: string | null, logger: POL_LOGGER | net.Socket, force?: boolean) => {
        if (!pol.getServices().some(s => s.name === serviceName || serviceName === '--all')) {
            logger.write(POSSIBLE_OPTIONS_MSG);
            return;
        }
        if (!pol.getAllRunning().some(s => s.name === serviceName) && serviceName !== '--all') {
            logger.write(`[${term.fc.yellow} WARN ${term.mc.resetAll}] ${serviceName} is already stopped ...`);
            return;
        }
        if (serviceName === '--all') {
            for (const srv of pol.getServices()) {
                pol.setStateDown(srv.name);
            }
        } else {
            pol.setStateDown(serviceName!);
        }

        const promiseAllService: Promise<any>[] = [];
        return new Promise(async (resolve: POL_CLB_METHOD) => {
            for (const srv of pol.getAllRunning()) {
                if (serviceName === '--all' || serviceName === srv.name) {
                    let serviceStopResolver: POL_CLB_METHOD = () => { },
                        preStopResolver: POL_CLB_METHOD = () => { },
                        postStopResolver: POL_CLB_METHOD = () => { };
                    const promiseAllPrePostStopDone = [
                        new Promise(r => preStopResolver = r),
                        new Promise(r => postStopResolver = r)];

                    const _stop = async (service: SERVICE_DEF) => {
                        let srv = "";
                        pol.stopRunChecker(service.name, 'Start');
                        for (const p of service.processes) {
                            let headMsg = TASK_INDENT;
                            if (srv !== service.name) {
                                srv = service.name;
                                headMsg = `[${term.fc.green} STOP ${term.mc.resetAll}]`;
                            }
                            const kill = force ? ['kill', '-9', p.procId] : ['kill', p.procId];
                            const { c } = await cliSplitByLine(...kill);
                            if (c == 0) {
                                logger.write(`${headMsg} ${service.name} service with proc/pid[${p.procName}/${p.procId}] ...`);
                            }
                        }
                    }
                    promiseAllService.push(new Promise(r => (serviceStopResolver as any) = r));
                    try {
                        if (srv.setup?.onStop) {
                            srv.setup.ssOnStop.stopAll = async () => {
                                // TODO handle if has pre started cli
                                await _stop(srv);
                                pol.setStateStop(srv.name);
                                pol.startRunChecker(srv.name, 'after', 'onStop', 'stopped', logger, postStopResolver);
                            };
                            srv.setup.onStop(srv.setup.ssOnStop);
                            pol.startRunChecker(srv.name, 'before', 'onStop', 'stopped', logger, preStopResolver);
                        } else {
                            preStopResolver(); postStopResolver();
                            await _stop(srv);
                        }

                        Promise.all(promiseAllPrePostStopDone).then(() => {
                            serviceStopResolver();
                            // set ready state for the next circle
                            setTimeout(() => {
                                pol.setStateReady(srv.name);
                            });
                        });
                    } catch (error) {
                        logger.write(`[${term.fc.red}FAILED${term.mc.resetAll}] stop ${srv.name} ...`);
                        serviceStopResolver();
                    }
                }
            }
            if (serviceName === '--all') {
                for (const s of pol.getAllStopped()) {
                    logger.write(`[${term.fc.yellow} WARN ${term.mc.resetAll}] ${s.name} is already stopped ...`);
                }
            }
            Promise.all(promiseAllService).then(() => {
                resolve();
            });
        });
    }

    switch (argv._[0]) {
        case "boot":
            if (pol.running) {
                log.log(POL_DAEMON_RUNNING_MSG);
                process.exit(1);
            }
            await serverCreate(async (msg: minimist.ParsedArgs, socket: net.Socket) => {

                switch (msg._[0]) {
                    case "stop":
                        if (!msg._.length || (msg._.length < 2 && !msg.all)) {
                            socket.write(POSSIBLE_OPTIONS_MSG);
                            socket.end();
                        } else {
                            await lookup();
                            await stop(msg._[1] ? msg._[1] : msg.all ? "--all" : null, socket, msg.force);
                            socket.end();
                        }
                        break;
                    case "start":
                        if (!msg._.length || (msg._.length < 2 && !msg.all)) {
                            socket.write(POSSIBLE_OPTIONS_MSG);
                            socket.end();
                        } else {
                            await lookup();
                            await start(msg._[1] ? msg._[1] : msg.all ? "--all" : null, socket);
                            socket.end();
                        }
                        break;
                    case "restart":
                        if (!msg._.length || (msg._.length < 2 && !msg.all)) {
                            socket.write(POSSIBLE_OPTIONS_MSG);
                            socket.end();
                        } else {
                            await lookup();
                            const success = await stop(msg._[1] ? msg._[1] : msg.all ? "--all" : null, socket, msg.force);
                            if (success) await start(msg._[1] ? msg._[1] : msg.all ? "--all" : null, socket);
                            socket.end();
                        }
                        break;
                }
            });
            await start("--all", log);
            if (pol.getLoginService()) {
                const logout = async () => {
                    // only stop process if there was login
                    await lookup();
                    await stop("--all", log);
                    serverCleanup();
                }
                if (pol.isStateAfterDown(pol.getLoginService()?.name!))
                    await logout();
                else {
                    process.env = {
                        ...envs,
                        POL: `__POL__${pol.getLoginService()?.name}__${pol.getNanoSecTime()}__POL__`
                    };
                    pol.getLoginService()?.setup?.onLogin?.(pol.getLoginService()?.setup?.ssOnLogin!).then(async () => {
                        if (pol.getLoginService()?.exec.onLogin) {
                            pol.getLoginService()?.exec?.onLogin?.promise?.then(async () => {
                                await logout();
                            });
                        } else {
                            await logout();
                        }
                    });
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
            let srvName = "";
            for (const srv of pol.getAllRunning()) {
                for (const proc of srv.processes) {
                    let headMsg = TASK_INDENT;
                    if (srvName !== srv.name) {
                        srvName = srv.name;
                        headMsg = `[${term.fc.green} RUN ${term.mc.resetAll}] `;
                    }
                    log.log(headMsg, srv.name, `service with proc/pid[${proc.procName}/${proc.procId}] ...`);
                }
            }
            if (argv.all) {
                for (const s of pol.getAllStopped()) {
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
            help();
            break;
    }
}
