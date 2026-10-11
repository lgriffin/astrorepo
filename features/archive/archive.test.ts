import { runFeature } from '@astro/testkit/bdd'
import { archiveSteps } from './archive.steps'

runFeature(new URL('./archive.feature', import.meta.url), archiveSteps)
