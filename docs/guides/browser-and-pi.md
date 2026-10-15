# Using astrorepo in a browser, and a Pi as a second screen

astrorepo can run without its desktop window: a small server serves the same pages to any browser.
This is the base of the Raspberry Pi variant (spec 035), where a Pi beside the scope runs the
server and shows it in a kiosk on its touchscreen, while the Windows PC keeps the heavy work.

## Start it

```sh
npm run build    # builds the pages into out/renderer
npm run serve    # serves them at http://127.0.0.1:8090/
```

Open that address in a browser. The server keeps its own library in an `astrorepo-server` folder
beside the desktop app's, so the two never run jobs from one queue. Do not point `ASTRO_DATA` at the
desktop app's folder while the desktop app is open.

| Setting | Default | What it does |
| --- | --- | --- |
| `ASTRO_DATA` | `astrorepo-server` beside the desktop app's data folder (`%APPDATA%\astrorepo-server`, `~/.config/astrorepo-server`) | Where the database, jobs logs and exports live |
| `ASTRO_BIND` | `127.0.0.1` | Set `0.0.0.0` to let other computers on your network open it |
| `ASTRO_PORT` | `8090` | The port to listen on |
| `ASTRO_HOSTS` | none | Extra names the server answers to, comma separated (it already answers to `localhost`, its host name, `<host name>.local` and its own addresses) |
| `ASTRO_STATIC` | `out/renderer` | Where the built pages are |

## What is different in a browser

- **Choosing a folder or file** asks you to type its path on the computer the server runs on,
  such as `/mnt/astro/images` on a Pi with the NAS mounted.
- **Exports** (CSV of targets, grades, mosaic plans) are saved in the `exports` folder inside the
  data folder, and the page tells you the path.
- **Web links** (SIMBAD, Wikipedia) open in a new tab. **Open folder** cannot open from the server;
  the message shows the folder instead.
- **Jobs** run when you press Run now. The run window never starts one by itself, because the
  server cannot tell whether anyone is using the computer.
- **Gallery pictures** are sent at full size, and Messier tiles whose only pictures are JPEG or
  TIFF are not drawn, since the server has no image decoder yet.

## A Pi (or tablet) as a second screen for the Windows app

The desktop app can serve itself to a companion screen on your home network: a Raspberry Pi
touchscreen by the scope, a tablet, or another computer. The companion shows the Windows library,
jobs and plan live; nothing is copied.

1. On the PC, open Settings → Companion screens and tick **Allow companion screens**. The card
   lists the addresses to open, such as `http://studio-pc.local:8090/`. Change the port there if
   8090 is taken. Windows may ask whether astrorepo can use private networks: allow it.
2. On the screen, open that address. Name the screen and tap **Show a pairing code**.
3. Type the six digits on the PC and press **Pair**. The screen opens astrorepo within a few
   seconds and stays paired, even after either side restarts.

Each screen follows the PC by default: when you open a page on the PC, the companion shows it
too, except Settings. Touching the companion holds it where you put it for a minute. In the list of
paired screens you can instead keep one on Home, the Sky planner, Jobs, the Gallery or the
Messier mosaic, and **Remove** sends a screen back to the pairing page.

A paired screen can do what you can at the PC (run a job, change a setting), except pair or remove
screens and wipe the library, so pair only screens you own. Exports it makes are saved on the PC in
the `exports` folder of astrorepo's data folder. The kiosk set-up for a Pi, and falling back to the
Pi's own server when the PC is off, come with the Pi install.

## Keep it on your home network

There are no accounts: anyone who can open the page can use it. The server only answers to this
computer's own names, needs a token that it writes into the page each time it starts, and refuses
requests from other websites. Even so, never forward its port to the internet.
