import minimist from 'minimist';
import { help } from '../entry/pol';
import { log } from './logger';
import { clientCreate } from './socket';
import { cliSplitByLine } from './spawn';
import { term } from './term';

export enum ClientCommand {
    "completion" = "completion",
    "ps" = "ps",
    "kill" = "kill",
    "stop" = "stop",
    "start" = "start",
    "restart" = "restart",
};

export const isClientCommand = (cmd: string) => {
    if (Object.values(ClientCommand).includes(cmd as any)) {
        return true;
    }
}

export const polClient = async (argv: minimist.ParsedArgs) => {

    switch (argv._[0]) {
        case ClientCommand.completion:
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
        case ClientCommand.ps:
        case ClientCommand.kill:
        case ClientCommand.stop:
        case ClientCommand.start:
        case ClientCommand.restart:
            const client = await clientCreate();
            client.write(JSON.stringify(argv));
            break;
        default:
            help();
            break;
    }
}
