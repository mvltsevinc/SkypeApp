"use strict";

let isInitiator = false; // for who is the first person in room info
let isChannelReady = false; // for another peer joining info
let localStream; // for reaching local stream info in global
let peerConnection; // for peer connection object
let remoteStream; // for reaching remote stream info in global
let isStarted = false;

var config = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    }
  ]
};

// Set up audio and video regardless of what devices are present.
var sdpconstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

var room = "foo";

var socket = io.connect();
if (room !== "") {
  socket.emit("create or join", room); // send create or join event to server
  console.log("Attempted to create or  join room", room);
}

/* Room Events Begin*/

// catch created event from server for creating room event
socket.on("created", function(room) {
  console.log("Created room " + room);
  isInitiator = true;
});
// catch room full event from server
socket.on("full", function(room) {
  console.log("Room " + room + " is full");
});
// catch join event for another peer joining info
socket.on("join", function(room) {
  console.log("Another peer made a request to join room " + room);
  console.log("This peer is the initiator of room " + room + "!");
  isChannelReady = true;
});

socket.on("joined", function(room) {
  console.log("joined: " + room);
  isChannelReady = true;
});

/* Room Events End*/

function sendMessage(message) {
  console.log("Client sending message: ", message);
  socket.emit("message", message); // send message
}

/* Local Settings */
const localVideo = document.querySelector("#localVideo");
const remoteVideo = document.querySelector("#remoteVideo");

const mediaStreamConstraints = {
  video: true,
  audio: true
};

function gotLocalMediaStream(mediaStream) {
  callButton.disabled = false;
  console.log("Adding local stream.");
  localStream = mediaStream;
  localVideo.srcObject = mediaStream;
  sendMessage("got user media");
  if (isInitiator) {
    tryStart();
  }
}

// Handles error by logging a message to the console with the error message.
function handleLocalMediaStreamError(error) {
  console.log("navigator.getUserMedia error: ", error);
}

// Define action buttons.
const startButton = document.getElementById("startButton");
const callButton = document.getElementById("callButton");
const hangupButton = document.getElementById("hangupButton");

// Set up initial action buttons status: disable call and hangup.
callButton.disabled = true;
hangupButton.disabled = true;

// Handles start button action: creates local MediaStream.
function startAction() {
  startButton.disabled = true;
  // Get local user media - Initializes media stream.
  navigator.mediaDevices
    .getUserMedia(mediaStreamConstraints)
    .then(gotLocalMediaStream)
    .catch(handleLocalMediaStreamError);
}

// Handles call button action: creates peer connection.
function callAction() {
  callButton.disabled = true;
  hangupButton.disabled = false;

  console.log("Starting call.");

  // Get local media stream tracks.
  const videoTracks = localStream.getVideoTracks();
  const audioTracks = localStream.getAudioTracks();
  if (videoTracks.length > 0) {
    console.log("Using video device:" + videoTracks[0].label);
  }
  if (audioTracks.length > 0) {
    console.log("Using audio device:", audioTracks[0].label);
  }

  /* 
    1-Create Local Peer Connection
    2-Add local stream to the peer connection
    3-Create offer
  */
  //createPeerConnection();
  tryStart();
}

function createPeerConnection() {
  try {
    //This is where you could specify STUN and TURN servers.
    const servers = null; // Allows for RTC server configuration.

    peerConnection = new RTCPeerConnection(servers);
    peerConnection.addEventListener("icecandidate", handleIceCandidate);
    //peerConnection.onicecandidate = handleIceCandidate;
    peerConnection.addEventListener("addstream", handleRemoteStreamAdded);
    //peerConnection.onaddstream = handleRemoteStreamAdded;
    peerConnection.addEventListener("removestream", handleRemoteStreamRemoved);
    //peerConnection.onremovestream = handleRemoteStreamRemoved;
    console.log("Created RTCPeerConnnection");
  } catch (e) {
    console.log("Failed to create PeerConnection, exception: " + e.message);
    alert("Cannot create RTCPeerConnection object.");
    return;
  }
}
// Get ICE Candidate and send to the server
function handleIceCandidate(event) {
  console.log("icecandidate event: ", event);
  if (event.candidate) {
    //emit to the server
    sendMessage({
      type: "candidate",
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log("End of candidates.");
  }
}
// emit to the server
function sendMessage(message) {
  console.log("Client sending message: ", message);
  socket.emit("message", message);
}
// PeerConnection addStream event's function
function handleRemoteStreamAdded(event) {
  console.log("Remote stream added.");
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}
// PeerConnection removestream event's function
function handleRemoteStreamRemoved(event) {
  console.log("Remote stream removed. Event: ", event);
}

function tryStart() {
  console.log(">>>>>>> maybeStart() ", isStarted, localStream, isChannelReady);
  if (!isStarted && typeof localStream !== "undefined" && isChannelReady) {
    console.log(">>>>>> creating peer connection");
    createPeerConnection();
    peerConnection.addStream(localStream);
    isStarted = true;
    console.log("isInitiator", isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

function doCall() {
  console.log("Sending offer to peer");
  peerConnection.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function handleCreateOfferError(event) {
  console.log("createOffer() error: ", event);
}

function setLocalAndSendMessage(sessionDescription) {
  peerConnection.setLocalDescription(sessionDescription);
  console.log("setLocalAndSendMessage sending message", sessionDescription);
  sendMessage(sessionDescription); // emit to the server
}

/* Receive kısmı */
// This client receives a message
socket.on("message", function(message) {
  console.log("Client received message:", message);
  if (message === "got user media") {
    tryStart();
  } else if (message.type === "offer") {
    if (!isInitiator && !isStarted) {
      tryStart();
    }
    peerConnection.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === "answer" && isStarted) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === "candidate" && isStarted) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    peerConnection.addIceCandidate(candidate);
  } else if (message === "bye" && isStarted) {
    handleRemoteHangup();
  }
});

function doAnswer() {
  console.log("Sending answer to peer.");
  peerConnection
    .createAnswer()
    .then(setLocalAndSendMessage, onCreateSessionDescriptionError);
}
// sessionDescription comes from createAnswer() automatically
function setLocalAndSendMessage(sessionDescription) {
  peerConnection.setLocalDescription(sessionDescription);
  console.log("setLocalAndSendMessage sending message", sessionDescription);
  sendMessage(sessionDescription);
}
// error comes from createAnswer() automatically
function onCreateSessionDescriptionError(error) {
  trace("Failed to create session description: " + error.toString());
}

if (location.hostname !== "localhost") {
  requestTurn(
    "https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913"
  );
}

var pcConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    }
  ]
};

let turnReady;
function requestTurn(turnURL) {
  var turnExists = false;
  for (var i in pcConfig.iceServers) {
    if (pcConfig.iceServers[i].urls.substr(0, 5) === "turn:") {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log("Getting TURN server from ", turnURL);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        console.log("Got TURN server: ", turnServer);
        pcConfig.iceServers.push({
          urls: "turn:" + turnServer.username + "@" + turnServer.turn,
          credential: turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open("GET", turnURL, true);
    xhr.send();
  }
}

window.onbeforeunload = function() {
  sendMessage("bye");
};

function handleRemoteHangup() {
  console.log("Session terminated.");
  stop();
  isInitiator = false;
}

function stop() {
  isStarted = false;
  peerConnection.close();
  peerConnection = null;
}

/* hangup kaldı */
