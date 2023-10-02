#!/usr/bin/env node

"use strict"
import minimist from 'minimist';
import packageJson from "../package.json";
import { polDaemon } from "../src/pol";
import { printUsage } from "../src/usage";
const argv= minimist(process.argv.slice(2));

export const help = () => {
    printUsage({
        name: 'pol - Process list manager.',
        usage: [
            { name: `pol [options][command]`, desc: 'Process list (pol) manager accepts command and options.' }
        ],
        options: [
            { desc: 'show help', switch: '-h, --help', type: 'boolean' }
        ],
        commands: [
            { desc: "boot init system", switch: 'boot' },
            { desc: "start [service|--all]", switch: 'start' },
            { desc: "restart [service|--all]", switch: 'restart' },
            { desc: "stop [service|--all]", switch: 'stop' },
            { desc: "list running [none|--all]", switch: 'ps' },
        ],
        version: packageJson.version,
        copyright: 'copyright@2023'
    });
    process.exit(0);
}
if (argv.h || argv.help) {
    help();
}

polDaemon(argv);