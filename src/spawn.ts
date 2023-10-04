import { spawn, spawnSync } from 'child_process';


export const cliSplitByLineSync = function (...args: any[]) {
    const _cmd = [...arguments];

    const spawnCmd = spawnSync(_cmd.shift(), [..._cmd]);
    const _lines = spawnCmd.stdout.toString().split('\n').filter(l => l);

    return { o: _lines, c: spawnCmd.status }
};

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
