/** Sky planning, equipment sums and the timeline. */

// Sky Planning types

export interface AltitudePoint {
  time: string
  altitude: number
  azimuth: number
}

export interface BestTargetTonight {
  targetId: string
  targetName: string
  objectType: string
  maxAltitude: number
  transitTime: string | null
  hoursAbove30: number
}

export interface MoonInfo {
  phase: number
  illumination: number
  phaseName: string
}

export interface TwilightTimes {
  sunset: string | null
  sunrise: string | null
  civilDusk: string | null
  civilDawn: string | null
  nauticalDusk: string | null
  nauticalDawn: string | null
  astronomicalDusk: string | null
  astronomicalDawn: string | null
}

export interface MonthlyVisibility {
  month: string
  maxAltitude: number
  isVisible: boolean
}

// Equipment calculation types

export interface FOVResult {
  widthArcmin: number
  heightArcmin: number
  widthDeg: number
  heightDeg: number
  effectiveFocalLength: number
  focalRatio: number | null
}

export interface ImageScaleResult {
  arcsecondsPerPixel: number
  effectiveFocalLength: number
}

// Timeline/Calendar types

export interface CalendarDay {
  date: string
  totalExposureSec: number
  fileCount: number
  targets: string[]
  filters: string[]
  sessionIds: string[]
}

export interface CalendarMonth {
  month: string
  days: CalendarDay[]
  totalExposureSec: number
  activeDays: number
}

export interface YearSummaryMonth {
  month: string
  activeDays: number
  totalExposureSec: number
}

export interface Recommendation {
  id: string
  category: 'calibration' | 'integration' | 'equipment' | 'quality' | 'workflow' | 'stacking' | 'capture'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  targetId: string | null
  targetName: string | null
  actionLabel: string | null
  /** Where the action goes, when not the target's page. */
  actionTo?: string
  /** Core suggestions can be set aside until the target's data changes. */
  dismissible?: boolean
  /** A job already doing what the suggestion asks, in words, so Home never asks twice. */
  queued?: string
}
