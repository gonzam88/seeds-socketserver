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
var clientPlotter;
var currArtist;

function heartbeat() {
	this.isAlive = true;
}

// Chequeando la QUEUE
wss.UpdateQueue = function(){
	if(playersQueue > 0 && currArtist == null){
		currArtist = playersQueue.shift();
	}
	// data vacia
	var data = {
		action 		: "queuelist",
		players 	: [],
		artist 		: [currArtist.nickname, currArtist.id]
	};
	// cargo data
	for(let i = 0; i < playersQueue.length; i++){
		data.players.push([
			playersQueue[i].nickname,
			playersQueue[i].id
		])
	}
	// le mando a todos la nueva cola
	wss.clients.forEach(function each(client) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(data);
		}
	});
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

					if(ws.role == "plottersecreto"){
						clientPlotter = ws;

					}else {
						ws.isDrawing = false;
						playersQueue.push(ws);
						wss.UpdateQueue();


					}
					console.log("Usr Login: " + ws.nickname);
					break;

				case "linestart":
					if(!clientPlotter) return;
					if(!ws.isDrawing) return;
					// Broadcast to everyone else.
				    wss.clients.forEach(function each(client) {
				      if (client !== ws && client.readyState === WebSocket.OPEN) {
				        client.send(data);
				      }
				    });
					break;
				case "vertex":
					if(!clientPlotter) return;
					if(!ws.isDrawing) return;

					// Broadcast to everyone else.
				    wss.clients.forEach(function each(client) {
				      if (client !== ws && client.readyState === WebSocket.OPEN) {
				        client.send(data);
				      }
				    });
					break;
				case "lineend":
					if(!clientPlotter) return;
					if(!ws.isDrawing) return;
					// Broadcast to everyone else.
				    wss.clients.forEach(function each(client) {
				      if (client !== ws && client.readyState === WebSocket.OPEN) {
				        client.send(data);
				      }
				    });

					ws.isDrawing = false;
					currArtist = null;
					wss.UpdateQueue();
					break;
			}
		}
	});

	ws.on('close', function connection(client) {
		switch(ws.role){
			case "plottersecreto":
				clientPlotter = null;
			break;

			default:
				// cliente comun
				if(ws.isDrawing){
					ws.isDrawing = false;
					currArtist = null;
				}else{
					for(let i=0; i < playersQueue.length; i++){
		                if(ws.id == playersQueue[i].id){
		                    // Lo saco de la queue
		                    playersQueue.splice(i,1);
		                }
					}
				}
				wss.UpdateQueue();
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
