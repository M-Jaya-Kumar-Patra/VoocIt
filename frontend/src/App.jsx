import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_BACKEND_URL);

// 1. ICE Servers (STUN) - Place outside component to avoid re-renders
const servers = {
  iceServers: [
    { urls: 'stun:openrelay.metered.ca:80' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: import.meta.env.VITE_TURN_USER,
      credential: import.meta.env.VITE_TURN_PASS,
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    }
  ],
};

function App() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null); // Added
  const pc = useRef(null); // Added (The PeerConnection)

  const [stream, setStream] = useState(null);
  const [socketId, setSocketId] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false); // Add this
  const [message, setMessage] = useState("");
  const [chatLog, setChatLog] = useState([]);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // Use a ref for the stream to avoid triggering re-renders if not needed
  const streamRef = useRef(null);

  useEffect(() => {
  const initCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = mediaStream;
      setStream(mediaStream); 
      if (localVideoRef.current) localVideoRef.current.srcObject = mediaStream;
    } catch (err) {
      console.error("Camera error:", err);
    }
  };

  initCamera();

  socket.on('connect', () => setSocketId(socket.id));

  socket.on('signal', async (data) => {
    if (data.type === 'offer') {
      if (!pc.current) createPeerConnection();
      await pc.current.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      socket.emit('signal', { type: 'answer', answer });
    } 
    else if (data.type === 'answer') {
      if (pc.current) await pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
    } 
    else if (data.type === 'ice-candidate') {
      if (pc.current && pc.current.remoteDescription) {
        try { await pc.current.addIceCandidate(new RTCIceCandidate(data.candidate)); } 
        catch (e) { console.error("Error adding ice candidate", e); }
      }
    }
  });

  // ONLY ONE CHAT LISTENER
  socket.on('chat', (data) => {
    setMessages((prev) => [...prev, { ...data, isMe: false }]);
  });
socket.on('peer-disconnected', () => {
  setRemoteConnected(false);
  if (remoteVideoRef.current) {
    remoteVideoRef.current.srcObject = null;
  }
  // Close the peer connection properly
  if (pc.current) {
    pc.current.close();
    pc.current = null;
  }
  setMessages((prev) => [...prev, { text: "Peer has left the call", isMe: false, system: true }]);
});

// Update return cleanup
return () => {
  socket.off('signal');
  socket.off('chat');
  socket.off('connect');
  socket.off('peer-disconnected');
};
}, []);
  // Empty dependency array is KEY to stopping the flickering
  // 3. The Core WebRTC logic function
  const createPeerConnection = () => {
    // Check if we actually have a stream before proceeding
    if (!streamRef.current) {
      console.error("Connection failed: Stream not ready yet.");
      return;
    }

    pc.current = new RTCPeerConnection(servers);

    // Use streamRef.current here
    streamRef.current.getTracks().forEach((track) => {
      pc.current.addTrack(track, streamRef.current);
    });

    pc.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setRemoteConnected(true); // Set to true when video arrives
      }
    };

    pc.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", {
          type: "ice-candidate",
          candidate: event.candidate,
        });
      }
    };
  };

  const startCall = async () => {
  // Optional: Fetch fresh ICE servers from backend
  // const iceServers = await socket.emitWithAck('get-ice-servers');
  
  createPeerConnection(); // Pass iceServers here if fetching dynamically
  const offer = await pc.current.createOffer();
  await pc.current.setLocalDescription(offer);
  socket.emit('signal', { type: 'offer', offer });
};

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const msgData = { text: inputText };
    socket.emit("chat", msgData); // Send to backend

    setMessages((prev) => [
      ...prev,
      {
        text: inputText,
        isMe: true,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);
    setInputText("");
  };

  const toggleMute = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleCamera = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsCameraOff(!videoTrack.enabled);
    }
  };

  const startScreenShare = async () => {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const videoTrack = screenStream.getVideoTracks()[0];

    // Replace the video track in our Peer Connection
    const sender = pc.current.getSenders().find((s) => s.track.kind === 'video');
    sender.replaceTrack(videoTrack);

    // Update local preview
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = screenStream;
    }

    // Stop sharing handler
    videoTrack.onended = () => {
      stopScreenShare();
    };
  } catch (err) {
    console.error("Screen share error:", err);
  }
};

const stopScreenShare = () => {
  const videoTrack = streamRef.current.getVideoTracks()[0];
  const sender = pc.current.getSenders().find((s) => s.track.kind === 'video');
  sender.replaceTrack(videoTrack);
  if (localVideoRef.current) {
    localVideoRef.current.srcObject = streamRef.current;
  }
};

  return (
    <div className="h-screen bg-[#050505] text-white flex flex-col p-6 font-sans overflow-hidden">
      {/* Top Header */}
      <div className="flex justify-between items-center mb-6 px-4">
        <h1 className="text-3xl font-black tracking-tighter bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent">
          VOOCIT
        </h1>
        <div className="px-4 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] text-slate-500 tracking-widest uppercase">
          ID: {socketId?.substring(0, 6)} • P2P ENCRYPTED
        </div>
      </div>

      <div className="flex flex-1 gap-6 min-h-0">
        {/* Video Section */}
        <div className="flex-[3] flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 h-full">
            {/* Local Video */}
            <div className="relative rounded-3xl bg-slate-900 overflow-hidden border border-white/5">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover scale-x-[-1] ${isCameraOff ? "hidden" : ""}`}
              />
              {isCameraOff && (
                <div className="w-full h-full flex items-center justify-center text-slate-700 font-bold uppercase tracking-tighter text-xl">
                  Camera Off
                </div>
              )}
              <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/40 backdrop-blur-md rounded-lg text-[10px] font-bold">
                YOU {isMuted && "• MUTED"}
              </div>
            </div>

            {/* Remote Video */}
            <div className="relative rounded-3xl bg-black overflow-hidden border border-white/5 flex items-center justify-center">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              {!remoteConnected && (
                <div className="text-center animate-pulse text-slate-500 text-[10px] tracking-widest uppercase font-bold">
                  Searching for peer...
                </div>
              )}
              <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/40 backdrop-blur-md rounded-lg text-[10px] font-bold">
                REMOTE
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-center items-center gap-4 bg-white/5 p-4 rounded-3xl border border-white/10 self-center">
  <button onClick={toggleMute} className={`p-4 rounded-2xl transition-all ${isMuted ? 'bg-red-500/20 text-red-500' : 'bg-white/5 hover:bg-white/10'}`}>
    {isMuted ? '🔇' : '🎤'}
  </button>
  
  <button onClick={startCall} className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold transition-transform active:scale-95 shadow-xl shadow-indigo-500/20">
    {remoteConnected ? 'ON CALL' : 'START CALL'}
  </button>

  <button onClick={startScreenShare} className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5">
    <span>📺</span>
  </button>

  <button onClick={toggleCamera} className={`p-4 rounded-2xl transition-all ${isCameraOff ? 'bg-red-500/20 text-red-500' : 'bg-white/5 hover:bg-white/10'}`}>
    {isCameraOff ? '📷 OFF' : '📷'}
  </button>
</div>
        </div>

        {/* Chat Sidebar */}
        <div className="flex-1 bg-white/5 rounded-3xl border border-white/10 flex flex-col overflow-hidden max-w-[350px]">
          <div className="p-4 border-b border-white/10 text-center font-bold text-[10px] tracking-widest uppercase text-slate-400">
            Live Chat
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col ${msg.isMe ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-2xl text-xs ${msg.isMe ? "bg-indigo-600 rounded-tr-none" : "bg-white/10 rounded-tl-none"}`}
                >
                  {msg.text}
                </div>
                <span className="text-[8px] text-slate-500 mt-1 uppercase">
                  {msg.timestamp}
                </span>
              </div>
            ))}
          </div>

          <form
            onSubmit={sendMessage}
            className="p-4 bg-black/20 border-t border-white/10"
          >
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-indigo-500"
            />
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
