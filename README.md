# Vexta Electron

Zero-knowledge, end-to-end encrypted messenger — desktop client built with
React + Vite + TypeScript, intended to be wrapped in Electron.

## Development

```sh
npm install
npm run dev
```

## Routing

The app uses **hash-based routing** (`react-router-dom` `HashRouter`) so routes
work when the built bundle is served from the filesystem via Electron's
`file://` protocol. All asset URLs are emitted relative (`base: './'` in
`vite.config.ts`), which is also required for `file://` loading.

Vite dev server (`npm run dev`) is only for browser-based development; in the
packaged Electron app the `dist/` output is loaded directly.

## Screen structure

Routes are defined in `src/App.tsx` and mirror the original Vexta UI:

| Route                  | Screen        |
| ---------------------- | ------------- |
| `/login`               | Login / Unlock |
| `/signup`              | Signup (4 modes) |
| `/loading`             | Loading / progress |
| `/`                    | App shell (sidebar + content) |
| `/friends`             | Friends (3 tabs) |
| `/settings`            | Settings (6 tabs) |
| `/chat/:chatId`        | Chat view |
| `/chat/:chatId/info`   | Chat info panel |

See `docs/` for the API bridge protocol and screen inventory references.
