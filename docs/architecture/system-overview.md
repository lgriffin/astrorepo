# System Overview

Astrorepo is an Electron desktop application following the standard main/preload/renderer architecture. The **Main Process** owns the SQLite database (via better-sqlite3 and Drizzle ORM), exposes service methods through IPC handlers, and manages native OS integration. The **Preload** script uses Electron's `contextBridge` to expose a type-safe API object to the renderer without granting direct Node.js access. The **Renderer Process** is a React 18 SPA bundled by Vite, using React Router (HashRouter) for navigation and Tailwind CSS for styling. All communication between renderer and main crosses the IPC bridge, with Zod schemas validating every request on the main-process side.

```mermaid
graph TB
    subgraph Renderer["Renderer Process (Chromium)"]
        direction TB
        React["React 18 App"]
        Router["React Router<br/>(HashRouter)"]
        Pages["Pages<br/>(Dashboard, Targets,<br/>Sessions, Collections,<br/>Equipment, Observatory,<br/>Planning, Settings)"]
        Hooks["Custom Hooks<br/>(useIPC, useTargets,<br/>useSessions, etc.)"]
        Tailwind["Tailwind CSS"]

        React --> Router
        Router --> Pages
        Pages --> Hooks
        React --- Tailwind
    end

    subgraph Preload["Preload Script"]
        direction TB
        ContextBridge["contextBridge.exposeInMainWorld"]
        APIObject["window.api object<br/>(typed IPC wrappers)"]
        ContextBridge --> APIObject
    end

    subgraph Main["Main Process (Node.js)"]
        direction TB
        IPCHandlers["ipcMain.handle<br/>registered handlers"]
        ZodValidation["Zod Schema<br/>Validation"]
        Services["Service Layer<br/>(TargetService,<br/>SessionService,<br/>CatalogueService,<br/>CollectionService,<br/>EquipmentService,<br/>ObservatoryService,<br/>WorkflowService,<br/>SettingsService)"]
        DrizzleORM["Drizzle ORM<br/>(schema + queries)"]
        BetterSQLite["better-sqlite3"]
        SQLiteDB[("SQLite Database<br/>astrorepo.db")]
        AstronomyEngine["astronomy-engine<br/>(altitude, transit,<br/>moon calculations)"]
        SeedData["Seed Data Loader<br/>(JSON catalogues)"]

        IPCHandlers --> ZodValidation
        ZodValidation --> Services
        Services --> DrizzleORM
        Services --> AstronomyEngine
        DrizzleORM --> BetterSQLite
        BetterSQLite --> SQLiteDB
        SeedData --> Services
    end

    subgraph Build["Build Tooling"]
        Vite["Vite + electron-vite"]
        TSConfig["TypeScript 5.x"]
        Vitest["Vitest<br/>(unit + integration tests)"]
    end

    Hooks -- "window.api.invoke(channel, args)" --> APIObject
    APIObject -- "ipcRenderer.invoke(channel, args)" --> IPCHandlers
    IPCHandlers -- "result / error" --> APIObject
    APIObject -- "resolved promise" --> Hooks

    style Renderer fill:#1e293b,stroke:#38bdf8,color:#e2e8f0
    style Preload fill:#1e293b,stroke:#a78bfa,color:#e2e8f0
    style Main fill:#1e293b,stroke:#34d399,color:#e2e8f0
    style Build fill:#1e293b,stroke:#9ca3af,color:#e2e8f0
    style SQLiteDB fill:#0f172a,stroke:#f59e0b,color:#fbbf24
```
