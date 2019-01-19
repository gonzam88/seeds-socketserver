
const express = require('express');
const WebSocket = require('ws');
const SocketServer = WebSocket.Server;
const path = require('path');
var Victor = require('victor');
var SelfReloadJSON = require('self-reload-json');
const fs = require('fs');

var secrets
try {
    secrets = require('./secrets.json');
}
catch (e) {
    console.log("No existe el archivo de secretos. No se podrá acceder con contraseña")
}


var config = new SelfReloadJSON( path.join(__dirname, 'config.json'));
config.on('updated', function(json) {
    console.log("config updated.");
    // Enviando a clientes nueva configuracion
    let msg = {
        action: "clientOptions",
        clientOptions: config
    }
    wss.clients.forEach(function each(client) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify(msg));
		}
	});
})
config.on('error', function(err) {
    console.log("error cargando config")
})

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


var currInk;
var artistLastPoint;

var playersQueue = [];
var clientPlotter;
var currArtist;

var playersLines = [];
var cuantasLineasVan = 0;

var inactivityTimer;
var idleTimer;
var artistOverallTimer;

function heartbeat() {
	this.isAlive = true;
}

// Chequeando la QUEUE
wss.UpdateQueue = function(){

	if(playersQueue.length > 0 && (currArtist == null || currArtist == undefined)){
        // NUEVO ARTistA
        currArtist = playersQueue.shift()
        currArtist.isDrawing = true
        currArtist.send( JSON.stringify({action: "sosartista"}) )
        currInk = config.totalInk;

        clearTimeout(artistOverallTimer);
        artistOverallTimer = setTimeout(function(){
            // Pasó mucho tiempo. Proximo ARTistA
            if(!currArtist) return;
            currArtist.send(JSON.stringify({action : "stopartista", reason: "Inactivity timeout"}));
            console.log(currArtist.nickname + " fue salteado. Se le termino el tiempo total")
            currArtist.isDrawing = false;
            currArtist = undefined;
            wss.UpdateQueue();
        }, 1000 * config.tiempoTotalArtista)

        // Timer para ver si no responde. Se desactiva con la primer linea que manda
        inactivityTimer = setTimeout(function(){
            // Pasó mucho tiempo. Proximo ARTistA
            if(!currArtist) return;
            currArtist.send(JSON.stringify({action : "stopartista", reason: "Inactivity timeout"}));
            console.log(currArtist.nickname + " fue salteado por inactivdad")
            currArtist.isDrawing = false;
            currArtist = undefined;
            wss.UpdateQueue();
            // Enviarle un aviso o algo asi
        }, 1000 * config.tiempoInactividadInicial)
	}

	// data vacia
	let msg = {
		action 		: "queuelist",
		players 	: [],
		artist 		: "",
        totalConnections: wss.clients.size
	};
	// cargo msg
    if(currArtist){
        msg.artist = [currArtist.nickname, currArtist.id];
    }
	for(let i = 0; i < playersQueue.length; i++){
        if(playersQueue[i].role == "plottersecreto") continue;
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
                        playersLines: playersLines,
                        totalInk: config.totalInk
                    }
                    ws.send(JSON.stringify(msg));

					if(ws.role == "plottersecreto"){
						clientPlotter = ws;

					}else if(ws.role == "panel"){
                        // nothing
                    }else {
						ws.isDrawing = false;
						playersQueue.push(ws);
						wss.UpdateQueue();
					}

					console.log("Usr Login: " + ws.nickname + " || Host: " + ws.host);
					break;
                case "getClientOptions":
                    msg = {
                        action: "clientOptions",
                        clientOptions: config
                    };
                    ws.send(JSON.stringify(msg));
                    break;

                case "changeClientOptions":
                    if(typeof data.password == "undefined" || data.password !== secrets.password) {console.log("contraseña incorrecta"); return;}
                    fs.writeFile("config.json", JSON.stringify(data.config, undefined, 4), function(err) {
                        if(err) {
                            return console.log(err);
                        }
                        console.log("The file was saved!");
                    });
                    break;
                case "saltearArtista":
                    if(typeof data.password == "undefined" || data.password !== secrets.password) {console.log("contraseña incorrecta"); return;}
                    currArtist.isDrawing = false;
                    currArtist.send(JSON.stringify({action:"stopartista"}))
                    currArtist = undefined;
                    console.log("El artista fue salteado");
                    wss.UpdateQueue();

                    break;
                case "borrarDibujo":
                    if(typeof data.password == "undefined" || data.password !== secrets.password) {console.log("contraseña incorrecta"); return;}
                    // LEs mando a todo que borren el dibujo
                    wss.clients.forEach(function each(client) {
                      if (client.role !== "plottersecreto" && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({action: "borrarDibujo"}));
                      }
                    });
                    // Reseteo la variable
                    playersLines = [];
                    break;
                case "terminarDibujo":
                    if(!ws.isDrawing) return;
                    ws.isDrawing = false;
                    currArtist = undefined;
                    wss.UpdateQueue();
                    console.log(ws.nickname + " terminó su dibujo");
                    break;

                case "status":
                    msg = {
                        action: "queuelist",
                        players: [],
                        artist: "",
                        totalConnections: wss.clients.size
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

                    if(typeof inactivityTimer !== "undefined"){
                      clearTimeout(inactivityTimer);
                    }
                    if(typeof idleTimer !== "undefined"){
                      clearTimeout(idleTimer);
                    }

                    artistLastPoint = new Victor(data.x, data.y)

					// Broadcast to everyone else.
				    wss.clients.forEach(function each(client) {
				      if (client !== ws && client.readyState === WebSocket.OPEN) {
				        client.send(JSON.stringify(data));
				      }
				    });

                    // Guardo local
                    playersLines.push([]);
                    playersLines[playersLines.length-1].push([data.x, data.y]);

					break;
				case "vertex":
					if(!ws.isDrawing) return;
                    clearTimeout(idleTimer);

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

                    // guardo local
                    playersLines[playersLines.length-1].push([data.x, data.y]);

					break;
				case "lineend":
					if(!ws.isDrawing) return;
					// Broadcast to everyone else.
				    wss.clients.forEach(function each(client) {
				      if (client !== ws && client.readyState === WebSocket.OPEN) {
				        client.send(JSON.stringify(data));
				      }
				    });

                    idleTimer = setTimeout(function(){
                        // Pasó mucho tiempo. Proximo ARTistA
                        if(!currArtist) return;
                        currArtist.send(JSON.stringify({action : "stopartista", reason: "Idle timeout"}));
                        console.log(currArtist.nickname + " fue salteado por inactivdad")
                        currArtist.isDrawing = false;
                        currArtist = undefined;
                        wss.UpdateQueue();
                        // Enviarle un aviso o algo asi
                    }, 1000 * config.tiempoInactividadEntreLineas)

					break;
                case "lastVertexDone":
                    // El plotter me avisa que hizo la ultima linea que le mande
                    if(playersLines.length > 0 ){
                        let res = playersLines[0].shift(); // Borro el primer punto que haya
                        if(res === undefined && playersLines.length > 0) playersLines.shift(); // Si ya no quedan puntos, borro el container de linea


                        cuantasLineasVan++;
                        if(cuantasLineasVan == config.cadaCuantasLineasActualizo){
                            cuantasLineasVan = 0;
                            msg ={
                                action: "borrarLineas",
                                cuantas: config.cadaCuantasLineasActualizo
                            }
                            wss.clients.forEach(function each(client) {
        				      if (client.role !== "plottersecreto" && client.readyState === WebSocket.OPEN) {
        				        client.send(JSON.stringify(msg));
        				      }
        				    });
                        }
                    }
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
			for(let i = 0; i < playersQueue.length; i++){
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
}, 5000);
