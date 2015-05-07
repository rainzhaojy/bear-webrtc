var static = require('node-static'),
    file = new (static.Server)(),
    config = require('getconfig'),
    fs = require('fs'),
    nPort = parseInt(config.server.port, 10),
    LoggerObj = require("./bear.logger.js").Logger,
    logger = new LoggerObj();

function onHttpRequest(req, res){
    file.serve(req, res);
}

var httpServ = (config.server.secure) ? require('https') : require('http');
var app;
if (config.server.secure) {
    app = httpServ.createServer({
        // providing server with  SSL key/cert
        key: fs.readFileSync( config.server.key ),
        cert: fs.readFileSync( config.server.cert )
    }, onHttpRequest ).listen( nPort );
}
else {
    app = httpServ.createServer( onHttpRequest ).listen( nPort );
}

logger.log(config.server.secure ? 'https' : 'http', 'is started and is listening on port', nPort);

var WebSocketServer = require('ws').Server
    , wss = new WebSocketServer({ server: app });

logger.log('web socket server is started.');

//to generate the clientId
var clientIDIndex = 0;

wss.broadcast = function(self, data) {
    wss.clients.forEach(function each(client) {
        if (client !== self) {
            client.send(data);
        }
    });
};

wss.on('connection', function(ws) {
    var clientId = ++clientIDIndex;

    logger.info('client connected: assigned the client id [', clientId, ']', ', total connections:', wss.clients.length);

    ws.on('message', function incoming(message) {
        logger.log('[', clientId, ']:', message.length > 100 ? (message.slice(0, 100) + '...') : message);

        //the simulator behave as a broadcast bridge, broadcast the message to all other clients
        wss.broadcast(ws, message);
    });

    ws.on('close', function close() {
        logger.info('client disconnected: client id [', clientId, '], current connections:', wss.clients.length);
    });

    ws.on('error', function error(e) {
        logger.error('ERROR', e);
    });
});
