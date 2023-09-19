// this is the node service
/// <reference path="../types.d.ts"/>

service.setup = {
    /** @param ss service tools */
    onStart: async (ss) => {
        ss.toLog('start by service');
        // process.env = {}
        ss.cli.do(`sleep`, `1`);
        ss.toLog('start after service');
       // await ss.cli.do(`bash`, `-c`, `watch ls ~`);
       await ss.exec.do(`bash`, `-c`, `sleep 11; sleep 1`);
       ss.toLog('start by service');
       ss.cli.do(`sleep`, `19`);
    },

    /** @param ss service tools */
    onStop: async (ss) => {
        ss.toLog('pre stop');
        await ss.stopAll();
        ss.toLog('post stop');
    },

}