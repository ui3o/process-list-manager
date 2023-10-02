#!/usr/bin/env node

const fs = require('fs');
const os = require("os");

const services = {}
const folders = ['/etc/pol/', process.env.POL_CONFIG_FOLDER, `${os.homedir()}/.config/pol`]
folders.forEach(f => {
    if (fs.existsSync(f)) {
        fs.readdirSync(f).forEach(file => {
            if (file.endsWith('.service.js')) {
                const fileContents = fs.readFileSync(`${f}/${file}`, 'utf-8');
                const comment = fileContents.split(/\r?\n/)[0];
                if (comment.startsWith('// ')) services[`${file.replace('.js', '')}__${comment.replace('// ', '')}`] = null;
                else services[file.replace('.js', '')] = null;
            }
        });
    }
})

const moduleName = "pol"
const menu = {
    "start__start service": {
        "--all__start all service": null,
        ...services
    },
    "stop__stop service": {
        "--all__stop all service": null,
        ...services
    },
    "restart__restart service": {
        "--all__restart all service": null,
        ...services
    },
    "completion__initialize completion system for a shell": {
        "zsh": null,
    },
    "boot__boot all service": null
}

const levels = new Set();
const segments = [];
(mapper = (root = menu, depth = 1, parents = []) => {
    levels.add(`'${depth}: :->level_${depth}'`);

    const columns = [];
    for (const [key, value] of Object.entries(root)) {
        const [name, description] = key.split("__");
        columns.push(description ? `${name}\\:"${description}"` : `${name}`);
        if (value != null) mapper(value, depth + 1, [...parents, name]);
    }

    const conditions = [`$state = "level_${depth}"`];
    for (let i = 2; i <= depth; i++) {
        conditions.push(`$words[${i}] = "${parents[i - 2]}"`);
    }

    segments.push([
        `if [[ ${conditions.join(" && ")} ]]; then`,
        `_arguments '*:data:((${columns.join(" ")}))'`,
        `fi`
    ].join("\n"));
})();

let file = [
    `#compdef ${moduleName}`,
    `_${moduleName}() { `,
    `local curcontext="$curcontext" state line`,
    `typeset -A opt_args`,
    `_arguments ${[...levels].join(" ")}`,
    ...segments,
    `}`,
    `_${moduleName} "$@"`
];

require('fs').writeFileSync(process.argv[2], file.join(`\n`));
