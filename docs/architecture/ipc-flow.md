# IPC Communication Flow

The handlers live on a `ChannelRouter` (`src/main/transport/router.ts`, spec 035) that holds no Electron types; `src/main/electron/ipc-host.ts` hosts its channels with `ipcMain.handle`, and pickers, saving exports and opening folders go through the `Desktop` port (`src/main/transport/desktop.ts`), answered in the desktop app by `src/main/electron/electron-desktop.ts`. `npm run serve` (spec 035, slice 2) serves the same router over HTTP: `src/main/http/http-host.ts` answers `POST /api/invoke/<channel>` with `{ value }` or `{ error }`, and when no preload is present `src/renderer/bridge.ts` gives the page an `api.invoke` that posts there with the token the server wrote into the page.

All communication between the React renderer and the Node.js main process uses Electron's IPC (Inter-Process Communication) mechanism. The renderer never has direct access to Node.js APIs or the database. Instead, React components call typed wrapper functions exposed on `window.api` by the preload script's `contextBridge`. These wrappers invoke `ipcRenderer.invoke()`, which sends an asynchronous message to the main process. On the main-process side, `ipcMain.handle()` receives the call, validates the arguments against a Zod schema, delegates to the appropriate service method, and returns the result (or a structured error) back through the same channel.

```mermaid
sequenceDiagram
    participant RC as React Component
    participant Hook as useIPC Hook
    participant WA as window.api<br/>(contextBridge)
    participant IPC as ipcRenderer.invoke
    participant Main as ipcMain.handle
    participant Zod as Zod Validation
    participant Svc as Service Layer
    participant Drizzle as Drizzle ORM
    participant DB as SQLite Database

    RC->>Hook: call query/mutation<br/>(e.g. getTargets(filters))
    Hook->>Hook: set loading state

    Hook->>WA: window.api.targets.list(filters)
    WA->>IPC: ipcRenderer.invoke(<br/>"targets:list", filters)

    Note over IPC,Main: IPC crosses process boundary<br/>(serialized via structured clone)

    IPC->>Main: handle "targets:list"
    Main->>Zod: validate(args, TargetListSchema)

    alt Validation fails
        Zod-->>Main: ZodError
        Main-->>IPC: { success: false,<br/>error: "Invalid arguments" }
        IPC-->>WA: rejected promise
        WA-->>Hook: throw error
        Hook-->>RC: error state
    end

    Zod-->>Main: validated args
    Main->>Svc: TargetService.list(validatedArgs)
    Svc->>Drizzle: db.select().from(targets)<br/>.where(...).orderBy(...)
    Drizzle->>DB: SQL query
    DB-->>Drizzle: result rows
    Drizzle-->>Svc: typed Target[]
    Svc-->>Main: Target[]
    Main-->>IPC: { success: true,<br/>data: Target[] }
    IPC-->>WA: resolved promise
    WA-->>Hook: Target[]
    Hook->>Hook: set data, clear loading
    Hook-->>RC: { data, loading, error }

    Note over RC,DB: Error boundary catches<br/>uncaught IPC errors at the<br/>top of the component tree
```
