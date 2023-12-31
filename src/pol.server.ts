import fs from 'fs';
import minimist from 'minimist';
import net from 'net';
import os from "os";
import { help } from '../entry/pol';
import { pol, POL_CLB_METHOD, POL_LOGGER, SERVICE_DEF } from './daemon';
import "./global";
import { log, logFile, logFileInit, TASK_INDENT } from './logger';
import { ClientCommand } from './pol.client';
import { clientCreate, serverCleanup, serverCreate } from './socket';
import { cliSplitByLine } from './spawn';
import { term } from './term';

const POL_DAEMON_RUNNING_MSG = `Another pol daemon is running!`;
const POSSIBLE_OPTIONS_MSG = `possible options: [--all|service_name.service]`;
const POL_CONFIG_FOLDER = process.env.POL_CONFIG_FOLDER ? [process.env.POL_CONFIG_FOLDER] : ["/etc/pol"];
POL_CONFIG_FOLDER.push(`${os.homedir()}/.config/pol`);

enum ServerCommand {
	boot = "boot"
}

export const isServerCommand = (cmd: string) => {
	if (Object.values(ClientCommand).includes(cmd as any)) {
		return true;
	}
	if (Object.values(ServerCommand).includes(cmd as any)) {
		return true;
	}
}

export const polServer = async (argv: minimist.ParsedArgs) => {

	process.env.TZ = process.env.TZ ? process.env.TZ : fs.readFileSync('/etc/timezone').toString().split('\n')[0];

	logFileInit();

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
						// todo custom env az await miatt
						srv.setup.ssOnStart.env = {
							...srv.setup.ssOnStart.env,
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
		const stoppedServices = pol.getAllStopped().map(s => { return { name: s.name } });
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
						const pendingPromises = [
							...Object.values(service.cli.before_onStart).map(s => s.promise),
							...Object.values(service.cli.after_onStart).map(s => s.promise),
							...Object.values(service.cli.before_onLogin).map(s => s.promise),
							...Object.values(service.cli.after_onLogin).map(s => s.promise),
							service.exec.onStart?.promise,
							service.exec.onLogin?.promise,
						];
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
						await Promise.all(pendingPromises);
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
							await _stop(srv);
							preStopResolver(); postStopResolver();
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
				for (const s of stoppedServices) {
					logger.write(`[${term.fc.yellow} WARN ${term.mc.resetAll}] ${s.name} is already stopped ...`);
				}
			}
			Promise.all(promiseAllService).then(() => {
				resolve();
			});
		});
	}

	let RUNNING = true;
	process.on("SIGINT", async () => {
		if (RUNNING) {
			RUNNING = false;
			await lookup();
			await stop("--all", log);
			serverCleanup();
		}
	});

	switch (argv._[0]) {
		case ServerCommand.boot:
			await lookup();
			if (pol.running) {
				log.log(POL_DAEMON_RUNNING_MSG);
				process.exit(1);
			}
			await serverCreate(async (msg: minimist.ParsedArgs, socket: net.Socket) => {

				switch (msg._[0]) {
					case ClientCommand.daemon:
						if (!msg._.length || (msg._.length < 2)) {
							socket.write(POSSIBLE_OPTIONS_MSG);
							socket.end();
						} else {
							switch (msg._[1]) {
								case "shutdown":
									const logger: POL_LOGGER = {
										err: () => { },
										warn: () => { },
										log: () => { },
										write: (msg: string) => {
											log.write(msg);
											socket.write(msg);
										},
										end: () => { }
									};
									await lookup();
									await stop("--all", logger);
									socket.end();
									serverCleanup();
									break;
							}
						}
						break;
					case ClientCommand.stop:
						if (!msg._.length || (msg._.length < 2 && !msg.all)) {
							socket.write(POSSIBLE_OPTIONS_MSG);
							socket.end();
						} else {
							await lookup();
							await stop(msg._[1] ? msg._[1] : msg.all ? "--all" : null, socket, msg.force);
							socket.end();
						}
						break;
					case ClientCommand.start:
						if (!msg._.length || (msg._.length < 2 && !msg.all)) {
							socket.write(POSSIBLE_OPTIONS_MSG);
							socket.end();
						} else {
							await lookup();
							await start(msg._[1] ? msg._[1] : msg.all ? "--all" : null, socket);
							socket.end();
						}
						break;
					case ClientCommand.restart:
						if (!msg._.length || (msg._.length < 2 && !msg.all)) {
							socket.write(POSSIBLE_OPTIONS_MSG);
							socket.end();
						} else {
							await lookup();
							await stop(msg._[1] ? msg._[1] : msg.all ? "--all" : null, socket, msg.force);
							setTimeout(async () => {
								await start(msg._[1] ? msg._[1] : msg.all ? "--all" : null, socket);
								socket.end();
							});
						}
						break;
					case ClientCommand.ps:
						await lookup();
						let srvName = "";
						for (const srv of pol.getAllRunning()) {
							for (const proc of srv.processes) {
								let headMsg = TASK_INDENT;
								if (srvName !== srv.name) {
									srvName = srv.name;
									headMsg = `[${term.fc.green} RUN ${term.mc.resetAll}] `;
								}
								socket.write(`${headMsg}  ${srv.name} service with proc/pid[${proc.procName}/${proc.procId}] ...\n`);
							}
						}
						if (msg.all) {
							for (const s of pol.getAllStopped()) {
								socket.write(`[${term.fc.yellow} STOP ${term.mc.resetAll}] ${s.name} service ...`);
							}
						}
						socket.end();
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
					const login = pol.getLoginService()?.setup?.ssOnLogin;
					if (login) {
						login.env = {
							...login.env,
							POL: `__POL__${pol.getLoginService()?.name}__${pol.getNanoSecTime()}__POL__`
						};
					}
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
		default:
			help();
			break;
	}

}
