import { settingsLink } from './navigation'

/** What the app knows about how far the user has set it up (specs/017-unified-ux, UX-014). */
export interface SetupState {
  latitude: string | null
  longitude: string | null
  homeFolder: string | null
  lastLibraryScan: string | null
  /** Siril was found by the tool hub; null when the hub could not be asked. */
  sirilFound: boolean | null
}

export interface SetupStep {
  id: 'site' | 'folder' | 'scan' | 'siril'
  label: string
  /** Why the step matters, in one line. */
  why: string
  done: boolean
  /** Where the step is done. */
  link: string
  linkLabel: string
}

const set = (v: string | null) => v !== null && v.trim() !== ''

/** The first-run steps, in the order they are best done. */
export function setupSteps(s: SetupState): SetupStep[] {
  return [
    {
      id: 'site',
      label: 'Set your site',
      why: 'Tonight, seasons and moon windows are worked out from where your scopes stand.',
      done: set(s.latitude) && set(s.longitude) && Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)),
      link: settingsLink('location'),
      linkLabel: 'Open Your site'
    },
    {
      id: 'folder',
      label: 'Choose your home folder',
      why: 'The folder that holds your raw, stacked and finished data.',
      done: set(s.homeFolder),
      link: settingsLink('folders'),
      linkLabel: 'Open Folders'
    },
    {
      id: 'scan',
      label: 'Scan your library',
      why: 'Finds your targets and what is hiding in your files.',
      done: set(s.lastLibraryScan),
      link: '/library',
      linkLabel: 'Open Library'
    },
    {
      id: 'siril',
      label: 'Find Siril',
      why: 'Stacking plans and queued runs need siril-cli.',
      // Unknown is not shown as a job left to do.
      done: s.sirilFound !== false,
      link: settingsLink('tools'),
      linkLabel: 'Open Tools'
    }
  ]
}

/** The checklist is shown while any step is left, unless the user has hidden it. */
export function showSetup(steps: SetupStep[], hidden: boolean): boolean {
  return !hidden && steps.some(s => !s.done)
}

/** The setting that hides the checklist. */
export const SETUP_HIDDEN_KEY = 'setup_checklist_hidden'
