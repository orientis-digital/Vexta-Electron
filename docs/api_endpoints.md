# Vexta API Endpoints & Bridge Protocol

All network surfaces used by the Vexta client, sourced from the original
codebase (`core/controller.py`, `network/client.py`). The bridge server is a
fork of the Substrata Bridge (Django/Channels, default `vexta-api.nexusec.space`).

Two surfaces exist:

1. **HTTP API** — direct REST calls made with `urllib` for account checks and
   announcements.
2. **WebSocket API** — the real-time relay protocol over `wss://<host>/ws/chat/`.
   All message payloads are opaque E2EE ciphertext blobs; the bridge never sees
   plaintext.

---

## HTTP API

Base URL: `https://<host>` (http only for localhost/127.0.0.1).

### `GET /api/check-account/` — pre-flight ping

- Purpose: connectivity check before opening the WebSocket.
- Responses:
  - `200` — server reachable.
  - `403` — **treated as success** (Cloudflare WAF / Bot Fight Mode detected;
    the client logs a warning and proceeds).
  - Other codes — failure, shown to the user.
- Headers sent: browser-like `User-Agent`, `Accept`, `Origin`,
  `Accept-Language`, `Referer`. Timeout 8 s.

### `POST /api/check-account/` — verify username / vault existence

- Request body: `{"username": "<username>"}`
- Response: `{"exists": bool, "vault_exists": bool}`
- `404` → `exists: false` (account not found).
- Headers: same browser-like set, `Content-Type: application/json`,
  `Content-Length`. Timeout 5 s.

### `GET /api/announcements/?limit=5` — global announcements

- Purpose: pull up to the 5 most recent signed global announcements.
- Response: `{"announcements": [{"id", "message", "signature", "created_at"}], "server_public_key": "<PEM>"}`
- `signature` is a base64 RSA signature over the message bytes, verified with
  the server's public key (TOFU-trusted on first use against the host
  fingerprint).
- Timeout 10 s.
- New announcements are stored as system messages from the
  `Vexta - Global Message` contact with prefix `SYSTEM:Vexta - Global Message:`.

---

## WebSocket API (`wss://<host>/ws/chat/`)

Browser-like headers (`User-Agent`, `Host`, `Origin`, `Referer`,
`Sec-Fetch-*`, etc.) to pass Cloudflare. Ping/keepalive every 20 s.

### Auth handshake (per connection)

1. Server → `AUTH_CHALLENGE` `{"nonce", "server_public_key", "server_signature"}`
2. Client validates nonce (≥32 bytes, hex, replay-guarded), verifies the
   server's signature over the nonce (mutual auth), then TOFU-checks the
   fingerprint (SHA-256 of `server_public_key`). "Changed" fingerprint aborts
   the connection with a MITM warning.
3. Client signs the nonce with its RSA-4096 key and replies with `REGISTER`
   (new account) or `AUTH_RESPONSE` (existing).
4. Server → `AUTH_SUCCESS` or `AUTH_ERROR`.

### Client → Server messages

| Type | Payload |
|---|---|
| `REGISTER` | `username`, `public_key` (b64), `signature` (nonce sig), `hardware_hash`, `device_name`, `os_name`, `os_version`, `device_type`, `app_version` |
| `AUTH_RESPONSE` | same as REGISTER + `passcode` = HMAC-SHA256(nonce, SHA256(passcode)) — raw passcode never sent |
| `SEND_MESSAGE` | `recipient`, `ciphertext` (E2EE blob), `self_ciphertext?` (own copy for multi-device sync) |
| `ACK` | `id`, `hardware_hash?` |
| `UPDATE_KEY` | `new_public_key` (b64) |
| `GET_PREKEY` | `username?` or `user_id?` |
| `UPDATE_VAULT` | `enc_vault` (base64 of JSON vault backup) |
| `GET_VAULT` | `username` |
| `SEND_FRIEND_REQUEST` | `recipient` |
| `ACCEPT_FRIEND_REQUEST` | `request_id` |
| `REJECT_FRIEND_REQUEST` | `request_id` |
| `LIST_FRIEND_REQUESTS` | — |
| `LIST_FRIENDS` | — |
| `REMOVE_FRIEND` | `username` |
| `DELETE_ACCOUNT` | — |
| `UPDATE_RECOVERY_LOCK` | `lock_hash` (SHA-256 of recovery code) |
| `LIST_DEVICES` | — |
| `REVOKE_DEVICE` | `hardware_hash` |
| `DEVICE_LOGIN_REQUEST` | `username`, `device_name`, `os_name`, `device_pubkey`, `pin_challenge_hash` |
| `APPROVE_DEVICE` | `target_device_id`, `encrypted_key_bundle`, `encrypted_friend_roster` |
| `REJECT_DEVICE` | `target_device_id` |
| `SYNC_FRIEND_ROSTER` | `encrypted_roster_blob` |
| `GET_FRIEND_ROSTER` | — |

### Server → Client messages

| Type | Payload | Notes |
|---|---|---|
| `AUTH_CHALLENGE` | `nonce`, `server_public_key`, `server_signature` | initiate handshake |
| `AUTH_SUCCESS` | `user_id`, `first_login`, `device_status?` | `device_status`: "active" or "pending_approval" |
| `AUTH_ERROR` | `message` | |
| `PUSH_DEVICE_REQUEST` | `device_id`, `device_name`, `os_name`, `pin_challenge`, `device_pubkey` | sent to primary active device when new device requests authorization |
| `DEVICE_APPROVED_EVENT` | `encrypted_key_bundle`, `encrypted_friend_roster` | sent to pending device upon primary device approval |
| `DEVICE_REJECTED_EVENT` | `reason` | sent to pending device upon primary device rejection |
| `FRIEND_ROSTER_RESPONSE` | `encrypted_roster_blob` | returns encrypted friend roster for synced setup |
| `BLIND_MESSAGE` | `sender`, `ciphertext`, `id`, `timestamp` | relayed E2EE message |
| `PREKEY_BUNDLE` | `username`, `identity_key` | contact key refresh |
| `VAULT_RESPONSE` | `enc_vault` | during account recovery |
| `KEY_UPDATE_SUCCESS` | — | |
| `DELETE_ACCOUNT_SUCCESS` | — | client wipes local DB after this |
| `RECOVERY_LOCK_UPDATED` | — | |
| `DEVICE_LIST` | `devices` | |
| `DEVICE_REVOKED_SUCCESS` | `hardware_hash` | |
| `ERROR` | `message` | contains "revoked"/"session" → client disconnects |
| `FRIEND_REQUEST` | request data | |
| `FRIEND_REQUEST_ACCEPTED` | `sender`/`accepted_by` | client then fetches prekey |
| `FRIEND_REQUEST_REJECTED` | — | |
| `FRIEND_REQUEST_LIST` | `requests` | |
| `FRIENDS_LIST` | `friends` (`[{username}]`) | client fetches each prekey |
| `FRIEND_REQUEST_SENT` | `recipient` | |
| `FRIEND_REQUEST_ERROR` | `message` | |

### E2EE payload types (inside the decrypted envelope)

These are encrypted with the recipient's public key and only decrypted client-side:

| Type | Purpose |
|---|---|
| `{"sender", "body"}` | direct message |
| `{"type": "group_msg", group_uuid, group_name, sender, body}` | group message (fanned out per member) |
| `{"type": "group_invite", group_uuid, group_name, members}` | group creation / add member |
| `{"type": "group_update", group_uuid, group_name, members}` | roster change (creator only) |
| `{"type": "group_kick", group_uuid, group_name}` | kick → deletes local group |
| `{"type": "file_init", transfer_id, filename, file_size, chunk_size, total_chunks, file_key, file_hash}` | start file transfer (file_key = hex AES-256 key) |
| `{"type": "file_ack_init", transfer_id}` | receiver ready |
| `{"type": "file_chunk", transfer_id, chunk_index, data}` | encrypted 128 KB chunk |
| `{"type": "file_ack", transfer_id, chunk_index}` | ordered ACK loop |
| `{"type": "file_status_query", transfer_id}` / `file_status_response` | resume support |
| `{"type": "file_cancel", transfer_id}` | abort |
| `{"type": "metadata_sync", action, data}` | self-addressed device sync (`SYNC_META:` prefix), actions: `ADD_CONTACT`, `DELETE_CONTACT`, `CREATE_GROUP`, `DELETE_GROUP`, `UPDATE_GROUP_MEMBERS` |

Self-sync copies are wrapped with the `SYNC:sent:` prefix (and optionally
`SYNC_META:` for metadata sync).
