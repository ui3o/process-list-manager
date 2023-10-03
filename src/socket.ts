
import fs from 'fs';
import minimist from 'minimist';
import net from 'net';
import { log } from './global';
import { msgToLog } from './logger';

const connections: {
    [name: string]: net.Socket

} = {};
const toLog = (msg: string) => { msgToLog(msg, 'pol   ') }
var server: net.Server, client: net.Socket;

// prevent duplicate exit messages
var SHUTDOWN = false;

// Our socket
const SOCKETFILE = '/tmp/pol.sock';

function _serverCreate(socket: string, onMsg = async (msg: minimist.ParsedArgs, stream: net.Socket) => { }) {
    toLog('Socket server: creating');
    let sock;
    return new Promise((resolve: any) => {
        server = net.createServer(function (stream) {
            toLog('Socket server: connection acknowledged');
            // Store all connections so we can terminate them if the server closes.
            // An object is better than an array for these.
            var self = (Date.now()).toString();
            connections[self] = stream;
            stream.on('end', function () {
                toLog('Socket server: client disconnected');
                delete connections[self];
            });

            // Messages are buffers. use toString
            stream.on('data', async (msg: string) => {
                const _msg: minimist.ParsedArgs = JSON.parse(msg.toString());
                onMsg(_msg, connections[self]);
                // stream.write('qux'); // need to be call in place, can not reference to write function
            });
            stream.on('error', async (exc: any) => {
               delete connections[self];
            });
        }).listen(socket).on('connection', function (_socket) {
            toLog('Socket server: client connected');
            sock = _socket;
            // _socket.write('__boop');// send to client immediately after connect
        });
        resolve();
    });
}

export const serverCleanup = () => {
    if (!SHUTDOWN && server) {
        SHUTDOWN = true;
        toLog("Socket server: terminating");
        if (Object.keys(connections).length) {
            let clients = Object.keys(connections);
            while (clients.length) {
                let client = clients.pop() as string;
                //connections[client].write('__disconnect'); // send to client immediately before disconnect
                connections[client].end();
            }
        }
        server.close();
    }
}
export const serverCreate = async (onMsg = async (msg: minimist.ParsedArgs, stream: net.Socket) => { }) => {
    // check for failed cleanup
    toLog('Socket server: checking for leftover socket');

    if (fs.existsSync(SOCKETFILE)) {
        toLog('Socket server: removing leftover socket.');
        fs.unlinkSync(SOCKETFILE);
    } else {
        toLog('Socket sestringrver: no leftover socket found.');
    }
    // close all connections when the user does CTRL-C
    process.on('exit', serverCleanup);
    return _serverCreate(SOCKETFILE, onMsg);
}


export const clientCleanup = () => {
    if (!SHUTDOWN && client) {
        SHUTDOWN = true;
        toLog("Socket client: Terminating.");
        client.end();
    }
}

export const clientCreate = () => {
    // Connect to server.
    // log.log("Socket client: connecting to server");
    process.on('exit', clientCleanup);
    return new Promise<net.Socket>((resolve) => {
        client = net.createConnection(SOCKETFILE)
            .on('connect', () => {
                // log.log("Socket client: connected");
                resolve(client);
            })
            // Messages are buffers. use toString
            .on('data', function (data: Buffer) {
                const dataStr = data.toString();
                log.log(dataStr);
                // if (data === '__boop') {
                //     client.write('__snootbooped');
            })
            .on('error', function (data) {
                log.log('pol daemon not running. run `pol boot` first!'); process.exit(1);
            }).on('close', function (data) {
                // log.log('Server closed.'); process.exit(1);
            });
    });

}