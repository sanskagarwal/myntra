const express = require("express");
const app = express();
const http = require("http");
const os = require("os");
const server = http.createServer(app);
const socketio = require("socket.io");
const io = socketio(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", (req, res) => {
  return res.sendFile(__dirname + "/public/index.html");
});

io.sockets.on("connection", function (socket) {
  // convenience function to log server messages on the client
  function log() {
    var array = ["Message from server:"];
    array.push.apply(array, arguments);
    socket.emit("log", array);
  }

  socket.on("message", function (message) {
    log("Client said: ", message);
    // for a real app, would be room-only (not broadcast)
    socket.broadcast.emit("message", message);
  });

  socket.on("create or join", function (room) {
    log("Received request to create or join room " + room);

    var clientsInRoom = io.sockets.adapter.rooms[room];
    var numClients = clientsInRoom
      ? Object.keys(clientsInRoom.sockets).length
      : 0;
    console.log(numClients);
    log("Room " + room + " now has " + numClients + " client(s)");

    if (numClients === 0) {
      socket.join(room);
      log("Client ID " + socket.id + " created room " + room);
      socket.emit("created", room, socket.id);
    } else {
      // if (numClients === 1) {
      log("Client ID " + socket.id + " joined room " + room);
      io.sockets.in(room).emit("join", room);
      socket.join(room);
      socket.emit("joined", room, socket.id);
      io.sockets.in(room).emit("ready");
    }
    // else {
    //   // max two clients
    //   socket.emit("full", room);
    // }
  });

  socket.on("ipaddr", function () {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
      ifaces[dev].forEach(function (details) {
        if (details.family === "IPv4" && details.address !== "127.0.0.1") {
          socket.emit("ipaddr", details.address);
        }
      });
    }
  });
});

server.listen(3000, () => {
  return console.log("Server is up on 3000");
});
