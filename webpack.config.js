const path = require('path');
const ShebangPlugin = require('webpack-shebang-plugin');

module.exports = {
    entry: './entry/pol.ts',
    devtool: "inline-source-map",
    module: {
        rules: [
            {
                test: /\.ts?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    plugins: [
        new ShebangPlugin()
    ],
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
        filename: 'pol.js',
        path: path.resolve(__dirname, 'bin'),
    },
    target: "node"
};