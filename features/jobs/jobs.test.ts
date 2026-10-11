import { runFeature } from '@astro/testkit/bdd'
import { jobSteps } from './jobs.steps'

runFeature(new URL('./run-window.feature', import.meta.url), jobSteps)
