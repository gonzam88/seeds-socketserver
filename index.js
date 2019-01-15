const express = require('express');
const SocketServer = require('ws').Server;
const path = require('path');

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'index.html');

const server = express()
  .use((req, res) => res.sendFile(INDEX) )
  .listen(PORT, () => console.log(`Listening on ${ PORT }`));

const wss = new SocketServer({ server });


wss.getUniqueID = function () {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }
    return s4() + s4() + '-' + s4();
};


var playersQueue = [];
var clientsPaneles = [];
var clientPlotter;

function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', function connection(ws, req) {
	ws.id = wss.getUniqueID();
    ws.isAlive = true;
	ws.ip = req.headers['x-forwarded-for'].split(/\s*,\s*/)[0] || req.connection.remoteAddress;
	ws.on('pong', heartbeat);

	ws.on('message', function incoming(message) {
		// console.log('received: %s', message);
        let char = message.slice(0, 1);
        if(char == "[" || char == "{"){
	        // Mensaje Json
	        var data = JSON.parse(message);
	        // console.log("Msj Json: ");
	        // console.log(data);
	        switch (data.action) {
				case "login":
					ws.nickname = data.nickname;
					ws.role = data.role;
					if(ws.role == "panel"){
						clientsPaneles.push(ws);
						ws.isPanel = true;

					}else if(ws.role == "plottersecreto"){
						clientPlotter = ws;

					}else {
						ws.isQueue = true;
						playersQueue.push(ws);
					}
					console.log("Usr Login: " + ws.nickname);
					break;

				case "refreshPanel":
	                wss.UpdatePaneles(ws);
	            	break;

				case "line-start":
					if(!clientPlotter) return;
					// clientPlotter.send(pos)
					break;
				case "vertex":
					if(!clientPlotter) return;
					// clientPlotter.send(pos)
					break;
				case "line-end":
					if(!clientPlotter) return;
					// clientPlotter.send(pos)
					break;
			}
		}
	});

	ws.on('close', function connection(client) {
		switch(ws.role){
			case "plottersecreto":
			break;

			case "panel":
			break;

			default:
			break;
		}
        console.log("Conexion cerrada: " + ws.nickname);
	});
});


// Ping pong
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();

    ws.isAlive = false;
    ws.ping(noop);
  });
}, 30000);
