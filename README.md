# Vexta Electron (v0.0.9)

[![Security](https://img.shields.io/badge/Security-Zero--Knowledge-brightgreen)](#cryptographic-architecture)
[![Encryption](https://img.shields.io/badge/Encryption-E2EE%20RSA--4096%20%7C%20AES--256--GCM-blue)](#cryptographic-architecture)
[![Protocol](https://img.shields.io/badge/Protocol-Vexta%20V2%20Rust%20Bridge-orange)](#network--protocol)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](#license--attribution)

> **Zero-Knowledge, End-to-End Encrypted Messenger** — Desktop client built with React 18, Vite, TypeScript, WebSockets, WebRTC, and packaged via Electron. Designed by **Orientis Digital**.

---

## 🚀 Key Features

- 🔐 **Zero-Knowledge Architecture**: Client-side RSA-4096 identity keypairs, PBKDF2 passcode hashing, and local AES-256-GCM encrypted vault storage. Private keys never touch the server relay network.
- ⚡ **Vexta V2 Rust Bridge Integration**: Real-time WebSocket communications (`wss://vexta-api.nexusec.space/ws/chat/`) supporting both JSON and binary MessagePack payload decoding.
- 📞 **Peer-to-Peer WebRTC Voice & Video Calling**: Full mesh and 1-on-1 voice and video calling with non-echo signaling, STUN candidate pools, and desktop screen sharing.
- 🎵 **Web Audio Feedback Subsystem**: Synthesized zero-latency audio chimes for inbound messages, pops for outbound transmissions, error blips, call tones, and vault clicks.
- ⌨️ **Customizable Keyboard Shortcuts**: Dedicated shortcuts settings panel with key combo recorders, active toggles, and instant vault locking (`Ctrl+Shift+L`).
- 🖥️ **Responsive 2-Column Settings Layout**: Category navigation sidebar on left with independently scrollable options panel on right.
- 🟢 **Real-Time Presence & Heartbeat Engine**: Messenger-style presence broadcasts with live status indicators (`● Active now`, relative timestamps, and sidebar status dots).
- 📦 **Offline Outbound Queue & Auto-Flush**: Messages sent during network dropouts or socket reconnections are cached locally and automatically transmitted when online.
- ✉️ **Delivery Checkmarks**: Live status indicators (`✓` Sent, `✓✓` Delivered / Read).
- 📱 **Multi-Device Approval System**: Cryptographic PIN challenge verification for pairing secondary desktop or mobile devices with real-time remote revocation handling.
- ⏱️ **Disappearing Messages & Ephemeral Media**: Self-destructing timers for sensitive communications.
- 🎨 **Sliding Drawer Chat Info Panel**: Smooth CSS cubic-bezier sliding drawer for channel security details, member rosters, and media archives.

---

## 📚 Technical Documentation Sitemap

| Document | Path | Description |
| :--- | :--- | :--- |
| **File Transfer Implementation Guide** | [`docs/TODO.md`](docs/TODO.md) | Blueprint & step-by-step roadmap for Chunked 128KB E2EE File Transfer |
| **API & WebSocket Payload Specs** | [`docs/api_endpoints.md`](docs/api_endpoints.md) | Full JSON message schemas, authentication frames, and signal types |
| **System Architecture Guide** | [`docs/how_vexta_works.md`](docs/how_vexta_works.md) | Core zero-knowledge cryptographic model, keys, and network relay design |
| **Screen Catalog & UI Guide** | [`docs/ui_screens.md`](docs/ui_screens.md) | Detailed walkthrough of application screens, routes, and UI components |

---

## 🛠️ Tech Stack

- **UI Framework**: React 18 + TypeScript + Vite
- **Desktop Wrapper**: Electron 34 + electron-builder
- **Styling**: Vanilla CSS with custom theme variables (Cyber Neon, Slate, Matrix Dark)
- **Networking**: WebSockets (`vexta_bridge_v2` protocol) + WebRTC (`RTCPeerConnection`)
- **Crypto Engine**: Web Crypto API (`subtle`) + `VextaDatabaseManager` (IndexedDB / localStorage storage)
- **Routing**: `react-router-dom` (`HashRouter` for `file://` compatibility)

---

## 💻 Development & Execution

### 1. Install Dependencies
```bash
npm install
```

### 2. Launch Local Development Server
```bash
npm run dev
```

### 3. Build & Package Installers
```bash
chmod +x ./build.sh
./build.sh
```

---

## 🗺️ Screen Structure & Routing

Routes are hash-based (`HashRouter`) to ensure full asset compatibility when running from local file systems (`file://` protocol):

| Route | Screen | Description |
| :--- | :--- | :--- |
| `/login` | **Login / Vault Unlock** | Local vault decryption & WSS challenge auth |
| `/signup` | **Account Registration** | Keypair generation & network registration |
| `/loading` | **Session Bootstrapper** | Vault initialization & background sync |
| `/` | **App Shell Layout** | Main sidebar, active conversations, presence status |
| `/friends` | **Friends & Requests** | Pending requests counter, add/remove contacts |
| `/settings` | **Security & App Settings** | 2-column settings layout, keys, devices, shortcuts |
| `/chat/:chatId` | **Active Chat View** | Real-time messaging, attachments, voice call |
| `/chat/:chatId/info` | **Chat Info Drawer** | Sliding security drawer & media archive |

---

## 📄 License & Attribution

Licensed under the [MIT License](LICENSE). Copyright © 2026 **Orientis Digital**. All rights reserved.
