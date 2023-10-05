import minimist from 'minimist';
import { help } from '../entry/pol';
import { log } from './logger';
import { clientCreate } from './socket';
import { cliSplitByLineSync } from './spawn';
import { term } from './term';

export enum ClientCommand {
    "completion" = "completion",
    "ps" = "ps",
    "daemon" = "daemon",
    "stop" = "stop",
    "start" = "start",
    "restart" = "restart",
};

export const isClientCommand = (cmd: string) => {
    if (Object.values(ClientCommand).includes(cmd as any)) {
        return true;
    }
}


let zshCompletionInitExecuted = false;
export const zshCompletionInit = () => {
    if (!zshCompletionInitExecuted && process.env.ZSH && process.env.ZSH.endsWith('.oh-my-zsh')) {
        zshCompletionInitExecuted = true;
        const polPluginFolder = `${process.env.ZSH}/custom/plugins/pol`;
        cliSplitByLineSync(`mkdir`, `-p`, `${polPluginFolder}`);
        cliSplitByLineSync(`cp`, `${__dirname}/../zsh-plugin/pol.plugin.zsh`, `${polPluginFolder}/pol.plugin.zsh`);
        cliSplitByLineSync(`cp`, `${__dirname}/../zsh-plugin/plugin.js`, `${polPluginFolder}/plugin.js`);
        log.log(`[${term.fc.green}  INFO  ${term.mc.resetAll}] .oh-my-zsh custom plugin installed. Please add 'pol' to enabled plugin list in '~/.zshrc' file.`);
    }
}

export const polClient = async (argv: minimist.ParsedArgs) => {

    switch (argv._[0]) {
        case ClientCommand.completion:
            if (argv._[1] === 'zsh') {
                zshCompletionInit();
            }
            break;
        case ClientCommand.ps:
        case ClientCommand.daemon:
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
