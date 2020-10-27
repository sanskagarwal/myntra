"use strict";

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var usersAlreadyPresent;
var userIndex = -1;
var remoteUser;
var currentUser;
var localVideo = document.querySelector("#localVideo");

/////////////////////////////////////////////

var room = "foo";
// Could prompt for room name:
// room = prompt('Enter room name:');

var socket = io.connect();
socket.on("connect", function () {
  currentUser = socket.id;
  notifyRemoteOfJoining();
});

socket.on("created", function (room) {
  console.log("Created room " + room);
  isInitiator = true;
  setupEvents();
});

socket.on("join", function (room) {
  console.log("Another peer made a request to join room " + room);
  console.log("This peer is the initiator of room " + room + "!");
  isChannelReady = true;
});

socket.on("joined", function (room, socketId, sockets) {
  console.log("joined: " + room);
  usersAlreadyPresent = sockets;
  usersAlreadyPresent = usersAlreadyPresent.slice(
    0,
    usersAlreadyPresent.length - 1
  );
  isChannelReady = true;
  setupEvents();
});

socket.on("disconnected", function (socketId) {
  var videoElement = document.getElementById("user-" + socketId);
  if (videoElement) {
    videoElement.remove();
  }
});

////////////////////////////////////////////////

function sendMessage(message) {
  if (isInitiator === false && usersAlreadyPresent) {
    message.sendToRemoteUser = true;
  }
  message.fromInitiator = isInitiator;
  message.from = currentUser;
  message.to = remoteUser;
  console.log("Client sending message: ", message);
  socket.emit("message", message);
}

// This client receives a message
socket.on("message", function (message) {
  remoteUser = message.from ? message.from : remoteUser;
  console.log(remoteUser);
  console.log("Client received message:", message);
  if (message.type === "init") {
    maybeStart();
  } else if (
    message.type === "offer" &&
    !isInitiator &&
    !(message.fromInitiator && isInitiator)
  ) {
    if (!isInitiator && !isStarted) {
      maybeStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (
    message.type === "answer" &&
    isStarted &&
    !(message.fromInitiator && isInitiator)
  ) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === "candidate" && isStarted) {
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

// Wait for socket to get it's id.
function notifyRemoteOfJoining() {
  if (room !== "") {
    socket.emit("create or join", room);
    console.log("Attempted to create or join room", room);
  }
}

function setupEvents() {
  navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: true,
    })
    .then(gotStream);
}

function gotStream(stream) {
  console.log("Adding local stream.");
  localStream = stream;
  localVideo.srcObject = stream;
  interactUser();
  sendMessage({ type: "init" });
  if (isInitiator) {
    maybeStart();
  }
}

function interactUser() {
  userIndex++;
  console.log(userIndex);
  if (usersAlreadyPresent && usersAlreadyPresent.length > userIndex) {
    remoteUser = usersAlreadyPresent[userIndex];
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
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate,
    });
  } else {
    console.log("End of candidates.");

    maybeEnd();
  }
}

// Super Buggy Function, find a better way to do it.
// This will be exponentially poor.
function maybeEnd() {
  // Assuming this will be called after the last step.
  setTimeout(function () {
    if (isInitiator) {
      isInitiator = true;
      isStarted = false;
      isChannelReady = false;
    } else if (userIndex + 1 === usersAlreadyPresent.length) {
      isInitiator = true;
      isStarted = false;
      isChannelReady = false;
    } else {
      isInitiator = false;
      isStarted = false;
      isChannelReady = true;
      interactUser();
      sendMessage({ type: "init" });
    }
  }, 2000);
}

function handleCreateOfferError(event) {
  console.log("createOffer() error: ", event);
}

function doCall() {
  console.log("Sending offer to peer");
  pc.createOffer()
    .then(function (offer) {
      return pc.setLocalDescription(offer);
    })
    .then(function () {
      var offer = pc.localDescription;
      offer.fromInitiator = isInitiator;
      sendMessage(offer);
    })
    .catch(handleCreateOfferError);
}

function doAnswer() {
  console.log("Sending answer to peer.");
  pc.createAnswer()
    .then(function (answer) {
      return pc.setLocalDescription(answer);
    })
    .then(function () {
      var answer = pc.localDescription;
      answer.fromInitiator = isInitiator;
      sendMessage(answer);
    })
    .catch(onCreateSessionDescriptionError);
}

function onCreateSessionDescriptionError(error) {
  trace("Failed to create session description: " + error.toString());
}

function handleRemoteStreamAdded(event) {
  console.log("Remote stream added.");
  remoteStream = event.stream;

  var remoteVideo = document.createElement("video");
  remoteVideo.setAttribute("id", "user-" + remoteUser);
  remoteVideo.autoplay = true;
  remoteVideo.playsinline = true;
  remoteVideo.srcObject = remoteStream;

  document.getElementById("videos").appendChild(remoteVideo);
}

// TODO This function hasn't fired in testing yet, so the variables change might be buggy.
function handleRemoteStreamRemoved(event) {
  // console.error("Triggered??");
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
  isInitiator = false;
  isStarted = false;
  isChannelReady = false;
  usersAlreadyPresent = undefined;
  userIndex = -1;
  remoteUser = undefined;
  currentUser = undefined;

  pc.close();
  pc = null;
}

let mic_switch = true;
let video_switch = true;

function toggleVideo() {
  if (localStream != null && localStream.getVideoTracks().length > 0) {
    video_switch = !video_switch;

    localStream.getVideoTracks()[0].enabled = video_switch;
  }
}

function toggleMic() {
  if (localStream != null && localStream.getAudioTracks().length > 0) {
    mic_switch = !mic_switch;

    localStream.getAudioTracks()[0].enabled = mic_switch;
  }
}
