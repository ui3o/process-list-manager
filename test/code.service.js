// this is the code service
/// <reference path="../types.d.ts"/>

service.setup = {
    /** @param ss service tools */
    onStart: async (ss) => {
        ss.toLog('asd');
    },

    /** @param ss service tools */
    onStop: async (ss) => {
        ss.toLog('pre stop');
        await ss.stopAll();
        ss.toLog('post stop');
    },

    /** @param ss service tools */
    onLogin: async (ss) => {
        ss.exec.it.do('bash');
    }
}