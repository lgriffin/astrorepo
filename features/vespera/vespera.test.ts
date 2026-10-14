import { runFeature } from '@astro/testkit/bdd'
import { vesperaSteps } from './vespera.steps'

runFeature(new URL('./copy-from-vespera.feature', import.meta.url), vesperaSteps)
