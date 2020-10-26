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
  socket.on("message", function (message) {
    if (message.sendToRemoteUser) {
      socket.broadcast.to(message.to).emit("message", message);
    } else {
      socket.broadcast.emit("message", message);
    }
  });

  socket.on("create or join", function (room) {
    var clientsInRoom = io.sockets.adapter.rooms[room];
    var numClients = clientsInRoom
      ? Object.keys(clientsInRoom.sockets).length
      : 0;
    console.log(numClients);

    if (numClients === 0) {
      socket.join(room);
      socket.emit("created", room, socket.id);
    } else {
      io.sockets.in(room).emit("join", room);
      socket.join(room);
      socket.emit(
        "joined",
        room,
        socket.id,
        Object.keys(clientsInRoom.sockets)
      );
      io.sockets.in(room).emit("ready");
    }
    console.log(clientsInRoom ? Object.keys(clientsInRoom.sockets) : true);

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
