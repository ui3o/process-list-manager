import { term } from './term';

const USAGE = {
    name: 'NAME\n',
    usage: 'USAGE\n',
    options: 'OPTIONS\n',
    commands: 'COMMANDS\n',
    indent: '    ',
    typeIndent: '   ',
    optionIndent: 4,
    maxSwitchLength: 25,
    header: '\n',
}

const _get = (prop = '') => {
    return prop !== undefined && prop.length ? prop : undefined;
}

const _printTitles = (title: string, info: Array<any> = [], bold?: boolean) => {
    if (info.length && _get(info[0].name)) {
        term.print(term.mc.bold + USAGE.header + title);

        info.forEach(i => {
            term.print(term.mc.resetAll);

            if (bold) term.print(term.fc.brightWhite + term.mc.bold);
            term.print(`${USAGE.indent + i.name}`);
            const desc = _get(i.desc);
            if (desc) {
                term.print(term.mc.resetAll).print(`\n`);
                term.print(`${USAGE.indent}${USAGE.indent}${desc}`);
            }
            term.print(term.mc.resetAll).print(`\n`);
        });
    }
}

// type: [boolean|string|number]
export const printUsage = (u = {
    name: '', usage: [{ name: '', desc: '' }], options: [{ switch: '', desc: '', type: '' }],
    commands: [{ switch: '', desc: '' }],
    copyright: 'copyright@2020', version: '0.0.1'
}) => {
    _printTitles(USAGE.name, [{ name: u.name }]);
    _printTitles(USAGE.usage, u.usage, true);
    if (u.options && u.options.length) {
        let optionTitlePrinted = false;
        u.options.forEach(o => {
            if (o.switch.length) {
                if (!optionTitlePrinted) { optionTitlePrinted = true; term.print(term.mc.bold + USAGE.header + USAGE.options + term.mc.resetAll); }
                term.print(`${term.fc.brightWhite + term.mc.bold}${USAGE.indent + o.switch}\n`);
                term.print(`${term.mc.resetAll}${USAGE.indent}${USAGE.indent}${o.desc}`);
                if (o.type) term.print(`${term.fc.cyan} [${o.type}]`);
                term.print(`\n`);
            }
        });
    }
    if (u.commands && u.commands.length) {
        let optionTitlePrinted = false;
        u.commands.forEach(o => {
            if (o.switch.length) {
                if (!optionTitlePrinted) { optionTitlePrinted = true; term.print(term.mc.bold + USAGE.header + USAGE.commands + term.mc.resetAll); }
                term.print(`${term.fc.brightWhite + term.mc.bold}${USAGE.indent + o.switch}\n`);
                term.print(`${term.mc.resetAll}${USAGE.indent}${USAGE.indent}${o.desc}`);
                term.print(`\n`);
            }
        });
    }
    term.print(USAGE.header);
    if ((u.version && u.version.length) || (u.copyright && u.copyright.length)) term.print('== ');
    if (u.version && u.version.length) term.print(`v${u.version}`);
    if (u.copyright && u.copyright.length) {
        if (u.version && u.version.length) term.print(` - `);
        term.print(u.copyright);
    };
    if ((u.version && u.version.length) || (u.copyright && u.copyright.length)) term.print(' ==\n\n');
}