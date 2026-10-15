# Using astrorepo in a browser (and, soon, on a Raspberry Pi)

astrorepo can run without its desktop window: a small server serves the same pages to any browser.
This is the base of the Raspberry Pi variant (spec 035), where a Pi beside the scope runs the
server and shows it in a kiosk on its touchscreen, while the Windows PC keeps the heavy work.

## Start it

```sh
npm run build    # builds the pages into out/renderer
npm run serve    # serves them at http://127.0.0.1:8090/
```

Open that address in a browser. The desktop app and the server share one data folder by default,
so both show the same library.

| Setting | Default | What it does |
| --- | --- | --- |
| `ASTRO_DATA` | the desktop app's data folder (`%APPDATA%\astrorepo`, `~/.config/astrorepo`) | Where the database, jobs logs and exports live |
| `ASTRO_BIND` | `127.0.0.1` | Set `0.0.0.0` to let other computers on your network open it |
| `ASTRO_PORT` | `8090` | The port to listen on |
| `ASTRO_HOSTS` | none | Extra names the server answers to, comma separated (it already answers to `localhost`, its host name, `<host name>.local` and its own addresses) |
| `ASTRO_STATIC` | `out/renderer` | Where the built pages are |

## What is different in a browser

- **Choosing a folder or file** asks you to type its path on the computer the server runs on,
  such as `/mnt/astro/images` on a Pi with the NAS mounted.
- **Exports** (CSV of targets, grades, mosaic plans) are saved in the `exports` folder inside the
  data folder, and the page tells you the path.
- **Open folder and web links** (SIMBAD, Wikipedia) cannot open from the server; the message shows
  the folder or link instead.
- **Jobs** run when you press Run now. The run window never starts one by itself, because the
  server cannot tell whether anyone is using the computer.
- **Gallery pictures** are sent at full size, since the server has no image shrinker yet.

## Keep it on your home network

There are no accounts: anyone who can open the page can use it. The server only answers to this
computer's own names, needs a token that it writes into the page each time it starts, and refuses
requests from other websites. Even so, never forward its port to the internet.
