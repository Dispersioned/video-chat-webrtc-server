const path = require('path');
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

const ACTIONS = require('./actions.js');
const PORT = process.env.PORT || 5000;

function getClientRooms() {
  const { rooms } = io.sockets.adapter;
  return Array.from(rooms.keys());
}

function shareRoomsInfo() {
  io.emit(ACTIONS.SHARE_ROOMS, getClientRooms());
}

const roomsUsersIds = {};

function handleJoinRoom(roomID, socketID, userID) {
  if (!roomsUsersIds[roomID]) roomsUsersIds[roomID] = {}; // create new rooms
  if (!roomsUsersIds[roomID][socketID]) roomsUsersIds[roomID][socketID] = userID; // add new users
  console.log('roomsUsersIds ', roomsUsersIds);
}

function handleLeaveRoom(roomID, socketID) {
  if (!roomsUsersIds[roomID][socketID]) {
    console.log(`cant leave room. socketID ${socketID} doesn't exist in roomID ${roomID}`);
  } else delete roomsUsersIds[roomID][socketID];

  if (Object.keys(roomsUsersIds[roomID])) delete roomsUsersIds[roomID]; // delete empty room
  console.log('roomsUsersIds ', roomsUsersIds);
}

io.on('connection', (socket) => {
  shareRoomsInfo();

  socket.on(ACTIONS.SHARE_ROOMS, () => {
    shareRoomsInfo();
  });

  socket.on(ACTIONS.JOIN, ({ room: roomID, userID }) => {
    const { rooms: joinedRooms } = socket;

    // is this check really necessary?
    if (Array.from(joinedRooms).includes(roomID)) return console.warn(`Already joined to ${roomID}`);

    handleJoinRoom(roomID, socket.id, userID);

    const clients = Array.from(io.sockets.adapter.rooms.get(roomID) || []);

    clients.forEach((clientID) => {
      io.to(clientID).emit(ACTIONS.ADD_PEER, {
        peerID: socket.id,
        peerUserID: userID,
        createOffer: false,
      });

      socket.emit(ACTIONS.ADD_PEER, {
        peerID: clientID,
        peerUserID: roomsUsersIds[roomID][clientID],
        createOffer: true,
      });
    });

    socket.join(roomID);
    shareRoomsInfo();
  });

  socket.on(ACTIONS.LEAVE, () => {
    const { rooms } = socket;

    Array.from(rooms).forEach((roomID) => {
      if (socket.id === roomID) return; // don't leave from myself
      handleLeaveRoom(roomID, socket.id);
      const clients = Array.from(io.sockets.adapter.rooms.get(roomID) || []);

      clients.forEach((clientID) => {
        io.to(clientID).emit(ACTIONS.REMOVE_PEER, {
          peerID: socket.id,
        });

        socket.emit(ACTIONS.REMOVE_PEER, {
          peerID: clientID,
        });
      });

      socket.leave(roomID);
    });

    shareRoomsInfo();
  });

  socket.on(ACTIONS.RELAY_SDP, ({ peerID, sessionDescription }) => {
    io.to(peerID).emit(ACTIONS.SESSION_DESCRIPTION, {
      peerID: socket.id,
      sessionDescription,
    });
  });

  socket.on(ACTIONS.RELAY_ICE, ({ peerID, iceCandidate }) => {
    io.to(peerID).emit(ACTIONS.ICE_CANDIDATE, {
      peerID: socket.id,
      iceCandidate,
    });
  });

  socket.on(ACTIONS.TOGGLE_VIDEO, (setTo) => {
    socket.broadcast.emit(ACTIONS.TOGGLE_VIDEO, socket.id, setTo);
  });
});

const publicPath = path.join(__dirname, 'build');

app.use(express.static(publicPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

server.listen(PORT, () => {
  console.log('Server Started!');
});
