/** A kind of file a picker offers, such as { name: 'CSV', extensions: ['csv'] }. */
export interface FileKind {
  name: string
  extensions: string[]
}

/** The result of saving text where the user chose. */
export type SaveResult = { saved: false } | { saved: true; path: string }

/**
 * What the handlers ask of the machine the user sits at: pickers, opening a folder or a web page,
 * and saving a file they export (specs/035-pi-variant, PI-004). The desktop app answers with
 * Electron's dialogs and shell; a headless host answers its own way.
 */
export interface Desktop {
  /** A folder the user picks, or null when they cancel. */
  pickFolder(title: string): Promise<string | null>
  /** A file the user picks, or null when they cancel. */
  pickFile(title: string, kinds: FileKind[]): Promise<string | null>
  /** Asks where to save, then writes the text there; nothing is written when they cancel. */
  saveText(defaultName: string, text: string, kinds: FileKind[]): Promise<SaveResult>
  /** Opens a folder in the system's file manager; resolves to the error message, or '' when it opened. */
  openFolder(folderPath: string): Promise<string>
  /** Opens a web page in the user's browser. */
  openExternal(url: string): Promise<void>
}
