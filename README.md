# Vexta Electron (v0.0.5)

[![Security](https://img.shields.io/badge/Security-Zero--Knowledge-brightgreen)](#cryptographic-architecture)
[![Encryption](https://img.shields.io/badge/Encryption-E2EE%20RSA--2048%20%7C%20AES--256--GCM-blue)](#cryptographic-architecture)
[![Protocol](https://img.shields.io/badge/Protocol-Vexta%20V2%20Rust%20Bridge-orange)](#network--protocol)
[![License](https://img.shields.io/badge/License-Proprietary-red)](#)

> **Zero-Knowledge, End-to-End Encrypted Messenger** — Desktop client built with React 18, Vite, TypeScript, WebSockets, WebRTC, and packaged via Electron. Designed by **Orientis Digital**.

---

## 🚀 Key Features

- 🔐 **Zero-Knowledge Architecture**: Client-side RSA-2048 identity keypairs, PBKDF2 passcode hashing, and local AES-256-GCM encrypted vault storage. Private keys never touch the server relay network.
- ⚡ **Vexta V2 Rust Bridge Integration**: Real-time WebSocket communications (`wss://vexta-api.nexusec.space/ws/chat/`) supporting both JSON and binary MessagePack payload decoding.
- 📞 **Peer-to-Peer WebRTC Voice & Video Calling**: Full mesh and 1-on-1 voice and video calling with non-echo signaling and ICE candidate exchange.
- 🟢 **Real-Time Presence & Heartbeat Engine**: Messenger-style 5-minute presence broadcasts with live status indicators (`● Active now`, relative last active timestamps, and sidebar status dots).
- 📦 **Offline Outbound Queue & Auto-Flush**: Messages sent during network dropouts or socket reconnections are cached locally and automatically transmitted as soon as connection authentication is restored.
- ✉️ **Delivery Checkmarks**: Live status indicators (`✓` Sent, `✓✓` Delivered / Read).
- 📱 **Multi-Device Approval System**: Cryptographic PIN challenge verification for pairing secondary desktop or mobile devices.
- ⏱️ **Disappearing Messages & Ephemeral Media**: Self-destructing timers for sensitive communications.
- 🎨 **Sliding Drawer Chat Info Panel**: Smooth CSS cubic-bezier sliding drawer for channel security details, member rosters, and media archives.

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
Open `http://localhost:5173` in your browser.

### 3. Run Electron Client
```bash
npm run electron:dev
```

---

## 📦 Building & Packaging (AppImage / Executable)

We provide an automated, interactive build script (`./build.sh`) for version management, linting, typechecking, and multi-platform compilation.

```bash
chmod +x ./build.sh
./build.sh
```

### Build Script Capabilities
1. **Version Management**: Bump Patch, Minor, Major, or specify custom versions.
2. **Platform Target Selection**:
   - **Linux**: AppImage, `.deb`, `.tar.gz` (output in `dist-electron/`)
   - **Windows**: `.exe` NSIS Installer & Portable
3. **Quality Gate**: Code quality audit using `oxlint` and TypeScript compilation (`tsc -b`).

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
| `/settings` | **Security & App Settings** | Key management, device pairing, presence privacy |
| `/chat/:chatId` | **Active Chat View** | Real-time messaging, attachments, voice call |
| `/chat/:chatId/info` | **Chat Info Drawer** | Sliding security drawer & media archive |

---

## 📄 License & Attribution

Copyright © 2026 **Orientis Digital**. All rights reserved.
