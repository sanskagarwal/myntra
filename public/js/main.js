"use strict";

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var isMature = false;
var localStream;
var pc;
var remoteStream;

/////////////////////////////////////////////

var room = "foo";
// Could prompt for room name:
// room = prompt('Enter room name:');

var socket = io.connect();

if (room !== "") {
  socket.emit("create or join", room);
  console.log("Attempted to create or join room", room);
}

socket.on("created", function (room) {
  console.log("Created room " + room);
  isMature = true;
  isInitiator = true;
});

// socket.on("full", function (room) {
//   console.log("Room " + room + " is full");
// });

socket.on("join", function (room) {
  console.log("Another peer made a request to join room " + room);
  console.log("This peer is the initiator of room " + room + "!");
  isChannelReady = true;
});

socket.on("joined", function (room) {
  console.log("joined: " + room);
  isChannelReady = true;
});

socket.on("log", function (array) {
  console.log.apply(console, array);
});

////////////////////////////////////////////////

function sendMessage(message) {
  console.log("Client sending message: ", message);
  socket.emit("message", message);
}

// This client receives a message
socket.on("message", function (message) {
  console.log("Client received message:", message);
  if (message === "got user media") {
    maybeStart();
  } else if (message.type === "offer" && !isMature) {
    if (!isInitiator && !isStarted) {
      maybeStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (
    message.type === "answer" &&
    isStarted &&
    isMature &&
    !(isMature === true && message.fromMature === true)
  ) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (
    message.type === "candidate" &&
    isStarted &&
    !(isMature === true && message.fromMature === true)
  ) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate,
    });
    pc.addIceCandidate(candidate);
  } else if (message === "bye" && isStarted) {
    handleRemoteHangup();
  }
});

////////////////////////////////////////////////////

var localVideo = document.querySelector("#localVideo");
var remoteVideo = document.querySelector("#remoteVideo");

navigator.mediaDevices
  .getUserMedia({
    audio: false,
    video: true,
  })
  .then(gotStream)
  .catch(function (e) {
    alert("getUserMedia() error: " + e.name);
  });

function gotStream(stream) {
  console.log("Adding local stream.");
  localStream = stream;
  localVideo.srcObject = stream;
  sendMessage("got user media");
  if (isInitiator) {
    maybeStart();
  }
}

var constraints = {
  video: true,
};

console.log("Getting user media with constraints", constraints);

function maybeStart() {
  console.log(">>>>>>> maybeStart() ", isStarted, localStream, isChannelReady);
  if (!isStarted && typeof localStream !== "undefined" && isChannelReady) {
    console.log(">>>>>> creating peer connection");
    createPeerConnection();
    pc.addStream(localStream);
    isStarted = true;
    console.log("isInitiator", isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

window.onbeforeunload = function () {
  sendMessage("bye");
};

/////////////////////////////////////////////////////////

function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(null);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;
    console.log("Created RTCPeerConnnection");
  } catch (e) {
    console.log("Failed to create PeerConnection, exception: " + e.message);
    alert("Cannot create RTCPeerConnection object.");
    return;
  }
}

function handleIceCandidate(event) {
  console.log("icecandidate event: ", event);
  if (event.candidate) {
    sendMessage({
      type: "candidate",
      fromMature: isMature,
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate,
    });
  } else {
    console.log("End of candidates.");
    isMature = true;
    isInitiator = true;
    isStarted = false;
    isChannelReady = false;
  }
}

function handleCreateOfferError(event) {
  console.log("createOffer() error: ", event);
}

function doCall() {
  console.log("Sending offer to peer");
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
  console.log("Sending answer to peer.");
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

function setLocalAndSendMessage(sessionDescription) {
  sessionDescription.fromMature = isMature;
  pc.setLocalDescription(sessionDescription);
  console.log("setLocalAndSendMessage sending message", sessionDescription);
  sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
  trace("Failed to create session description: " + error.toString());
}

function handleRemoteStreamAdded(event) {
  console.log("Remote stream added.");
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

// TODO This function hasn't fired in testing yet, so the variables change might be buggy.
function handleRemoteStreamRemoved(event) {
  console.error("Triggered??");
  console.log("Remote stream removed. Event: ", event);
  // isInitiator = false;
  // isChannelReady = false;
  // isStarted = false;
}

function hangup() {
  console.log("Hanging up.");
  stop();
  sendMessage("bye");
}

function handleRemoteHangup() {
  console.log("Session terminated.");
  stop();
}

function stop() {
  isMature = false;
  isInitiator = false;
  isStarted = false;
  isChannelReady = false;

  pc.close();
  pc = null;
}
