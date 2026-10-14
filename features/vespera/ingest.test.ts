import { runFeature } from '@astro/testkit/bdd'
import { vesperaSteps } from './ingest.steps'

runFeature(new URL('./ingest.feature', import.meta.url), vesperaSteps)
