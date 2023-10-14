import net from 'net';
import { msgToLog } from './logger';
import { term } from "./term";

export declare class POL_SETUP {
    serviceName?: string
    ssOnStart: POL_SETUP_START
    ssOnStop: POL_SETUP_STOP
    ssOnLogin: POL_SETUP_START
    onStart?: (ss: POL_SETUP_START) => Promise<any>
    onStop?: (ss: POL_SETUP_STOP) => Promise<any>
    onLogin?: (ss: POL_SETUP_START) => Promise<any>
}

export declare class POL_SETUP_CORE {
    env: {
        [key: string]: string | undefined
    }
}

export declare class POL_SETUP_START extends POL_SETUP_CORE {
    cli: POL_SETUP_CLI
    exec: POL_SETUP_EXEC
    toLog?: (str: string) => any
}

export declare class POL_SETUP_STOP extends POL_SETUP_CORE {
    cli: POL_SETUP_CLI
    stopAll?: () => Promise<void>
    toLog?: (str: string) => any
}

export type POL_CLB_METHOD = (value?: unknown) => void


export declare class POL_LOGGER {
    write: (...data: any[]) => any
    log: (...data: any[]) => any
    warn: (...data: any[]) => any
    err: (...data: any[]) => any
    end: POL_CLB_METHOD
}

export declare class POL_SETUP_CLI {
    noErr?: POL_SETUP_CLI
    splitByLine?: POL_SETUP_CLI
    splitAll?: POL_SETUP_CLI
    wd?: (wd: string) => POL_SETUP_CLI
    gid?: (gid: string) => POL_SETUP_CLI
    uid?: (uid: string) => POL_SETUP_CLI
    eol?: (eol: string) => POL_SETUP_CLI
    do?: POL_CLB_METHOD
}

export declare class POL_SETUP_EXEC {
    it?: POL_SETUP_EXEC
    wd?: (wd: string) => POL_SETUP_EXEC
    uid?: (uid: string) => POL_SETUP_EXEC
    gid?: (gid: string) => POL_SETUP_EXEC
    do?: POL_CLB_METHOD
}

declare interface SERVICES_DEF {
    [name: string]: SERVICE_DEF
}

export declare interface SERVICE_DEF {
    name: string
    setup?: POL_SETUP
    path?: string
    running?: boolean
    startedAt?: number
    startResolver?: () => void
    /**
     * SERVICE_STATE_READY = 0 -- beforeOnStart
     * SERVICE_STATE_UP = 1 -- afterOnStartExec
     * SERVICE_STATE_DOWN = 2 -- beforeOnStop
     * SERVICE_STATE_STOP = 3 -- afterStopAll
     */
    state: number
    processes: Array<RUNNING_PROCESS_DEF>
    interval: {
        before_onStart: NodeJS.Timeout | void
        after_onStart: NodeJS.Timeout | void
        before_onStop: NodeJS.Timeout | void
        after_onStop: NodeJS.Timeout | void
    },
    cli: CLI_DEF,
    exec: EXEC_DEF
}

declare interface RUNNING_PROCESS_DEF {
    procId: string
    procName: string
}

declare interface EXEC_DEF {
    onStart: SPAWN_DEF | undefined
    onLogin: SPAWN_DEF | undefined
}


declare interface CLI_DEF {
    before_onStart: SPAWNS_DEF
    after_onStart: SPAWNS_DEF
    before_onStop: SPAWNS_DEF
    after_onStop: SPAWNS_DEF
    before_onLogin: SPAWNS_DEF
    after_onLogin: SPAWNS_DEF
}

declare interface SPAWNS_DEF {
    [name: string]: SPAWN_DEF

}

export declare interface SPAWN_DEF {
    prog?: string
    params?: string[]
    promise?: Promise<any>
    options?: any
    timestamp?: number
}


class PolDaemonClass {

    private SERVICE_STATE = {
        READY: { name: "SERVICE_STATE_READY", state: 0 },
        UP: { name: "SERVICE_STATE_UP", state: 1 },
        DOWN: { name: "SERVICE_STATE_DOWN", state: 2 },
        STOP: { name: "SERVICE_STATE_STOP", state: 3 }
    };

    private defaults = {
        CLI_PRE_INTERVAL: 50,
        CLI_INTERVAL: 200
    };


    public running = false;
    private srv: SERVICES_DEF = {};
    private loginService: SERVICE_DEF | undefined = undefined;

    constructor() { }

    public init(serviceName: string, path: string) {
        this.srv[serviceName] = this.srv[serviceName] ? this.srv[serviceName] : {
            processes: [],
            path,
            name: serviceName,
            state: this.SERVICE_STATE.READY.state,
            interval: {
                before_onStart: undefined,
                after_onStart: undefined,
                before_onStop: undefined,
                after_onStop: undefined,
            },
            cli: {
                after_onStart: {},
                before_onStart: {},
                after_onStop: {},
                before_onStop: {},
                after_onLogin: {},
                before_onLogin: {}
            },
            exec: {
                onStart: undefined,
                onLogin: undefined
            }
        };
        this.srv[serviceName].processes = [];
        return this.srv[serviceName];
    }

    // startRunChecker(service.name, 'before', 'onStart', 'started', logger, serviceStartResolver);
    startRunChecker(serviceName: string, prePostState: 'before' | 'after', state: 'onStart' | 'onStop', msg = "", logger: POL_LOGGER | net.Socket, resolver: POL_CLB_METHOD | undefined = undefined) {
        const interval = this.srv[serviceName].interval;
        const cli = this.srv[serviceName].cli[`${prePostState}_${state}`];
        const runState = state.toLowerCase().includes("start") ? "start" : "stop";

        if (`${prePostState}_${state}` === 'before_onStart' && resolver)
            this.srv[serviceName].startResolver = resolver;

        const runChecker = () => {
            if (Object.keys(cli).length) {
                if (!interval[`${prePostState}_${state}`]) {
                    interval[`${prePostState}_${state}`] = setInterval(runChecker, 2000);
                }
                logger.write(`         waiting ${prePostState} ${serviceName} ${runState} ...`);
            } else {
                if (interval[`${prePostState}_${state}`]) {
                    interval[`${prePostState}_${state}`] = clearInterval(interval[`${prePostState}_${state}`]!);
                    logger.write(`[${term.fc.green}  OK  ${term.mc.resetAll}] ${serviceName} is ${msg} ...`);
                }
                if (resolver) resolver();
            }
        }

        if (Object.keys(cli).length) {
            setTimeout(runChecker, 500)
        } else {
            if (resolver) resolver();
        }
    }

    stopRunChecker(serviceName: string, stage: 'Start') {
        const interval = this.srv[serviceName].interval;

        if (interval[`before_on${stage}`] || interval[`after_on${stage}`]) {

            if (interval[`before_on${stage}`]) {
                interval[`before_on${stage}`] = clearInterval(interval[`before_on${stage}`]!);
                if (this.srv[serviceName].startResolver) this.srv[serviceName].startResolver?.();
            }
            if (interval[`after_on${stage}`]) {
                interval[`after_on${stage}`] = clearInterval(interval[`after_on${stage}`]!);
            }
        }
    }

    setRunning(serviceName: string) {
        this.srv[serviceName].running = true;
    }


    addProcess(serviceName: string, procId: string, procName: string) {
        this.srv[serviceName].processes.push({ procId, procName });
    }

    addCli(serviceName: string, funcName: string, timestamp: number, spawn: SPAWN_DEF) {
        switch (funcName) {
            case 'onStart':
            case 'onLogin':
            case 'onStop':
                const after = funcName === 'onStop' ? pol.isStateStop(serviceName) : this.srv[serviceName].exec[funcName];
                if (after) {
                    this.srv[serviceName].cli[`after_${funcName}`][`${timestamp}`] = spawn;
                } else {
                    this.srv[serviceName].cli[`before_${funcName}`][`${timestamp}`] = spawn;
                }
                break;
        }
    }

    addExec(serviceName: string, funcName: string, timestamp: number, spawn: SPAWN_DEF) {
        switch (funcName) {
            case 'onStart':
            case 'onLogin':
                if (this.srv[serviceName].exec[funcName])
                    msgToLog(`not possible to execute to exe in ${funcName}`, 'pol   ', serviceName)
                else
                    this.srv[serviceName].exec[funcName] = spawn;
                break;
        }
    }

    delCli(serviceName: string, funcName: string, timestamp: number) {
        switch (funcName) {
            case 'onStart':
            case 'onStop':
            case 'onLogin':
                const isBefore = Object.keys(this.srv[serviceName].cli[`before_${funcName}`]).some(k => k === `${timestamp}`);
                if (isBefore) {
                    Object.keys(this.srv[serviceName].cli[`before_${funcName}`]).forEach(k => {
                        if (k === `${timestamp}`)
                            delete this.srv[serviceName].cli[`before_${funcName}`][k];
                    });
                } else {
                    Object.keys(this.srv[serviceName].cli[`after_${funcName}`]).forEach(k => {
                        if (k === `${timestamp}`)
                            delete this.srv[serviceName].cli[`after_${funcName}`][k];
                    });
                }
                break;
        }
    }

    delExec(serviceName: string, funcName: string) {
        switch (funcName) {
            case 'onStart':
            case 'onLogin':
                this.srv[serviceName].exec[funcName] = undefined;
                break;
        }
    }

    setSetup(serviceName: string, setup: POL_SETUP) {
        this.srv[serviceName].setup = setup;
    }

    setLoginService(serviceName: string) {
        this.loginService = this.srv[serviceName];
    }

    getLoginService() {
        return this.loginService;
    }

    stateInit(serviceName: string) {
        this.srv[serviceName].state = this.SERVICE_STATE.READY.state;
    }

    get(serviceName: string) {
        return this.srv[serviceName];
    }

    isStateAfterDown(serviceName: string) {
        return this.srv[serviceName].state >= this.SERVICE_STATE.DOWN.state;
    }

    isStateStop(serviceName: string) {
        return this.srv[serviceName].state === this.SERVICE_STATE.STOP.state;
    }


    setStateReady(serviceName: string) {
        this.srv[serviceName].state = this.SERVICE_STATE.READY.state;
        this.srv[serviceName].running = false;

    }


    setStateDown(serviceName: string) {
        this.srv[serviceName].state = this.SERVICE_STATE.DOWN.state;
    }

    setStateStop(serviceName: string) {
        this.srv[serviceName].state = this.SERVICE_STATE.STOP.state;
    }

    getAllRunning() {
        return this.getServices().filter(s => s.running)
    }

    getAllStopped() {
        return this.getServices().filter(s => !s.running)
    }

    getServices() {
        return Object.values(this.srv).sort((a, b) => {
            if (a.name.toUpperCase() < b.name.toUpperCase()) return -1;
            if (a.name.toUpperCase() > b.name.toUpperCase()) return 1;
            return 0;
        });
    }

    getNanoSecTime() {
        const hrTime = process.hrtime();
        return hrTime[0] * 1000000000 + hrTime[1];
    }


}

export const pol = new PolDaemonClass();
