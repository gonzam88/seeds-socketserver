const express = require('express');
const WebSocket = require('ws');
const SocketServer = WebSocket.Server;
const path = require('path');
var Victor = require('victor');

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


var totalInk = 10;
var currInk;
var artistLastPoint;

var playersQueue = [];
var clientPlotter;
var currArtist;

function heartbeat() {
	this.isAlive = true;
}

// Chequeando la QUEUE
wss.UpdateQueue = function(){

	if(playersQueue.length > 0 && (currArtist == null || currArtist == undefined)){
        // NUEVO ARTistA
		currArtist = playersQueue.shift();
        currArtist.isDrawing = true
        currArtist.send( JSON.stringify({action: "sosartista"}) )
        currInk = totalInk;
	}
	// data vacia
	let msg = {
		action 		: "queuelist",
		players 	: [],
		artist 		: ""
	};
	// cargo msg
    if(currArtist){
        msg.artist = [currArtist.nickname, currArtist.id];
    }
	for(let i = 0; i < playersQueue.length; i++){
		msg.players.push([
			playersQueue[i].nickname,
			playersQueue[i].id
		])
	}
	// le mando a todos la nueva cola
	wss.clients.forEach(function each(client) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify(msg));
		}
	});
}

wss.on('connection', function connection(ws, req) {
	ws.id = wss.getUniqueID();
    ws.isAlive = true;
	// ws.ip = req.headers['x-forwarded-for'].split(/\s*,\s*/)[0] || req.connection.remoteAddress;
    var hostName = req.headers[':authority'] || req.headers.host;
    ws.host = hostName.split(':')[0];

	ws.on('pong', heartbeat);

	ws.on('message', function incoming(message) {
		// console.log('received: %s', message);
        let char = message.slice(0, 1);
        if(char == "[" || char == "{"){
	        // Mensaje Json
	        var data = JSON.parse(message);
            let msg;
	        // console.log("Msj Json: ");
	        // console.log(data);
	        switch (data.action) {

				case "login":
					ws.nickname = data.nickname;
					ws.role = data.role;
                    ws.id = wss.getUniqueID();

                    msg ={
                        action: "login",
                        id: ws.id,
                    }
                    ws.send(JSON.stringify(msg));

					if(ws.role == "plottersecreto"){
						clientPlotter = ws;

					}else {
						ws.isDrawing = false;
						playersQueue.push(ws);
						wss.UpdateQueue();
					}

					console.log("Usr Login: " + ws.nickname + " || Host: " + ws.host);
					break;

                case "status":
                    msg = {
                        action: "queuelist",
                        players: [],
                        artist: ""
                    }

                    if(currArtist){
                        msg.artist = [currArtist.nickname, currArtist.id];
                    }
                	for(let i = 0; i < playersQueue.length; i++){
                		msg.players.push([
                			playersQueue[i].nickname,
                			playersQueue[i].id
                		])
                	}
                    ws.send(JSON.stringify(msg));
                    break;

				case "linestart":
					if(!ws.isDrawing) return;
                    artistLastPoint = new Victor(data.x, data.y)
					// Broadcast to everyone else.
				    wss.clients.forEach(function each(client) {
				      if (client !== ws && client.readyState === WebSocket.OPEN) {
				        client.send(JSON.stringify(data));
				      }
				    });
					break;
				case "vertex":
					if(!ws.isDrawing) return;

                    let newPoint = new Victor(data.x, data.y)
                    let dist = artistLastPoint.distance(newPoint);
                    currInk -= dist;
                    artistLastPoint = newPoint;
                    data.ink = currInk;

                    // Broadcast to everyone
				    wss.clients.forEach(function each(client) {
				      if (client.readyState === WebSocket.OPEN) {
				        client.send(JSON.stringify(data));
				      }
				    });

                    if(currInk <= 0){
                        console.log("A " + ws.nickname + " se le terminó la tinta")
                        ws.isDrawing = false;
                        currArtist = undefined;
                        wss.UpdateQueue();
                    }

					break;
				case "lineend":
					if(!ws.isDrawing) return;
					// Broadcast to everyone else.
				    wss.clients.forEach(function each(client) {
				      if (client !== ws && client.readyState === WebSocket.OPEN) {
				        client.send(JSON.stringify(data));
				      }
				    });

					// ws.isDrawing = false;
					// currArtist = undefined;
					// wss.UpdateQueue();
					break;
			}
		}
	});

	ws.on('close', function connection(client) {
		// cliente comun
		if(ws.isDrawing){
			ws.isDrawing = false;
			currArtist = undefined;
		}else{
			for(let i=0; i < playersQueue.length; i++){
                if(ws.id == playersQueue[i].id){
                    // Lo saco de la queue
                    playersQueue.splice(i,1);
                }
			}
		}
		wss.UpdateQueue();

        console.log("Conexion cerrada: " + ws.nickname);
	});
});


// Ping pong
function noop() {}
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();

    ws.isAlive = false;
    ws.ping(noop);
  });
}, 30000);
