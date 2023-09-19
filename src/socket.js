
const { msgToLog, log } = require('./global');
const net = require('net');
const fs = require('fs');
const connections = {};
const toLog = (msg) => { msgToLog(msg, ' pold ') }
var server, client;

// prevent duplicate exit messages
var SHUTDOWN = false;

// Our socket
const SOCKETFILE = '/tmp/pold.sock';

function serverCreate(socket, onMsg = async (msg, stream) => { }) {
    toLog('Socket server: creating');
    let sock;
    return new Promise((resolve) => {
        server = net.createServer(function (stream) {
            toLog('Socket server: connection acknowledged');
            // Store all connections so we can terminate them if the server closes.
            // An object is better than an array for these.
            var self = Date.now();
            connections[self] = (stream);
            stream.on('end', function () {
                toLog('Socket server: client disconnected');
                delete connections[self];
            });

            // Messages are buffers. use toString
            stream.on('data', async (msg) => {
                msg = JSON.parse(msg.toString());
                onMsg(msg, connections[self]);
                // stream.write('qux'); // need to be call in place, can not reference to write function
            });
        }).listen(socket).on('connection', function (_socket) {
            toLog('Socket server: client connected');
            sock = _socket;
            // _socket.write('__boop');// send to client immediately after connect
        });
        resolve();
    });
}

module.exports.serverCleanup = () => {
    if (!SHUTDOWN && server) {
        SHUTDOWN = true;
        toLog("Socket server: terminating");
        if (Object.keys(connections).length) {
            let clients = Object.keys(connections);
            while (clients.length) {
                let client = clients.pop();
                //connections[client].write('__disconnect'); // send to client immediately before disconnect
                connections[client].end();
            }
        }
        server.close();
    }
}
module.exports.serverCreate = async (onMsg = async (msg, stream) => { }) => {
    // check for failed cleanup
    toLog('Socket server: checking for leftover socket');

    if (fs.existsSync(SOCKETFILE)) {
        toLog('Socket server: removing leftover socket.');
        fs.unlinkSync(SOCKETFILE);
    } else {
        toLog('Socket server: no leftover socket found.');
    }
    // close all connections when the user does CTRL-C
    process.on('exit', module.exports.serverCleanup);
    return serverCreate(SOCKETFILE, onMsg);
}


module.exports.clientCleanup = () => {
    if (!SHUTDOWN && client) {
        SHUTDOWN = true;
        toLog("Socket client: Terminating.");
        client.end();
    }
}

module.exports.clientCreate = () => {
    // Connect to server.
    // log.log("Socket client: connecting to server");
    process.on('exit', module.exports.clientCleanup);
    return new Promise((resolve) => {
        client = net.createConnection(SOCKETFILE)
            .on('connect', () => {
                // log.log("Socket client: connected");
                resolve(client);
            })
            // Messages are buffers. use toString
            .on('data', function (data) {
                data = data.toString();
                log.log(data);
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