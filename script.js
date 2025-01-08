class RandomVideoChat {
  constructor() {
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.ws = null;
    this.isAudioMuted = false;
    this.isVideoOff = false;
    this.iceCandidatesQueue = [];

    // DOM elements
    this.localVideo = document.getElementById("localVideo");
    this.remoteVideo = document.getElementById("remoteVideo");
    this.nextButton = document.getElementById("nextButton");
    this.muteButton = document.getElementById("muteButton");
    this.videoButton = document.getElementById("videoButton");
    this.endCallButton = document.getElementById("endCallButton");
    this.statusDot = document.getElementById("statusDot");
    this.statusText = document.getElementById("statusText");
    this.waitingMessage = document.getElementById("waitingMessage");

    this.initializeEventListeners();
    this.initializeWebSocket();
  }

  initializeWebSocket() {
    this.ws = new WebSocket("ws://localhost:8080");

    // Store the client ID when received from server
    this.clientId = null;

    this.ws.onopen = () => {
      console.log("Connected to signaling server");
    };

    this.ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "id":
          this.clientId = data.id;
          break;
        case "partner-found":
          this.handlePartnerFound(data.initiator);
          break;
        case "partner-disconnected":
          this.handlePartnerDisconnected();
          break;
        case "offer":
          await this.handleOffer(data.offer);
          break;
        case "answer":
          await this.handleAnswer(data.answer);
          break;
        case "ice-candidate":
          await this.handleIceCandidate(data.candidate);
          break;
      }
    };
  }

  async initialize() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      this.localVideo.srcObject = this.localStream;
      this.updateStatus("ready", "Ready to connect");
      this.nextButton.disabled = false;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      this.updateStatus("error", "Error accessing camera/microphone");
    }
  }

  updateStatus(state, message) {
    this.statusText.textContent = message;
    const colors = {
      initializing: "bg-yellow-500",
      ready: "bg-green-500",
      connecting: "bg-blue-500",
      connected: "bg-green-500",
      error: "bg-red-500",
    };

    this.statusDot.className = `w-2 h-2 rounded-full ${colors[state]}`;
  }

  toggleAudio() {
    this.isAudioMuted = !this.isAudioMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isAudioMuted;
    });

    const icon = this.muteButton.querySelector("i");
    icon.className = this.isAudioMuted
      ? "fas fa-microphone-slash"
      : "fas fa-microphone";
    this.muteButton.className = `${
      this.isAudioMuted
        ? "bg-red-100 text-red-600"
        : "bg-blue-100 text-blue-600"
    } p-4 rounded-full hover:${
      this.isAudioMuted ? "bg-red-200" : "bg-blue-200"
    } transition-all duration-200`;
  }

  toggleVideo() {
    this.isVideoOff = !this.isVideoOff;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = !this.isVideoOff;
    });

    const icon = this.videoButton.querySelector("i");
    icon.className = this.isVideoOff ? "fas fa-video-slash" : "fas fa-video";
    this.videoButton.className = `${
      this.isVideoOff ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
    } p-4 rounded-full hover:${
      this.isVideoOff ? "bg-red-200" : "bg-blue-200"
    } transition-all duration-200`;
  }

  initializeEventListeners() {
    this.nextButton.addEventListener("click", () => this.findNewPartner());
    this.muteButton.addEventListener("click", () => this.toggleAudio());
    this.videoButton.addEventListener("click", () => this.toggleVideo());
    this.endCallButton.addEventListener("click", () => this.endCall());
  }

  async findNewPartner() {
    this.updateStatus("connecting", "Looking for a partner...");
    this.waitingMessage.style.display = "flex";
    this.nextButton.disabled = true;

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.ws.send(
      JSON.stringify({
        type: "waiting",
        from: this.clientId,
      })
    );
    this.nextButton.disabled = false;
  }

  async createPeerConnection() {
    const configuration = {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    };

    this.peerConnection = new RTCPeerConnection(configuration);
    this.iceCandidatesQueue = [];

    this.peerConnection.onconnectionstatechange = () => {
      console.log("Connection state:", this.peerConnection.connectionState);
      switch (this.peerConnection.connectionState) {
        case "connected":
          this.updateStatus("connected", "Connected with stranger");
          break;
        case "disconnected":
        case "failed":
          this.handlePartnerDisconnected();
          break;
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log(
        "ICE connection state:",
        this.peerConnection.iceConnectionState
      );
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(
          JSON.stringify({
            type: "ice-candidate",
            candidate: event.candidate,
            from: this.clientId,
          })
        );
      }
    };

    this.peerConnection.ontrack = (event) => {
      this.remoteVideo.srcObject = event.streams[0];
      this.waitingMessage.style.display = "none";
    };

    this.localStream.getTracks().forEach((track) => {
      this.peerConnection.addTrack(track, this.localStream);
    });
  }

  async handlePartnerFound(initiator) {
    await this.createPeerConnection();

    if (initiator) {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.ws.send(
        JSON.stringify({
          type: "offer",
          offer: offer,
          from: this.clientId,
        })
      );
    }

    this.updateStatus("connected", "Connected with a stranger");
  }

  async handleOffer(offer) {
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(offer)
    );
    while (this.iceCandidatesQueue.length) {
      const candidate = this.iceCandidatesQueue.shift();
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.ws.send(
      JSON.stringify({
        type: "answer",
        answer: answer,
        from: this.clientId,
      })
    );
  }

  async handleAnswer(answer) {
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );
    while (this.iceCandidatesQueue.length) {
      const candidate = this.iceCandidatesQueue.shift();
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  async handleIceCandidate(candidate) {
    if (this.peerConnection) {
      if (this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } else {
        this.iceCandidatesQueue.push(candidate);
      }
    }
  }

  handlePartnerDisconnected() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteVideo.srcObject = null;
    this.waitingMessage.style.display = "flex";
    this.updateStatus("ready", "Partner disconnected");
  }

  endCall() {
    this.ws.send(JSON.stringify({ type: "disconnect" }));
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteVideo.srcObject = null;
    this.waitingMessage.style.display = "flex";
    this.updateStatus("ready", "Call ended");
  }
}

// Initialize when the page loads
window.addEventListener("DOMContentLoaded", () => {
  const chat = new RandomVideoChat();
  chat.initialize();
});
