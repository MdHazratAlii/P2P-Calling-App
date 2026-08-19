// Application script moved from inline index.html

const State = {
    roomId: '',
    nickname: '',
    isHost: false,
    peer: null,
    localStream: null,
    screenStream: null,
    micMuted: false,
    camOff: false,
    isScreenSharing: false,
    peers: {}, // map peerId -> { conn, call, name, videoEl }
    facingMode: 'user'
};

const El = {
    views: document.querySelectorAll('.view-section'),
    toasts: document.getElementById('toast-container'),
    entryName: document.getElementById('entry-name'),
    entryRoom: document.getElementById('entry-room'),
    btnGenRoom: document.getElementById('btn-gen-room'),
    btnCreateCall: document.getElementById('btn-create-call'),
    btnJoinCall: document.getElementById('btn-join-call'),
    preVideo: document.getElementById('precall-video'),
    preCamOff: document.getElementById('precall-cam-off'),
    preMeter: document.getElementById('precall-audio-meter'),
    preRoom: document.getElementById('precall-room-display'),
    selCam: document.getElementById('select-cam'),
    selMic: document.getElementById('select-mic'),
    btnPreMic: document.getElementById('btn-precall-mic'),
    btnPreCam: document.getElementById('btn-precall-cam'),
    btnPreCancel: document.getElementById('btn-precall-cancel'),
    btnPreJoin: document.getElementById('btn-precall-join'),
    mainLocalVideo: document.getElementById('main-local-video'),
    videoGrid: document.getElementById('video-grid'),
    ctrlRotate: document.getElementById('ctrl-rotate'),
    localCamOffState: document.getElementById('local-cam-off-state'),
    waitingState: document.getElementById('waiting-state'),
    localNameDisp: document.getElementById('local-name-disp'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    ctrlMic: document.getElementById('ctrl-mic'),
    ctrlCam: document.getElementById('ctrl-cam'),
    ctrlScreen: document.getElementById('ctrl-screen'),
    ctrlLeave: document.getElementById('ctrl-leave'),
    sidebar: document.getElementById('sidebar'),
    partList: document.getElementById('participants-list')
};

function showView(id) {
    El.views.forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `glass-panel border-l-4 px-4 py-3 rounded shadow-lg text-sm ${type === 'error' ? 'border-red-500 text-red-200' : 'border-teal-500 text-teal-200'}`;
    toast.innerText = msg;
    El.toasts.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function genId(len = 6) {
    return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

// Room Joining / Hash Auto-Fill
window.addEventListener('DOMContentLoaded', () => {
    const hash = window.location.hash;
    if (hash.startsWith('#room=')) {
        El.entryRoom.value = hash.split('=')[1];
    }
});

El.btnGenRoom.addEventListener('click', () => { El.entryRoom.value = genId(6); });

El.btnCreateCall.addEventListener('click', () => handleEntry(true));
El.btnJoinCall.addEventListener('click', () => handleEntry(false));

async function handleEntry(isHost) {
    const name = El.entryName.value.trim();
    let room = El.entryRoom.value.trim().toUpperCase();

    if (!name) return showToast("Please enter your name", "error");
    if (!room) room = genId(6);

    State.nickname = name;
    State.roomId = room;
    State.isHost = isHost;

    window.location.hash = `#room=${room}`;
    El.preRoom.innerText = `Room: ${room}`;

    showView('view-precall');
    await initLocalStream();
}

// audio: prefer higher quality with echo cancellation and noise suppression
async function initLocalStream() {
    try {
        if (State.localStream) State.localStream.getTracks().forEach(t => t.stop());
        const audioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1,
            sampleRate: 48000
        };
        State.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: audioConstraints });
        // try to record facingMode from track settings
        try {
            const vSettings = State.localStream.getVideoTracks()[0].getSettings();
            if (vSettings && vSettings.facingMode) State.facingMode = vSettings.facingMode;
        } catch (e) { }
        El.preVideo.srcObject = State.localStream;
        El.mainLocalVideo.srcObject = State.localStream;
        populateDevices();
        // start local audio level monitoring for active speaker
        startAudioMonitoring(State.localStream, document.getElementById('local-container'));
    } catch (e) {
        console.error(e);
        showToast("Camera or Microphone permission denied", "error");
    }
}

async function populateDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    El.selCam.innerHTML = ''; El.selMic.innerHTML = '';
    devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId; opt.text = d.label || d.kind;
        if (d.kind === 'videoinput') El.selCam.appendChild(opt);
        if (d.kind === 'audioinput') El.selMic.appendChild(opt);
    });
}

El.btnPreCancel.addEventListener('click', () => showView('view-entry'));

El.btnPreJoin.addEventListener('click', () => {
    showView('view-call');
    El.localNameDisp.innerText = State.nickname;
    initPeer();
});

// Helper: add participant to sidebar
function addParticipant(id, name, isLocal = false) {
    if (!id) return;
    // avoid duplicates
    if (document.getElementById(`part-${id}`)) return;
    const el = document.createElement('div');
    el.id = `part-${id}`;
    el.className = 'flex items-center gap-2 p-2 bg-slate-800/40 rounded';
    el.innerHTML = `<div class="w-8 h-8 rounded-full bg-gradient-to-tr from-accent to-teal-400 flex items-center justify-center text-sm font-bold">${(name || '?').charAt(0).toUpperCase()}</div><div class="flex-1 text-sm">${isLocal ? name + ' (You)' : name}</div>`;
    // clicking participant opens full view
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => showFullView(id));
    El.partList.appendChild(el);
}

function removeParticipant(id) {
    const el = document.getElementById(`part-${id}`);
    if (el) el.remove();
}

function createRemoteVideo(peerId) {
    if (!peerId) return null;
    if (document.getElementById(`video-${peerId}`)) return document.getElementById(`video-${peerId}`);
    const container = document.createElement('div');
    container.id = `container-${peerId}`;
    container.className = 'relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border-2 border-transparent';
    const vid = document.createElement('video');
    vid.id = `video-${peerId}`;
    vid.autoplay = true;
    vid.playsInline = true;
    container.appendChild(vid);
    const nameTag = document.createElement('div');
    nameTag.className = 'absolute bottom-4 left-4 glass-panel px-3 py-1.5 rounded-lg text-sm';
    nameTag.id = `name-${peerId}`;
    nameTag.innerText = '';
    // Expand button for full view
    const expandBtn = document.createElement('button');
    expandBtn.className = 'absolute top-3 right-3 bg-black/40 p-2 rounded';
    expandBtn.title = 'View Full';
    expandBtn.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center text-white"></i>';
    expandBtn.addEventListener('click', (e) => { e.stopPropagation(); showFullView(peerId); });
    container.appendChild(expandBtn);

    container.appendChild(nameTag);
    El.videoGrid.appendChild(container);
    return vid;
}

// --- Audio monitoring (active speaker) ---
const AudioMon = {
    ctx: null,
    monitors: {} // id -> { analyser, source }
};

function ensureAudioContext() {
    if (!AudioMon.ctx) AudioMon.ctx = new (window.AudioContext || window.webkitAudioContext)();
    return AudioMon.ctx;
}

function startAudioMonitoring(stream, containerEl, id = null) {
    try {
        const ctx = ensureAudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const key = id || (containerEl && containerEl.id) || Math.random().toString(36).slice(2, 8);
        AudioMon.monitors[key] = { analyser, data, containerEl };

        const tick = () => {
            const m = AudioMon.monitors[key];
            if (!m) return;
            m.analyser.getByteFrequencyData(m.data);
            let sum = 0;
            for (let i = 0; i < m.data.length; i++) sum += m.data[i];
            const avg = sum / m.data.length;
            if (m.containerEl) {
                if (avg > 18) m.containerEl.classList.add('speaking'); else m.containerEl.classList.remove('speaking');
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    } catch (e) {
        console.warn('Audio monitor failed', e);
    }
}

// Automated PeerJS WebRTC Connection Setup
function initPeer() {
    const peerId = State.isHost ? State.roomId : null;
    State.peer = new Peer(peerId);

    State.peer.on('open', (id) => {
        console.log('Peer open', id);
        El.statusText.innerText = State.isHost ? "Waiting for participants..." : "Connecting to host...";

        // If guest, connect to host
        // add local participant entry using real peer id
        addParticipant(id, State.nickname, true);
        if (!State.isHost) connectToHost(State.roomId);
    });

    // When another peer calls us
    State.peer.on('call', (call) => {
        // answer with our local stream
        call.answer(State.localStream);
        setupCall(call);
    });

    // Data channel from any peer
    State.peer.on('connection', (conn) => {
        setupDataConnection(conn);
    });

    State.peer.on('error', (err) => {
        console.error(err);
        showToast(`Connection error: ${err}`, "error");
    });
}

function connectToHost(hostRoomId) {
    // Create data connection to host first
    const conn = State.peer.connect(hostRoomId);
    conn.on('open', () => {
        // tell host our name and id
        conn.send({ type: 'intro', id: State.peer.id, name: State.nickname });
    });
    setupDataConnection(conn);

    // Call the host so host can receive our stream
    const call = State.peer.call(hostRoomId, State.localStream);
    setupCall(call);
}

function setupDataConnection(conn) {
    const peerId = conn.peer;
    State.peers[peerId] = State.peers[peerId] || {};
    State.peers[peerId].conn = conn;

    conn.on('open', () => {
        // send own intro if not host
        if (!State.isHost) conn.send({ type: 'intro', id: State.peer.id, name: State.nickname });
    });

    conn.on('data', (data) => {
        if (!data || !data.type) return;
        switch (data.type) {
            case 'intro':
                // add participant and reply with current peers list
                State.peers[peerId].name = data.name || peerId;
                addParticipant(peerId, data.name);
                // update dynamic name tag if video already created
                const dynNameEl = document.getElementById(`name-${peerId}`);
                if (dynNameEl) dynNameEl.innerText = data.name || peerId;
                // send back full peer list to newcomer
                const peerIds = Object.keys(State.peers).filter(id => id !== peerId);
                conn.send({ type: 'peers', peers: peerIds });
                // notify existing peers about the new one
                broadcast({ type: 'new-peer', id: peerId, name: data.name }, peerId);
                break;
            case 'peers':
                // We received a list of peers to connect to
                (data.peers || []).forEach(pid => {
                    if (pid === State.peer.id) return;
                    // avoid connecting twice
                    if (State.peers[pid] && (State.peers[pid].conn || State.peers[pid].call)) return;
                    // call existing peer
                    const call = State.peer.call(pid, State.localStream);
                    setupCall(call);
                    // open data conn
                    const dc = State.peer.connect(pid);
                    setupDataConnection(dc);
                });
                break;
            case 'new-peer':
                // A new participant joined, call them
                if (data.id === State.peer.id) return;
                if (!(State.peers[data.id] && State.peers[data.id].call)) {
                    const call2 = State.peer.call(data.id, State.localStream);
                    setupCall(call2);
                    const dc2 = State.peer.connect(data.id);
                    setupDataConnection(dc2);
                }
                addParticipant(data.id, data.name);
                break;
            case 'name':
                State.peers[peerId].name = data.name;
                const nameEl = document.getElementById(`name-${peerId}`);
                if (nameEl) nameEl.innerText = data.name;
                addParticipant(peerId, data.name);
                break;
        }
    });

    conn.on('close', () => {
        // cleanup
        removeParticipant(peerId);
        if (State.peers[peerId] && State.peers[peerId].videoEl) {
            const v = document.getElementById(`container-${peerId}`);
            if (v) v.remove();
        }
        delete State.peers[peerId];
    });
}

function broadcast(msg, excludeId) {
    Object.keys(State.peers).forEach(pid => {
        if (pid === excludeId) return;
        const p = State.peers[pid];
        if (p && p.conn && p.conn.open) p.conn.send(msg);
    });
}

function setupCall(call) {
    const peerId = call.peer;
    State.peers[peerId] = State.peers[peerId] || {};
    State.peers[peerId].call = call;

    call.on('stream', (remoteStream) => {
        // Hide the placeholder remote container (static) when we add dynamic peer videos
        const staticRemote = document.getElementById('remote-container');
        if (staticRemote) staticRemote.style.display = 'none';

        El.waitingState.classList.add('hidden');
        El.statusText.innerText = "Connected";
        El.statusDot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500";
        createRemoteVideo(peerId);
        const videoEl = document.getElementById(`video-${peerId}`);
        if (videoEl) videoEl.srcObject = remoteStream;
        State.peers[peerId].videoEl = videoEl;
        // start audio monitoring for remote stream (active speaker)
        startAudioMonitoring(remoteStream, document.getElementById(`container-${peerId}`), peerId);
        const nameEl = document.getElementById(`name-${peerId}`);
        if (nameEl) nameEl.innerText = State.peers[peerId].name || peerId;
    });

    call.on('close', () => {
        showToast("Remote user left", "error");
        const v = document.getElementById(`container-${peerId}`);
        if (v) v.remove();
        removeParticipant(peerId);
        delete State.peers[peerId];
        // If no dynamic peers left, show the static remote placeholder and waiting state
        const anyPeer = Object.keys(State.peers).length > 0;
        if (!anyPeer) {
            const staticRemote = document.getElementById('remote-container');
            if (staticRemote) staticRemote.style.display = '';
            El.waitingState.classList.remove('hidden');
            El.statusText.innerText = State.isHost ? 'Waiting for participants...' : 'Waiting for peer...';
            El.statusDot.className = "w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse";
        }
    });
}

// Copy Room Link
document.getElementById('btn-copy-link').addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href);
    showToast("Room Link Copied!", "success");
});

// --- Full view modal handling ---
// insert modal markup
(function createFullViewModal() {
    const modal = document.createElement('div');
    modal.id = 'fullview-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div id="fullview-content">
            <video id="fullview-video" autoplay playsinline></video>
            <button id="fullview-fullscreen"><i class="fa-solid fa-expand"></i></button>
            <button id="fullview-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = document.getElementById('fullview-close');
    const fsBtn = document.getElementById('fullview-fullscreen');
    closeBtn.addEventListener('click', closeFullView);
    fsBtn.addEventListener('click', toggleFullScreenFullView);
    // clicking outside content closes modal
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeFullView(); });
    // Esc key closes modal
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeFullView(); });
    // keep fullscreen button icon in sync
    document.addEventListener('fullscreenchange', () => {
        const icon = fsBtn.querySelector('i');
        if (!icon) return;
        if (document.fullscreenElement) icon.className = 'fa-solid fa-compress'; else icon.className = 'fa-solid fa-expand';
    });
})();

function showFullView(peerId) {
    const modal = document.getElementById('fullview-modal');
    const videoEl = document.getElementById(`video-${peerId}`);
    const fullVid = document.getElementById('fullview-video');
    if (!modal || !fullVid) return;
    // use the same MediaStream if available; fallback to local
    if (videoEl && videoEl.srcObject) {
        fullVid.srcObject = videoEl.srcObject;
    } else if (State.localStream && (peerId === (State.peer && State.peer.id))) {
        fullVid.srcObject = State.localStream;
    } else {
        showToast('Stream not available', 'error');
        return;
    }
    modal.style.display = 'flex';
    // attempt to request fullscreen immediately (allowed because this is triggered from a user click on expand)
    const content = document.getElementById('fullview-content');
    if (content && content.requestFullscreen) {
        content.requestFullscreen().catch(() => { });
    }
}

function closeFullView() {
    const modal = document.getElementById('fullview-modal');
    const fullVid = document.getElementById('fullview-video');
    if (fullVid) fullVid.srcObject = null;
    if (modal) modal.style.display = 'none';
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
}

function toggleFullScreenFullView() {
    const content = document.getElementById('fullview-content');
    if (!content) return;
    if (!document.fullscreenElement) {
        content.requestFullscreen().catch(() => { });
    } else {
        document.exitFullscreen().catch(() => { });
    }
}

// --- Recording ---
State.recorder = null;
State.recordedChunks = [];

document.getElementById('ctrl-record').addEventListener('click', async () => {
    if (!State.recorder || State.recorder.state === 'inactive') {
        // start recording combined local + remote (simple approach: capture local preview canvas + mixed audio)
        startRecording();
    } else {
        stopRecording();
    }
});

async function startRecording() {
    try {
        // create a canvas to composite local + remote videos (stacked)
        const canvas = document.createElement('canvas');
        const rect = El.videoGrid.getBoundingClientRect();
        canvas.width = Math.min(1280, rect.width);
        canvas.height = Math.min(720, rect.height);
        const ctx = canvas.getContext('2d');

        // capture combined stream from canvas
        const canvasStream = canvas.captureStream(25);

        // mix audio: create destination and connect all peer audio tracks and local audio
        const audioCtx = ensureAudioContext();
        const dest = audioCtx.createMediaStreamDestination();

        // helper to attach stream tracks to mixer
        function attachAudioTracks(stream) {
            if (!stream) return;
            try {
                const src = audioCtx.createMediaStreamSource(stream);
                src.connect(dest);
            } catch (e) { console.warn('attachAudioTracks failed', e); }
        }

        attachAudioTracks(State.localStream);
        Object.values(State.peers).forEach(p => {
            if (p.videoEl && p.videoEl.srcObject) {
                attachAudioTracks(p.videoEl.srcObject);
            }
        });

        // combine canvas video + mixed audio
        const outStream = new MediaStream();
        canvasStream.getVideoTracks().forEach(t => outStream.addTrack(t));
        dest.stream.getAudioTracks().forEach(t => outStream.addTrack(t));

        State.recordedChunks = [];
        State.recorder = new MediaRecorder(outStream, { mimeType: 'video/webm;codecs=vp8,opus' });
        State.recorder.ondataavailable = e => { if (e.data && e.data.size) State.recordedChunks.push(e.data); };
        State.recorder.onstop = () => {
            const blob = new Blob(State.recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `p2p-call-${Date.now()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Recording saved', 'success');
        };
        State.recorder.start();

        // draw loop for canvas: composite local then remote videos
        State._recCanvas = { canvas, ctx, raf: null };
        function draw() {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const vids = [document.getElementById('main-local-video')].concat(Object.keys(State.peers).map(pid => document.getElementById(`video-${pid}`)).filter(Boolean));
            const cols = Math.ceil(Math.sqrt(vids.length));
            const rows = Math.ceil(vids.length / cols);
            const w = canvas.width / cols;
            const h = canvas.height / rows;
            vids.forEach((v, i) => {
                const x = (i % cols) * w;
                const y = Math.floor(i / cols) * h;
                try { ctx.drawImage(v, x, y, w, h); } catch (e) { }
            });
            State._recCanvas.raf = requestAnimationFrame(draw);
        }
        draw();
        El.ctrlRecordIcon = document.querySelector('#ctrl-record i');
        if (El.ctrlRecordIcon) El.ctrlRecordIcon.className = 'fa-solid fa-stop text-red-400';
        showToast('Recording started', 'info');
    } catch (e) {
        console.error('startRecording failed', e);
        showToast('Recording failed to start', 'error');
    }
}

function stopRecording() {
    if (State.recorder && State.recorder.state !== 'inactive') State.recorder.stop();
    if (State._recCanvas) {
        cancelAnimationFrame(State._recCanvas.raf);
        State._recCanvas.canvas.remove();
        State._recCanvas = null;
    }
    const icon = document.querySelector('#ctrl-record i');
    if (icon) icon.className = 'fa-solid fa-circle text-red-400';
}

// Mic & Camera Toggles
El.ctrlMic.addEventListener('click', () => {
    State.micMuted = !State.micMuted;
    if (State.localStream && State.localStream.getAudioTracks().length) State.localStream.getAudioTracks()[0].enabled = !State.micMuted;
    El.ctrlMic.innerHTML = State.micMuted ? '<i class="fa-solid fa-microphone-slash text-red-400"></i>' : '<i class="fa-solid fa-microphone"></i>';
});

El.ctrlCam.addEventListener('click', () => {
    State.camOff = !State.camOff;
    if (State.localStream && State.localStream.getVideoTracks().length) State.localStream.getVideoTracks()[0].enabled = !State.camOff;
    El.localCamOffState.classList.toggle('hidden', !State.camOff);
    El.ctrlCam.innerHTML = State.camOff ? '<i class="fa-solid fa-video-slash text-red-400"></i>' : '<i class="fa-solid fa-video"></i>';
});

// Camera switching
El.selCam.addEventListener('change', async (e) => {
    const deviceId = e.target.value;
    await switchCamera(deviceId);
});

// Rotate: toggle facing mode front/back
if (El.ctrlRotate) El.ctrlRotate.addEventListener('click', async () => {
    const newMode = State.facingMode === 'user' ? 'environment' : 'user';
    await switchFacingMode(newMode);
});

async function switchFacingMode(mode) {
    if (!mode) return;
    try {
        // try simple facingMode constraint
        const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: false });
        const newTrack = newStream.getVideoTracks()[0];
        const oldTrack = State.localStream.getVideoTracks()[0];
        // replace track in local stream
        State.localStream.removeTrack(oldTrack);
        oldTrack.stop();
        State.localStream.addTrack(newTrack);
        State.facingMode = mode === 'user' ? 'user' : 'environment';
        // update local preview
        El.mainLocalVideo.srcObject = State.isScreenSharing ? State.screenStream : State.localStream;
        // replace track for all peer connections
        Object.values(State.peers).forEach(p => {
            if (p.call && p.call.peerConnection) {
                const sender = p.call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(newTrack);
            }
        });
    } catch (err) {
        // try enumerating devices and pick one with 'back' in label
        console.warn('Facing mode switch failed, trying device selection', err);
        const devices = await navigator.mediaDevices.enumerateDevices();
        const candidates = devices.filter(d => d.kind === 'videoinput');
        let chosen = null;
        // prefer environment
        if (mode === 'environment') {
            chosen = candidates.find(d => /back|rear|environment/i.test(d.label));
        } else {
            chosen = candidates.find(d => /front|user|face/i.test(d.label));
        }
        if (!chosen) chosen = candidates[0];
        if (chosen) await switchCamera(chosen.deviceId);
    }
}

async function switchCamera(deviceId) {
    if (!deviceId) return;
    try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false });
        const newTrack = newStream.getVideoTracks()[0];
        const oldTrack = State.localStream.getVideoTracks()[0];
        // replace track in local stream
        State.localStream.removeTrack(oldTrack);
        oldTrack.stop();
        State.localStream.addTrack(newTrack);
        // update local preview
        El.mainLocalVideo.srcObject = State.isScreenSharing ? State.screenStream : State.localStream;
        // replace track for all peer connections
        Object.values(State.peers).forEach(p => {
            if (p.call && p.call.peerConnection) {
                const sender = p.call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(newTrack);
            }
        });
    } catch (err) {
        console.warn('Camera switch failed', err);
        showToast('Failed to switch camera', 'error');
    }
}

// Screen Share (multi-peer)
El.ctrlScreen.addEventListener('click', async () => {
    if (!State.isScreenSharing) {
        try {
            // Mobile browsers may not support getDisplayMedia for screens; try with constraints fallback
            try {
                State.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            } catch (err) {
                // fallback: try getUserMedia with { video: { mediaSource: 'screen' } } (some Android webviews)
                State.screenStream = await navigator.mediaDevices.getUserMedia({ video: true });
            }
            const screenTrack = State.screenStream.getVideoTracks()[0];
            // replace video sender for all peers
            Object.values(State.peers).forEach(p => {
                if (p.call && p.call.peerConnection) {
                    const sender = p.call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                }
            });
            El.mainLocalVideo.srcObject = State.screenStream;
            State.isScreenSharing = true;

            screenTrack.onended = () => {
                const videoTrack = State.localStream.getVideoTracks()[0];
                Object.values(State.peers).forEach(p => {
                    if (p.call && p.call.peerConnection) {
                        const sender = p.call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                        if (sender) sender.replaceTrack(videoTrack);
                    }
                });
                El.mainLocalVideo.srcObject = State.localStream;
                State.isScreenSharing = false;
            };
        } catch (err) {
            console.warn('Screen share failed', err);
            showToast('Screen sharing failed or denied', 'error');
        }
    }
});

// Leave Call
El.ctrlLeave.addEventListener('click', () => {
    if (State.localStream) State.localStream.getTracks().forEach(t => t.stop());
    if (State.peer) State.peer.destroy();
    // stop any recording and auto-save
    if (State.recorder && State.recorder.state !== 'inactive') stopRecording();
    showView('view-end');
});

document.getElementById('btn-home').addEventListener('click', () => {
    window.location.hash = '';
    window.location.reload();
});

// Sidebar
document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    El.sidebar.classList.toggle('translate-x-full');
    El.sidebar.classList.toggle('show');
});
document.getElementById('btn-close-sidebar').addEventListener('click', () => { El.sidebar.classList.add('translate-x-full'); El.sidebar.classList.remove('show'); });

// Register service worker for PWA installability
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('ServiceWorker registered', reg))
            .catch(err => console.warn('ServiceWorker registration failed', err));
    });
}
