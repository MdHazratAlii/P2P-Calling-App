# P2P Call

P2P Call is a lightweight peer-to-peer video calling web app. It uses PeerJS for signaling and the WebRTC stack (getUserMedia, getDisplayMedia) for direct browser-to-browser media connections. The app supports multiple peers in a mesh, camera switching, screen sharing, call recording, and a responsive UI optimized for mobile.

## Features

- One-click create or join room
- Multi-peer mesh connections (host introduces peers)
- Camera switch (front/back) and device selection
- Screen sharing (where supported)
- Call recording (auto-download on stop)
- Active speaker highlight
- Progressive Web App (manifest + service worker)

## Quick setup

Serve the folder locally (required for service worker and proper media permissions). Example using Python or http-server:

Python 3:

```bash
python -m http.server 8000
```

Node (http-server):

```bash
npx http-server -p 8000
```

Open your browser at `http://localhost:8000` and allow camera/microphone access when prompted.

Note: For installable PWA behavior and screen sharing in some browsers, test over HTTPS or `localhost`.

## Files

- `index.html` — Main app shell (references external CSS/JS)
- `css/styles.css` — UI styles
- `js/app.js` — Application logic (PeerJS, media handling)
- `manifest.webmanifest` — PWA manifest metadata
- `sw.js` — Service worker for caching
- `icons/` — App icons used by the manifest

## Testing notes

- To test multi-peer features, open the same URL in multiple browser tabs or different devices and use the same Room ID.
- Screen sharing is browser-dependent; Chrome/Edge on desktop supports it reliably.
- Recording is done client-side and may be CPU-intensive on low-end devices.

## Contributing

This is a minimal frontend-only app. For production use, consider adding a TURN/STUN server, or integrating an SFU for scaling.

## License

MIT
