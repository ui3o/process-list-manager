// terminal definition
const t = {

    // terminal stdout
    stdout: process.stdout,

    /**
     * print format
     */
    print: function (str = "") { t.stdout.write(str); return t; },

    bold: function (str: string, code = "") { return t.print(t.mc.bold + code + str + t.mc.resetAll); },
    italic: function (str: string, code = "") { return t.print(t.mc.italic + code + str + t.mc.resetAll); },
    underline: function (str: string, code = "") { return t.print(t.mc.underline + code + str + t.mc.resetAll); },
    inverse: function (str: string, code = "") { return t.print(t.mc.inverse + code + str + t.mc.resetAll); },
    strike: function (str: string, code = "") { return t.print(t.mc.strike + code + str + t.mc.resetAll); },


    defaultColor: function (str: string) { return t.print(t.fc.defaultColor + str + t.mc.resetAll); },
    black: function (str: string) { return t.print(t.fc.black + str + t.mc.resetAll); },
    red: function (str: string) { return t.print(t.fc.red + str + t.mc.resetAll); },
    green: function (str: string) { return t.print(t.fc.green + str + t.mc.resetAll); },
    yellow: function (str: string) { return t.print(t.fc.yellow + str + t.mc.resetAll); },
    blue: function (str: string) { return t.print(t.fc.blue + str + t.mc.resetAll); },
    magenta: function (str: string) { return t.print(t.fc.magenta + str + t.mc.resetAll); },
    cyan: function (str: string) { return t.print(t.fc.cyan + str + t.mc.resetAll); },
    white: function (str: string) { return t.print(t.fc.white + str + t.mc.resetAll); },
    brightBlack: function (str: string) { return t.print(t.fc.brightBlack + str + t.mc.resetAll); },
    brightRed: function (str: string) { return t.print(t.fc.brightRed + str + t.mc.resetAll); },
    brightGreen: function (str: string) { return t.print(t.fc.brightGreen + str + t.mc.resetAll); },
    brightYellow: function (str: string) { return t.print(t.fc.brightYellow + str + t.mc.resetAll); },
    brightBlue: function (str: string) { return t.print(t.fc.brightBlue + str + t.mc.resetAll); },
    brightMagenta: function (str: string) { return t.print(t.fc.brightMagenta + str + t.mc.resetAll); },
    brightCyan: function (str: string) { return t.print(t.fc.brightCyan + str + t.mc.resetAll); },
    brightWhite: function (str: string) { return t.print(t.fc.brightWhite + str + t.mc.resetAll); },
    customColor: function (codeNumber: number, str: string) { const code = isNaN(codeNumber) ? codeNumber : `\x1b[38;5;${codeNumber}m`; return t.print(code + str + t.mc.resetAll) },

    bgDefaultColor: function (str: string, fcCode = "") { return t.print(t.fc.brightWhite + fcCode + str + t.mc.resetAll); },
    bgBlack: function (str: string, fcCode = "") { return t.print(t.bc.black + fcCode + str + t.mc.resetAll); },
    bgRed: function (str: string, fcCode = "") { return t.print(t.bc.red + fcCode + str + t.mc.resetAll); },
    bgGreen: function (str: string, fcCode = "") { return t.print(t.bc.green + fcCode + str + t.mc.resetAll); },
    bgYellow: function (str: string, fcCode = "") { return t.print(t.bc.yellow + fcCode + str + t.mc.resetAll); },
    bgBlue: function (str: string, fcCode = "") { return t.print(t.bc.blue + fcCode + str + t.mc.resetAll); },
    bgMagenta: function (str: string, fcCode = "") { return t.print(t.bc.magenta + fcCode + str + t.mc.resetAll); },
    bgCyan: function (str: string, fcCode = "") { return t.print(t.bc.cyan + fcCode + str + t.mc.resetAll); },
    bgWhite: function (str: string, fcCode = "") { return t.print(t.bc.white + fcCode + str + t.mc.resetAll); },
    bgBrightBlack: function (str: string, fcCode = "") { return t.print(t.bc.brightBlack + fcCode + str + t.mc.resetAll); },
    bgBrightRed: function (str: string, fcCode = "") { return t.print(t.bc.brightRed + fcCode + str + t.mc.resetAll); },
    bgBrightGreen: function (str: string, fcCode = "") { return t.print(t.bc.brightGreen + fcCode + str + t.mc.resetAll); },
    bgBrightYellow: function (str: string, fcCode = "") { return t.print(t.bc.brightYellow + fcCode + str + t.mc.resetAll); },
    bgBrightBlue: function (str: string, fcCode = "") { return t.print(t.bc.brightBlue + fcCode + str + t.mc.resetAll); },
    bgBrightMagenta: function (str: string, fcCode = "") { return t.print(t.bc.brightMagenta + fcCode + str + t.mc.resetAll); },
    bgBrightCyan: function (str: string, fcCode = "") { return t.print(t.bc.brightCyan + fcCode + str + t.mc.resetAll); },
    bgBrightWhite: function (str: string, fcCode = "") { return t.print(t.bc.brightWhite + fcCode + str + t.mc.resetAll); },
    customBgColor: function (codeNumber: number, str: string, fcCode = "") {
        const code = isNaN(codeNumber) ? (codeNumber).toString() : `\x1b[48;5;${codeNumber}m`;
        const fCode = isNaN(codeNumber) ? (codeNumber).toString() : `\x1b[38;5;${codeNumber}m`;
        return t.print(code + fCode + str + t.mc.resetAll);
    },

    // modifier codes
    mc: {
        resetAll: '\x1b[0m\x1b[39m\x1b[49m',
        clearLineCursorRight: `\x1b[K`,
        clearLine: `\x1b[2K`,
        styleReset: '\x1b[0m',
        bold: '\x1b[1m',
        italic: '\x1b[3m',
        underline: '\x1b[4m',
        inverse: '\x1b[7m',
        strike: '\x1b[9m',
        cursorHide: `\x1b[?25l`,
        cursorShow: `\x1b[?25h`,
    },

    // Foreground color
    fc: {
        defaultColor: '\x1b[39m',
        black: '\x1b[30m',
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        brightBlack: '\x1b[90m',
        brightRed: '\x1b[91m',
        brightGreen: '\x1b[92m',
        brightYellow: '\x1b[93m',
        brightBlue: '\x1b[94m',
        brightMagenta: '\x1b[95m',
        brightCyan: '\x1b[96m',
        brightWhite: '\x1b[97m',
        customColor: function (code: number) { return `\x1b[38;5;${code}m`; },
    },

    // Background color
    bc: {
        defaultColor: '\x1b[49m',
        black: '\x1b[40m',
        red: '\x1b[41m',
        green: '\x1b[42m',
        yellow: '\x1b[43m',
        blue: '\x1b[44m',
        magenta: '\x1b[45m',
        cyan: '\x1b[46m',
        white: '\x1b[47m',
        brightBlack: '\x1b[100m',
        brightRed: '\x1b[101m',
        brightGreen: '\x1b[102m',
        brightYellow: '\x1b[103m',
        brightBlue: '\x1b[104m',
        brightMagenta: '\x1b[105m',
        brightCyan: '\x1b[106m',
        brightWhite: '\x1b[107m',
        customBgColor: function (code: number) { return `\x1b[48;5;${code}m`; },
    }
};

export const term = t;
