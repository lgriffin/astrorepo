# 035 Raspberry Pi variant: requirements

Leigh asked (15 October 2026) whether astrorepo can have a variant that runs on a Raspberry Pi,
taking ideas from [RaspAstroDisplay](https://github.com/RAHoebe/RaspAstroDisplay), and chose a
headless astrorepo server on the Pi with a Chromium kiosk on its touchscreen. The Windows PC keeps
the heavy work (Siril, RC Astro), the Synology NAS keeps the data, and the Pi sits by the scope:
it shows tonight's plan, copies Vespera sessions to the NAS, and anyone on the home network can
open it in a browser. The plan is the doc "astrorepo on a Raspberry Pi"
(https://claude.ai/code/artifact/3e834963-555b-47df-87a7-f032153f8eb3).

The variant is built in six slices, one PR each. Only the IDs of slices that are built are listed
below; the rest is backlog.

| Slice | What it delivers | Status |
| --- | --- | --- |
| 1 · Transport seam | Every handler on a channel router with no Electron in it; a Desktop port for pickers, saving, opening folders and links; the database, catalogues and job runner told their folders by the host; Electron only in `src/main/index.ts` and `src/main/electron/` | Built (PI-001 to PI-006) |
| 2 · Headless host | A Node entry point (`npm run serve`) that serves the built renderer and `POST /api/invoke/<channel>` with the same Zod schemas; only this machine's names, same-origin checks and a per-start token on every API call; the renderer's `api.invoke` falls back to fetch | Built (PI-007 to PI-016) |
| Companion screens | The Windows app serves its own pages to the home network when "Allow companion screens" is on; a Pi (or any browser) pairs by a code typed on the PC, then follows the page the PC is on or stays on a place of its own, as a second screen of the Windows app (Leigh, 15 October 2026) | Built (PI-017 to PI-023) |
| 3 · Pi install | Linux arm64 build, a systemd service for the server, a user service for a Chromium kiosk on Wayland (labwc or Wayfire), an install script, a Pi profile (data on the NAS mount, job runner off), a Node image decoder for JPEG and TIFF, HTTPS for companion screens with a self-signed certificate pinned at pairing (Leigh, 15 October 2026), and the kiosk's choice between the PC as companion and its own server when the PC is off | Backlog |
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

## Companion screens

Leigh asked (15 October 2026) whether the Pi can be an extension of the Windows app, a second
screen when chosen and configured. In this slice the desktop app itself serves its pages and
channels to the home network, so a paired screen shows the Windows library, jobs and plan live,
with no second database and no copying.

- `packages/domain/src/companion.ts`: the rules: six-digit codes, names, expiry, which PC pages a
  companion may follow, and which channels a companion may call.
- `packages/application/src/use-cases/companion.ts`: `makeCompanion` over the
  `CompanionDeviceStore` and `CompanionSecrets` ports: pairing, removing, the screen choice and
  where a companion should be. `SqliteCompanionStore` (table `companion_devices`) and
  `nodeCompanionSecrets` are the adapters.
- `src/main/http/companion-host.ts`: `makeCompanionHost`, which starts and stops the HTTP host in
  companion mode (`createHttpHost({ companions })`) on every interface, port 8090 by default.
- `src/main/ipc/companion-handlers.ts`: the `companion:*` channels, on the desktop router only.
- Renderer: `components/companion/PairScreen.tsx` (what an unpaired screen shows),
  `CompanionLinks.tsx` (following on a companion, reporting the page in the desktop app) and
  `CompanionSettings.tsx` (Settings → Companion screens); `companionBridge` in `bridge.ts`.

### Decisions

- **The PC serves, the Pi shows.** A companion opens `http://<pc>.local:8090/` in its browser
  or kiosk. Each machine keeps its own database: a companion has none of its own while paired.
  Falling back to the Pi's own server when the PC is off belongs to the Pi install slice, whose
  kiosk chooses which address to open.
- **Pairing by a code the screen shows.** The screen asks with a name and shows six digits for
  five minutes; a person types them on the PC. Only then does the PC hand that screen a 256-bit
  key, during a five-minute pickup time that starts when the code is typed, which the screen keeps in its browser storage and sends in `X-Astrorepo-Device` on
  every call. The PC keeps only the key's SHA-256 hash, at most five screens may wait at once (a screen
  asking again replaces its own request) and eight may be paired. A pairing whose key is never
  collected is undone. Approvals run one at a time, so typing a code twice pairs once. Removing a screen on the PC sends it back to the pairing page.
- **A paired screen is trusted like someone at the PC**, so it can run jobs or change settings,
  but it cannot pair, remove or reconfigure companions (any `companion:*` channel or a
  `companion_` setting) or wipe the library (`db:reset`). Its calls use the served Desktop, so
  nothing it does opens a dialog on the PC; exports go to `<data>/exports` on the PC.
- **Follow or stay.** Each screen follows the PC by default: the desktop app reports each page
  it opens, and the companion goes there within a few seconds. While the PC is in Settings the
  companion stays where it was. Someone touching the companion holds it for a minute. A screen
  can instead stay on Home, the Sky planner, Jobs, the Gallery or the Messier mosaic. The idle
  slideshow comes with the touchscreen slice.
- **Plain HTTP for now.** Someone already on the home network who intercepts traffic could copy a
  screen's key, as with the headless server's token. Leigh chose (15 October 2026) to add HTTPS,
  with a self-signed certificate the kiosk trusts and pins at pairing, in the Pi install slice.
- **Off by default.** Nothing listens on the network until "Allow companion screens" is ticked;
  the choice and the port are kept as the settings `companion_enabled` and `companion_port`.

| ID | Pattern | Requirement |
| --- | --- | --- |
| PI-017 | Optional | Where "Allow companion screens" is on, the desktop app shall serve its pages and channels on every network interface on port 8090, or on the port chosen in Settings from 1024 to 65535, list the addresses a screen can open, and say why when the port is in use or the pages are not built; where it is off, nothing shall be served, and the headless server shall have no pairing address. |
| PI-018 | Event | When a screen asks to pair with a name, the desktop app shall give it a six-digit code that lasts five minutes, replacing any code that screen asked for before, and when a person types that code in Settings → Companion screens, it shall pair the screen following the PC, keep only a hash of a new key, and hand the key to that screen during the five minutes after the code was typed. |
| PI-019 | Unwanted | If a pairing request has no usable name, five screens are already waiting, or a typed code is not six digits, matches no waiting screen, has expired, was already typed or would make a ninth paired screen, then the desktop app shall refuse it with a message saying what to do and pair nothing; and if a paired screen never collects its key in time, it shall be unpaired again. |
| PI-020 | Unwanted | If a request from a companion carries no key, a key the PC never gave, or the key of a screen since removed, then the desktop app shall refuse it with 401 and run nothing, and the screen shall forget its key and show the pairing page. |
| PI-021 | State | While a companion follows the PC, it shall show the page the desktop app is on, staying on the last page it could show while the PC is in Settings and staying put for a minute after it is touched; while it is set to Home, the Sky planner, Jobs, the Gallery or the Messier mosaic, it shall go to that place as soon as it is chosen and return to it a minute after it is touched. |
| PI-022 | Unwanted | If a paired companion calls a companion channel, reads or writes a companion setting, or wipes the library, then the desktop app shall refuse it with 403 and run nothing. |
| PI-023 | Ubiquitous | Settings → Companion screens shall list each paired screen with its name, when it was paired and when it was last seen (written at most once a minute), and let the person pair a screen by its code, choose what it shows and remove it. |
