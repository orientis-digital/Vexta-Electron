# Vexta API Endpoints & Bridge Protocol

This document details all network surfaces used by the Vexta desktop client and the Rust Relay Bridge (`vexta-bridge-v2`).

Two communication surfaces exist:

1. **HTTP / REST API** — Direct HTTP requests for account checks, announcements, and administrative server management.
2. **WebSocket API** — Real-time relay protocol operating over `wss://<host>/ws/chat/` (or `ws://`). All message payloads are opaque E2EE ciphertext blobs; the bridge server never sees plaintext.

---

## 1. Public REST API Endpoints

Base URL: `http://<host>:8000` (or `https://<host>`).

### `GET /api/check-account/:username`
Checks whether a username is registered on the relay server and returns its public key.

- **URL Parameter**: `username` — Target account name.
- **Response `200 OK`**:
  ```json
  {
    "exists": true,
    "username": "komradkat",
    "ed25519_pubkey": "A93f72..."
  }
  ```
- **Response `404 Not Found`**:
  ```json
  {
    "exists": false,
    "username": "unknown_user",
    "ed25519_pubkey": ""
  }
  ```

### `GET /api/announcements/`
Retrieves public system announcements.

- **Response `200 OK`**:
  ```json
  [
    {
      "id": 1,
      "message": "Welcome to Vexta V2 High-Performance Rust Relay Bridge.",
      "created_at": "2026-08-03T15:00:00Z"
    }
  ]
  ```

---

## 2. Protected Admin REST API

All administrative endpoints require authentication via the `X-Admin-Secret` HTTP header matching `ADMIN_SECRET_TOKEN`.

### `GET /admin/`
Embedded HTML web administration dashboard.

### `GET /api/admin/stats`
Returns bridge server health metrics and telemetry.
- **Header**: `X-Admin-Secret: <secret>`
- **Response `200 OK`**:
  ```json
  {
    "online_users": ["komradkat"],
    "total_messages_relayed": 1420,
    "total_pending_offline_messages": 3,
    "total_users": 15
  }
  ```

### `GET /api/admin/users`
Lists registered accounts on the server.
- **Header**: `X-Admin-Secret: <secret>`

### `DELETE /api/admin/users/:username`
Deletes a user account and associated offline data.
- **Header**: `X-Admin-Secret: <secret>`

### `GET /api/admin/announcements`
Lists admin system announcements.
- **Header**: `X-Admin-Secret: <secret>`

### `POST /api/admin/announcements`
Publishes a new announcement.
- **Header**: `X-Admin-Secret: <secret>`
- **Body**: `{"message": "<content>"}`

### `DELETE /api/admin/announcements/:id`
Deletes an announcement by numeric ID.
- **Header**: `X-Admin-Secret: <secret>`

---

## 3. WebSocket API (`wss://<host>/ws/chat/`)

Binary (MessagePack) or Text (JSON) framed WebSocket stream with keepalive heartbeats every 20s.

### Authentication & Handshake Protocol

1. **`AUTH_CHALLENGE`** (Server -> Client):
   ```json
   {
     "type": "AUTH_CHALLENGE",
     "nonce": "c4a7f3...",
     "server_public_key": "MCow...",
     "server_signature": "z8K..."
   }
   ```
2. **`AUTH_RESPONSE`** or **`REGISTER`** (Client -> Server):
   ```json
   {
     "type": "AUTH_RESPONSE",
     "username": "komradkat",
     "public_key": "A93f72...",
     "nonce": "c4a7f3...",
     "signature": "m1B90z...",
     "hardware_hash": "a1b2c3...",
     "device_name": "Linux Desktop"
   }
   ```
3. **`AUTH_SUCCESS`** or **`AUTH_ERROR`** (Server -> Client):
   Confirms authentication status.

---

### Client -> Server WebSocket Frames

| Type | Description & Key Payload Fields |
|---|---|
| `REGISTER` | `username`, `public_key`, `signature`, `hardware_hash`, `device_name`, `os_name` |
| `AUTH_RESPONSE` | `username`, `public_key`, `nonce`, `signature`, `hardware_hash`, `device_name` |
| `SEND_MESSAGE` | `recipient`, `ciphertext`, `is_group`, `timestamp` |
| `ACK` | `message_id` |
| `PING` | `timestamp` |
| `SEND_FRIEND_REQUEST` | `recipient` |
| `ACCEPT_FRIEND_REQUEST` | `request_id` or `username` |
| `REJECT_FRIEND_REQUEST` | `request_id` or `username` |
| `LIST_FRIENDS` | — |
| `LIST_FRIEND_REQUESTS` | — |
| `REMOVE_FRIEND` | `username` |
| `UPDATE_VAULT` | `enc_vault` |
| `GET_VAULT` | `username` |
| `SYNC_FRIEND_ROSTER` | `encrypted_roster_blob` |
| `GET_FRIEND_ROSTER` | — |
| `DEVICE_LOGIN_REQUEST` | `username`, `device_name`, `os_name`, `device_pubkey`, `pin_challenge_hash` |
| `APPROVE_DEVICE` | `target_device_id`, `encrypted_key_bundle`, `encrypted_friend_roster` |
| `REJECT_DEVICE` | `target_device_id`, `reason` |
| `LIST_DEVICES` | — |
| `REVOKE_DEVICE` | `hardware_hash` |
| `UPDATE_KEY` | `new_public_key` |
| `UPDATE_RECOVERY_LOCK` | `lock_hash` |
| `DELETE_ACCOUNT` | — |

---

### Server -> Client WebSocket Frames

| Type | Description & Key Payload Fields |
|---|---|
| `AUTH_CHALLENGE` | `nonce`, `server_public_key`, `server_signature` |
| `AUTH_SUCCESS` | `username` |
| `AUTH_ERROR` | `reason` |
| `BLIND_MESSAGE` | `id`, `sender`, `ciphertext`, `timestamp`, `is_group` |
| `PONG` | `timestamp` |
| `FRIEND_REQUEST_SENT` | `request_id`, `recipient` |
| `FRIEND_REQUESTS_LIST` | `requests` (`[{id, sender, recipient, status, created_at}]`) |
| `FRIENDS_LIST` | `friends` (`["alice", "bob"]`) |
| `VAULT_RESPONSE` | `vault_data` |
| `FRIEND_ROSTER_RESPONSE` | `encrypted_roster_blob` |
| `PUSH_DEVICE_REQUEST` | `device_id`, `device_name`, `os_name`, `pin_challenge`, `device_pubkey` |
| `DEVICE_APPROVED_EVENT` | `encrypted_key_bundle`, `encrypted_friend_roster` |
| `DEVICE_REJECTED_EVENT` | `reason` |
| `DEVICES_LIST` | `devices` (`[{id, username, hardware_hash, device_name, registered_at}]`) |
| `DELETE_ACCOUNT_SUCCESS` | Confirms account deletion |
| `ERROR` | `message` |

---

## 4. End-to-End Encrypted Inner Payloads

These JSON structures are encrypted with recipient public keys prior to transmission via `SEND_MESSAGE`:

| Type / Structure | Description |
|---|---|
| Direct Text Message | `{"sender": "alice", "body": "Hello world"}` |
| Group Chat Message | `{"type": "group_msg", "group_uuid": "...", "group_name": "...", "sender": "...", "body": "..."}` |
| Group Invitation | `{"type": "group_invite", "group_uuid": "...", "group_name": "...", "members": [...]}` |
| Group Roster Update | `{"type": "group_update", "group_uuid": "...", "group_name": "...", "members": [...]}` |
| Group Kick | `{"type": "group_kick", "group_uuid": "...", "group_name": "..."}` |
| File Init | `{"type": "file_init", "transfer_id": "...", "filename": "...", "file_size": 1048576, "chunk_size": 131072, "total_chunks": 8, "file_key": "...", "file_hash": "..."}` |
| File ACK Init | `{"type": "file_ack_init", "transfer_id": "..."}` |
| File Chunk | `{"type": "file_chunk", "transfer_id": "...", "chunk_index": 0, "data": "<base64_encrypted_chunk>"}` |
| File ACK | `{"type": "file_ack", "transfer_id": "...", "chunk_index": 0}` |
| File Status Query | `{"type": "file_status_query", "transfer_id": "..."}` |
| File Status Response | `{"type": "file_status_response", "transfer_id": "...", "last_received_chunk": 3}` |
| File Cancel | `{"type": "file_cancel", "transfer_id": "...", "reason": "User cancelled"}` |
| Metadata Sync | `{"type": "metadata_sync", "action": "ADD_CONTACT", "data": {...}}` (wrapped in `SYNC_META:`) |
