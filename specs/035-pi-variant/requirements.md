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
| 2 · Headless host | A Node entry point (`npm run serve`) that serves the built renderer and `POST /api/invoke/<channel>` with the same Zod schemas; only this machine's names, same-origin checks and a per-start token on every API call; the renderer's `api.invoke` falls back to fetch | Built (PI-007 to PI-016) |
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

## Slice 2: the headless host

`npm run build` then `npm run serve` starts astrorepo without Electron: the same handlers, the
same database and the same pages, in any browser. It listens on 127.0.0.1:8090 unless told
otherwise, so a Pi exposes it to the network only when its install sets `ASTRO_BIND=0.0.0.0`.

- `src/server/main.ts`: the entry point, run with tsx; `src/server/settings.ts` reads `ASTRO_DATA`,
  `ASTRO_STATIC`, `ASTRO_BIND`, `ASTRO_PORT` and `ASTRO_HOSTS`.
- `src/main/http/http-host.ts`: `createHttpHost`, the page and `POST /api/invoke/<channel>` over
  Node's own `http` (no framework); `hostsFor` lists the names this machine answers to.
- `src/main/http/served-desktop.ts`: `ServedDesktop`, the Desktop port for a browser.
- The guide `docs/guides/browser-and-pi.md`.
- `src/renderer/bridge.ts`: `installBridge`, which gives the page an `api.invoke` over fetch when
  Electron's preload has not.

### Decisions

- **The token is written into the page.** Each start makes a 48-character token and puts it in a
  `<meta>` tag of index.html; every API call must carry it in `X-Astrorepo-Token`. Another site can
  neither read the page (the browser's same-origin rule) nor send the header without a CORS
  preflight the server never grants, and the Host check stops DNS rebinding. As in
  RaspAstroDisplay, there are no accounts: anyone on the home network who can open the page can use
  it, so the port must not be exposed to the internet.
- **Pickers ask in the browser.** The server has no screen, so a picker asks for a typed path on the
  computer astrorepo runs on (on the Pi, a NAS mount such as `/mnt/astro`). A folder browser can
  replace this once the touchscreen slice designs one.
- **Exports are saved on the server**, in `<data>/exports`, and the page says where, as the desktop
  app does. Downloads to the browser's own computer wait for a need.
- **Web pages open in the browser; folders do not open from the server.** SIMBAD or Wikipedia from
  the gallery opens in a new tab: the server hands the address back and the page opens it (web
  addresses only). Opening a target's folder says it opens only on the computer astrorepo runs on
  and shows the folder. Exports from Settings, whose page does not say where they went, are told.
- **The job runner never starts a job by itself.** The server cannot tell whether anyone is at the
  machine, so window jobs wait with the reason "Waits for Run now" whatever the idle setting
  (`windowJobs: false` on the machine's load); Run now still works.
- **The data folder is its own by default** (`astrorepo-server` beside the desktop app's), never
  the desktop app's folder: two job runners on one queue would mark each other's running job as
  interrupted and could start the same job twice. Pointing `ASTRO_DATA` at the desktop app's
  folder while the desktop app runs is not supported. The Windows app seeing the Pi, and the Pi
  showing the Windows app, is the companion slice.
- **Images are not shrunk on the server yet.** Electron's decoder is not there, so the gallery
  sends pictures at full size and Messier tiles whose only pictures are JPEG or TIFF show as not
  drawn (PNG and FITS tiles draw); a Node decoder comes with the Pi install.

| ID | Pattern | Requirement |
| --- | --- | --- |
| PI-007 | Event | When the headless server receives a POST to /api/invoke/<channel> with a JSON object holding a list of arguments, it shall run that channel's handler with those arguments and answer with its value, or with the error's message (400 for a validation error, 500 for any other). |
| PI-008 | Unwanted | If a request names a host that is not localhost, this machine's host name with or without .local, one of its network addresses or a name in ASTRO_HOSTS, then the server shall refuse it with 403 and run nothing. |
| PI-009 | Unwanted | If an API request does not carry the token written into the page at this start, carries another site's origin, or is not JSON, then the server shall refuse it (401, 403 or 415) and run no handler. |
| PI-010 | Ubiquitous | The renderer shall use Electron's bridge when the preload provides one and otherwise call the server's API with the page's token, rejecting a failed call with the server's error message. |
| PI-011 | Unwanted | If an API request's body is larger than 1 MB (answered as soon as it crosses the limit, without reading the rest), is not a JSON object with a list of arguments, or names a channel or address the server does not hold, then the server shall refuse it (413, 400, 404 or 405) and run no handler. |
| PI-012 | Optional | Where astrorepo is served to a browser, a picker shall ask for a typed path, an export shall be saved in the exports folder under the data folder without overwriting a file and the browser told where when its page does not say, a web page shall open in a new browser tab, and opening a folder shall say that it opens only on the computer astrorepo runs on. |
| PI-013 | Optional | Where astrorepo runs as the headless server, it shall listen on 127.0.0.1 port 8090 and keep its data in an astrorepo-server folder beside the desktop app's data folder unless ASTRO_BIND, ASTRO_PORT or ASTRO_DATA say otherwise, and it shall not start a job from the run window by itself whatever the idle setting. |
| PI-014 | Unwanted | If ASTRO_PORT is not a whole number from 1 to 65535, then the server shall refuse to start and say what ASTRO_PORT must be. |
| PI-015 | Unwanted | If a request asks for a file outside the built renderer (by path or through a link inside it), a folder or a missing file, then the server shall answer 404 and read nothing outside the built renderer. |
| PI-016 | Unwanted | If a request carries an address the URL parser rejects, or a handler fails after the answer has begun, then the server shall answer 400 or close that connection and keep serving every other request. |
