import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays, ChartLine, Crosshair, FileSearch, Frame, HardDrive, House, Images, LayoutGrid, LibraryBig,
  ListChecks, MoonStar, Settings, SquareStack, Telescope, Wifi, Wrench, Layers
} from 'lucide-react'

/**
 * The drawn icon for each place in the navigation map (LF-008), one stroke weight throughout, in
 * place of the text glyphs the map carries for places this table does not know yet.
 */
export const NAV_ICONS: Record<string, LucideIcon> = {
  home: House,
  targets: Crosshair,
  sky: MoonStar,
  jobs: ListChecks,
  library: LibraryBig,
  fits: FileSearch,
  images: Images,
  calibration: Layers,
  vespera: Wifi,
  nights: CalendarDays,
  stacks: SquareStack,
  insights: ChartLine,
  storage: HardDrive,
  collections: LayoutGrid,
  messier: Frame,
  posters: Telescope,
  equipment: Wrench,
  settings: Settings
}
