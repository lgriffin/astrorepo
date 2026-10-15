# 035 Raspberry Pi variant: requirements

Leigh asked (15 October 2026) whether astrorepo can have a variant that runs on a Raspberry Pi,
taking ideas from [RaspAstroDisplay](https://github.com/RAHoebe/RaspAstroDisplay), and chose a
headless astrorepo server on the Pi with a Chromium kiosk on its touchscreen. The Windows PC keeps
the heavy work (Siril, RC Astro), the Synology NAS keeps the data, and the Pi sits by the scope:
it shows tonight's plan, copies Vespera sessions to the NAS, and anyone on the home network can
open it in a browser. The plan is the doc "astrorepo on a Raspberry Pi"
(https://claude.ai/code/artifact/3e834963-555b-47df-87a7-f032153f8eb3).

The variant is built in five slices, one PR each. Only the IDs of slices that are built are listed
below; the rest is backlog.

| Slice | What it delivers | Status |
| --- | --- | --- |
| 1 · Transport seam | Every handler on a channel router with no Electron in it; a Desktop port for pickers, saving, opening folders and links; the database, catalogues and job runner told their folders by the host; Electron only in `src/main/index.ts` and `src/main/electron/` | Built (PI-001 to PI-006) |
| 2 · Headless host | A Node entry point that serves the built renderer and `POST /api/<channel>` with the same Zod schemas; local network only, same-origin checks and a per-start token on writes; the renderer's `api.invoke` falls back to fetch | Next |
| 3 · Pi install | Linux arm64 build, a systemd service for the server, a user service for a Chromium kiosk on Wayland (labwc or Wayfire), an install script, and a Pi profile (data on the NAS mount, job runner off) | Backlog |
| 4 · Tonight on the touchscreen | Touch-first navigation at 800 × 480 (large targets, swipe between pages, no keyboard), red night mode, backlight dimming where the first touch only wakes the screen, and an idle screen preset in Settings: a slideshow of the gallery, tonight's plan or the Messier mosaic until the screen is touched (Leigh, 15 October 2026) | Backlog |
| 5 · Field ingest | The Vespera copy flow of spec 034 run from the Pi at the end of a session, straight into the NAS landing folder | Backlog |

## Slice 1: the transport seam

Before this slice the IPC handlers called `ipcMain.handle`, Electron's dialogs and its shell
directly, and the database, catalogue seed and job runner asked Electron's `app` for their
folders. Nothing a user sees changes in this slice: the desktop app hosts the same channels over
IPC, opens the same pickers and saves the same CSV files.

- `src/main/transport/router.ts`: `ChannelRouter`, the channels the renderer can call.
- `src/main/transport/desktop.ts`: the `Desktop` port (`pickFolder`, `pickFile`, `saveText`,
  `openFolder`, `openExternal`).
- `src/main/electron/`: the Electron side: `hostOverIpc`, `electronDesktop`,
  `electronJobsEnvironment`, and the two image decoders that need Electron's `nativeImage`
  (`native-thumbnails.ts`, `picture-shrinker.ts`, moved from `src/main`).
- `registerHandlers(router, desktop)` in `src/main/ipc/handlers.ts` replaces `registerIpcHandlers()`;
  `initDatabase(dataFolder)`, `useSeedFolder(folder)` and `startJobs(environment)` take what they
  used to ask Electron for.

### Decisions

- **The Desktop port saves, it does not only pick.** `saveText` asks where and writes, so a
  headless host can answer with a download instead of a path on the Pi.
- **The router and the port live in `src/main/transport`, not in `packages/application`.** They
  are how a host reaches the handlers, not something a use case needs.
- **The preload stays Electron's.** It is the desktop app's half of the bridge; slice 2 adds the
  browser's half.

| ID | Pattern | Requirement |
| --- | --- | --- |
| PI-001 | Ubiquitous | The main process shall hold every channel the renderer can call, including every channel that has a schema, in one channel router that uses no Electron types, and the desktop app shall host that router's channels over IPC. |
| PI-002 | Unwanted | If a request names a channel the router does not hold, then the router shall refuse it with an error naming the channel and run no handler. |
| PI-003 | Unwanted | If a channel is added to the router a second time, then the router shall refuse it with an error naming the channel and keep the first handler. |
| PI-004 | Ubiquitous | The handlers shall reach folder and file pickers, saving an exported file, opening a folder and opening a web page only through the Desktop port. |
| PI-005 | Ubiquitous | Only the desktop app's entry point and the files in src/main/electron shall import Electron, and the channel router and the Desktop port shall import nothing. |
| PI-006 | Unwanted | If a request carries arguments its channel's schema refuses, then the router shall reject it with the validation error before the handler runs. |
