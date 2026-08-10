# How Vexta Works (Backend Deep-Dive)

This document captures how the Vexta messenger works internally, based on a
full read of the original Python/Flet codebase. It is the technical reference
for the React Native port.

## Architecture

Zero-knowledge, end-to-end encrypted messenger. A **relay bridge server**
(WebSocket, Django/Channels fork of the Substrata Bridge, default
`vexta-api.nexusec.space`) only routes opaque ciphertext blobs. All keys,
plaintext, contacts, and group rosters exist only on clients. Desktop + Android
via Flet (Flutter).

Core layering:

- `ui/` — Flet screens (see `docs/ui_screens.md`)
- `core/controller.py` — `VextaController`, a façade over sub-managers
- `core/profile_manager.py`, `core/vault_manager.py`, `core/device_manager.py`,
  `core/file_transfer_manager.py` — feature managers
- `crypto/` — identity, AES-GCM vault, Argon2id KDF, TOFU trust store
- `db/manager.py` — per-profile SQLite (`BedrockManager`)
- `network/client.py` — `BridgeClient`, WebSocket relay client

## Key model (envelope encryption)

- **Master Key (MK)** — Argon2id(password, salt), time=3, memory=65536 KiB,
  parallelism=4, 32-byte output (`crypto/kdf.py`).
- **Data Encryption Key (DEK)** — 32 random bytes generated at signup. MK
  encrypts the DEK; the DEK encrypts the RSA-4096 private key and recovery
  code (`profile_manager.py:61-70`). Password rotation only re-wraps the DEK.
- **Identity** — RSA-4096 `IdentityKeys`: PSS/SHA-256 signing, RSA-OAEP key
  wrapping, SHA-256 fingerprint (`crypto/identity.py`).

## Hybrid message blob (`crypto/identity.py`)

Per-message random 32-byte AES key + 12-byte nonce, payload encrypted with
AES-256-GCM, session key wrapped with the recipient's RSA-4096 public key
(RSA-OAEP/SHA-256). Wire format (byte-identical to the Substrata Bridge spec):

```
[4-byte key_len][RSA-OAEP AES key][12-byte nonce][GCM ciphertext + 16-byte tag]
```

→ base64. `encrypt_hybrid_bulk` encrypts the same plaintext for many recipients
(used by group fan-out).

## Local storage (`db/manager.py`)

- One SQLite database **per profile**: `account_{sha256(username)}.db` in the
  platform data dir, chmod 0700/0600. On Android, stored in
  `/data/data/<pkg>/files/Vexta` (the Flet app dir is wiped on APK updates, so
  the code climbs out of it).
- `SQLiteConnectionPool` — max 5 connections, WAL mode, busy_timeout 5000,
  foreign_keys ON.
- Tables: `user_meta` (salt, encrypted DEK, encrypted private key, KDF params,
  encrypted recovery code, login throttle), `contacts`, `messages` (ciphertext
  **at rest**, decrypted only on display), `groups` / `group_members`,
  `server_trust` (TOFU fingerprints), `file_transfers` (AES key encrypted under
  the DEK). Schema auto-migrates by adding missing columns.

## Bridge protocol (`network/client.py`)

- Connect to `wss://<host>/ws/chat/` with browser-like headers (Cloudflare
  WAF bypass).
- Flow: receive `AUTH_CHALLENGE` (nonce + server public key + signature) →
  validate nonce (≥32 bytes, valid hex, replay-guarded) → **verify the server's
  signature** (mutual auth) → TOFU check fingerprint against `server_trust`
  ("new" trusts and stores, "changed" aborts with a MITM warning) → sign the
  nonce with RSA-PSS → send `AUTH_RESPONSE` (or `REGISTER`).
- Passcode is **HMAC-bound to the nonce** (SHA-256 of the passcode keyed by the
  nonce) so it never leaves the client.
- Exponential backoff reconnect (1s → 60s max).
- `SEND_MESSAGE` carries an optional `self_ciphertext` so sent messages
  round-trip to self for zero-knowledge multi-device storage.

## Message flow (`core/controller.py`)

Inbound `BLIND_MESSAGE`: decrypt → parse envelope `{"sender", "body"}` →
**spoofing check** comparing envelope sender vs JSON sender → save ciphertext →
ACK. `SYNC:` self-copies are detected by prefix. Messages are stored as
ciphertext and decrypted only for display.

## Groups (client-side mesh — no server crypto)

`create_group` / `send_group_message` encrypt the payload **individually per
member** and fan out through the bridge; a local copy is kept under the user's
own key. `group_invite` / `group_update` / `group_kick` are control payloads; a
kick deletes the local group. Only the creator may send updates/kicks.

Cross-device consistency is handled by **metadata sync**: self-addressed
`SYNC_META:` payloads carry add/delete contact and group operations
(`_send_metadata_sync`), encrypted to the user's own key.

## File transfer (`core/file_transfer_manager.py`)

Fully client-side E2EE over the message channel:

- Random 32-byte AES key shared in `file_init`.
- **128 KB chunks**, each GCM-encrypted with a fresh 12-byte nonce.
- Strict ordered ACK loop — no ACK means no next chunk.
- Received into a `.part` temp file, SHA-256 integrity check on completion,
  then moved to `Downloads/Vexta/`.
- Resumable via `file_status_query` / `file_status_response`.
- Optional EXIF/GPS metadata scrubbing on send (`crypto/scrubber.py`).
- Transfer AES key stored in the DB encrypted under the DEK.

## Account lifecycle

- **Signup** — identity generated in memory and staged; only committed to
  SQLite after `AUTH_SUCCESS`. Recovery code (`secrets.token_hex(16)`)
  encrypted under the DEK; the bridge only receives its **SHA-256 hash**
  (`update_recovery_lock`).
- **Login** — DB-backed exponential throttle (1.5^n, capped at 5 s) on wrong
  password.
- **Recovery** — recovery code → session key (Argon2id(`code:username`,
  fixed salt)) encrypts a temp private-key backup to disk → connect in recover
  mode → pull encrypted vault from bridge → decrypt with new password → update
  key + upload vault → delete backup.
- **Delete account** — waits for bridge `DELETE_ACCOUNT_SUCCESS` (5 s timeout),
  then wipes the local DB.

## Device management

`hardware_hash` = SHA-256 of the platform machine ID (Windows
MachineGuid/WMI, Linux `/etc/machine-id`, macOS IOPlatformUUID, fallback
persistent UUID). Sent on auth; the bridge supports list/revoke.

## Security extras

- **Biometric unlock** via OS APIs (WinBio / Touch ID / Android jnius); master
  password stored with AES-GCM keyed by a random device secret — documented as
  a convenience, not a security boundary.
- **Screen security**: Windows `WDA_EXCLUDEFROMCAPTURE` (with a 30 s keeper
  thread), macOS `NSWindowSharingNone`, Android `FLAG_SECURE`.
- **Disappearing messages** via a heap-based `MessageDestructionScheduler`
  daemon thread that deletes the message after the timer.
- **Signed global announcements** pulled from `/api/announcements/?limit=5`,
  verified against a TOFU-trusted signing key.

## 7. Chunked E2EE File Transfer Protocol

Vexta implements Zero-Knowledge, chunked file sharing designed to securely stream large files without loading entire files into memory:

1. **Chunking Engine**: Source files are split into **128 KB chunks** (`131,072` bytes).
2. **Symmetric AES-GCM 256-bit Keying**: Each transfer generates an ephemeral 32-byte AES key. Each 128KB chunk is encrypted with a unique 12-byte random IV/nonce.
3. **Chunk Streaming & Acknowledgments**: Chunks are transmitted sequentially (`file_chunk`). Receiver acknowledges each received chunk (`file_ack`), ensuring backpressure control and pause/resume capability.
4. **End-to-End Integrity Checks**: The sender calculates a SHA-256 digest of the source file (`file_hash`). Once the final chunk is received, the receiver computes the SHA-256 digest of the reassembled file. Corrupted files trigger automatic deletion.

---

## Notes for the React Native port

- The bridge protocol is simple JSON over WSS and is trivially portable.
- Crypto: `react-native-quick-crypto` / platform keystore for AES-GCM; RSA-4096
  + RSA-OAEP needs `node-forge`/`jose` or native keystore support (tweetnacl is
  insufficient).
- Argon2id needs a native binding (`argon2`).
- Per-profile SQLite → `react-native-sqlite-storage` or `op-sqlite` with a
  user_meta-per-profile scheme.
- Android storage-climbing trick for APK updates is Flet-specific and not
  needed in RN.
