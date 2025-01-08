/**
 * Class representing a random video chat application
 * Handles WebRTC peer connections, media streams, and WebSocket signaling
 */
class RandomVideoChat {
  /**
   * Initialize the video chat application
   * Sets up streams, connections, and DOM elements
   */
  constructor() {
    // Media and connection properties
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.ws = null;
    this.isAudioMuted = false;
    this.isVideoOff = false;
    this.iceCandidatesQueue = [];
    this.username = this.generateRandomName();
    this.partnerName = null;

    // Get references to DOM elements
    this.localVideo = document.getElementById("localVideo");
    this.remoteVideo = document.getElementById("remoteVideo");
    this.localNameLabel = document.getElementById("localNameLabel");
    this.remoteNameLabel = document.getElementById("remoteNameLabel");
    this.nextButton = document.getElementById("nextButton");
    this.muteButton = document.getElementById("muteButton");
    this.videoButton = document.getElementById("videoButton");
    this.endCallButton = document.getElementById("endCallButton");
    this.statusDot = document.getElementById("statusDot");
    this.statusText = document.getElementById("statusText");
    this.waitingMessage = document.getElementById("waitingMessage");

    // Set up event handlers and initialize connections
    this.initializeEventListeners();
    this.initializeWebSocket();
    this.updateLocalName();
  }

  /**
   * Generate a random username from adjective + animal combinations
   * @returns {string} Random username like "HappyPanda"
   */
  generateRandomName() {
    const adjectives = [
      "Happy",
      "Clever",
      "Brave",
      "Gentle",
      "Swift",
      "Calm",
      "Bright",
      "Kind",
      "Wild",
      "Wise",
      "Bold",
      "Quiet",
      "Merry",
    ];
    const animals = [
      "Panda",
      "Fox",
      "Owl",
      "Tiger",
      "Wolf",
      "Bear",
      "Eagle",
      "Lion",
      "Deer",
      "Duck",
      "Cat",
      "Dog",
      "Bird",
    ];
    const randomAdjective =
      adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
    return `${randomAdjective}${randomAnimal}`;
  }

  /**
   * Update the local user's displayed name
   */
  updateLocalName() {
    if (this.localNameLabel) {
      this.localNameLabel.textContent = this.username;
    }
  }

  /**
   * Update the remote user's displayed name
   * @param {string} name - Remote user's name
   */
  updateRemoteName(name) {
    this.partnerName = name;
    if (this.remoteNameLabel) {
      this.remoteNameLabel.textContent = name || "Waiting...";
    }
  }

  /**
   * Initialize WebSocket connection for signaling
   * Handles various message types from the server
   */
  initializeWebSocket() {
    this.ws = new WebSocket("ws://localhost:8080");
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
          this.updateRemoteName(data.partnerName);
          this.handlePartnerFound(data.initiator);
          break;
        case "partner-disconnected":
          this.updateRemoteName(null);
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

  /**
   * Initialize local media stream and update UI
   */
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

  /**
   * Update the connection status indicator
   * @param {string} state - Current connection state
   * @param {string} message - Status message to display
   */
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

  /**
   * Toggle local audio mute state
   */
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

  /**
   * Toggle local video on/off state
   */
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

  /**
   * Set up event listeners for UI controls
   */
  initializeEventListeners() {
    this.nextButton.addEventListener("click", () => this.findNewPartner());
    this.muteButton.addEventListener("click", () => this.toggleAudio());
    this.videoButton.addEventListener("click", () => this.toggleVideo());
    this.endCallButton.addEventListener("click", () => this.endCall());
  }

  /**
   * Start searching for a new chat partner
   */
  async findNewPartner() {
    this.updateRemoteName(null);
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
        username: this.username,
      })
    );
    this.nextButton.disabled = false;
  }

  /**
   * Create and configure new WebRTC peer connection
   */
  async createPeerConnection() {
    const configuration = {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    };

    this.peerConnection = new RTCPeerConnection(configuration);
    this.iceCandidatesQueue = [];

    // Handle connection state changes
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

    // Handle ICE candidates
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

    // Handle incoming media streams
    this.peerConnection.ontrack = (event) => {
      this.remoteVideo.srcObject = event.streams[0];
      this.waitingMessage.style.display = "none";
    };

    // Add local media tracks to connection
    this.localStream.getTracks().forEach((track) => {
      this.peerConnection.addTrack(track, this.localStream);
    });
  }

  /**
   * Handle when a chat partner is found
   * @param {boolean} initiator - Whether this client should initiate the connection
   */
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

  /**
   * Handle incoming WebRTC offer
   * @param {RTCSessionDescriptionInit} offer - The received offer
   */
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

  /**
   * Handle incoming WebRTC answer
   * @param {RTCSessionDescriptionInit} answer - The received answer
   */
  async handleAnswer(answer) {
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );
    while (this.iceCandidatesQueue.length) {
      const candidate = this.iceCandidatesQueue.shift();
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  /**
   * Handle incoming ICE candidate
   * @param {RTCIceCandidateInit} candidate - The received ICE candidate
   */
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

  /**
   * Handle when chat partner disconnects
   */
  handlePartnerDisconnected() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteVideo.srcObject = null;
    this.waitingMessage.style.display = "flex";
    this.updateStatus("ready", "Partner disconnected");
  }

  /**
   * End current chat session
   */
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

// Initialize chat when page loads
window.addEventListener("DOMContentLoaded", () => {
  const chat = new RandomVideoChat();
  chat.initialize();
});
