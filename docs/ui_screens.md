# Vexta UI — Screen Inventory

Findings from reviewing the existing Vexta Flet (Python) application UI in `ui/`.

## Architecture

- `ui/router.py` + `ui/__init__.py` handle top-level routing.
- Platform-agnostic screens live in `ui/shared/`; `AppLayout`, `ChatView`, and `SettingsView`
  each have separate desktop (`ui/desktop/`) and mobile (`ui/mobile/`) implementations.
- The router swaps whole screens via `page.clean()` / `page.add()`.

## Screens (9 distinct full-screen views)

1. **Login / Unlock** — `ui/shared/login.py`
   Account dropdown, master password, biometric unlock, "Forgot Password" dialog
   (recovery code / wipe), and links to Sign Up / Restore Backup / Import `.vxvault`.

2. **Signup** — `ui/shared/signup.py`
   One screen with 4 interchangeable modes:
   - **Welcome** — Create Vault / Log In & Restore / Import backup
   - **Create Account** — username, password, confirm
   - **Restore** — Quick Sync link autofill or manual username + recovery code + password
   - **Import** — pick `.vxvault` file + backup password

3. **Loading / progress** — `ui/shared/loading.py`
   Animated vault creation/recovery status (keygen, encrypt, ping, register, recover…).

4. **Main app shell** — `AppLayout`
   - Desktop: 300px sidebar (search, Friends btn, Create Group, contact list, profile card,
     sign out) + main content pane.
   - Mobile: same content with hamburger + `NavigationDrawer` (Friends, Create Group,
     Settings, Sign Out).

5. **HomeView** — `ui/shared/home_view.py`
   Empty state: "Select a chat to start messaging".

6. **ChatView** — `ui/desktop/chat_view.py`, `ui/mobile/chat_view.py`
   1:1 chat, group chat, or "Vexta - Global Message" announcement channel.
   Header, message list, input with attach / gallery / disappearing-messages timer / send.
   Side `ChatInfoView` panel.

7. **ChatInfoView** — `ui/shared/chat_info_view.py`
   Metadata side panel (full screen on mobile): fingerprint + QR, contact info, group members
   (add/kick), wallpaper theme picker, disappearing-message selector, export transcript
   (TXT/JSON).

8. **FriendsView** — `ui/shared/friends_view.py`
   3 tabs:
   - **Active Friends**
   - **Pending Requests** (accept / decline)
   - **Add Friend** (by username or identity string) + "Your Share Profile" panel with QR
     code, identity URL, public key.

9. **SettingsView** — `ui/desktop/settings_view.py`, `ui/mobile/settings_view.py`
   6 tabs:
   - **Account & Keys** — profile, keys, recovery code
   - **Security & Privacy** — auto-lock, biometrics, notifications, danger zone
   - **Devices** — list / revoke
   - **Bridge Network** — server connection settings
   - **Data & Storage** — stats, clear history, export vault
   - **About** — version, update check

## Components (not screens)

- `ui/components/bubble.py` — ChatBubble
- `ui/components/announcement_bubble.py` — AnnouncementBubble (global channel)
- `ui/components/file_transfer_bubble.py` — FileTransferBubble (progress / cancel / resume)

## Notes

- Total: **9 screens** — Login, Signup (4 modes), Loading, App shell, Home, Chat, Chat Info,
  Friends, Settings.
- Many modal dialogs exist across screens: create group, fingerprint verify, clear history,
  remove contact, leave group, sign out, wipe vault, server-key-change warning, recovery
  success, and others.
- This inventory serves as the reference for a React Native port.
