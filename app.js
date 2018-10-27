var os = require("os");
var express = require("express");
var app = express();
app.use(express.static("public"));
var http = require("http").Server(app);
var io = require("socket.io")(http);

http.listen(8080, function() {
  console.log("listening on localhost:8080");
});

app.get("/", function(req, res) {
  res.sendfile("index.html");
});

io.on("connection", function(socket) {
  socket.on("message", function(message) {
    console.log("Client said: ", message);
    // for a real app, would be room-only (not broadcast)
    socket.broadcast.emit("message", message);
  });

  socket.on("create or join", function(room) {
    console.log("Received request to create or join room " + room);

    var clientsInRoom = io.sockets.adapter.rooms[room];
    var numClients = clientsInRoom
      ? Object.keys(clientsInRoom.sockets).length
      : 0;
    console.log("Room " + room + " now has " + numClients + " client(s)");

    if (numClients === 0) {
      socket.join(room);
      console.log("Client ID " + socket.id + " created room " + room);
      socket.emit("created", room, socket.id);
    } else if (numClients === 1) {
      console.log("Client ID " + socket.id + " joined room " + room);
      io.sockets.in(room).emit("join", room);
      socket.join(room);
      socket.emit("joined", room, socket.id);
      io.sockets.in(room).emit("ready");
    } else {
      // max two clients
      socket.emit("full", room);
    }
  });

  socket.on("ipaddr", function() {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === "IPv4" && details.address !== "127.0.0.1") {
          socket.emit("ipaddr", details.address);
        }
      });
    }
  });

  socket.on('exit', function(){
    console.log('received bye');
  });
});
