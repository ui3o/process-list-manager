#!/bin/node

"use strict"
const { printUsage } = require("../src/usage");
const packageJson = require("../package.json");
const argv = require('minimist')(process.argv.slice(2));

module.exports.help = () => {
    printUsage({
        name: 'pol - Process list manager.',
        usage: [
            { name: `pol [options][command]`, desc: 'container manager accepts command and options.' }
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
    module.exports.help();
}

require("../src/pol").pol(argv);