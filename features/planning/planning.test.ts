import { runFeature } from '@astro/testkit/bdd'
import { planningSteps } from './planning.steps'

runFeature(new URL('./tonight-and-the-moon.feature', import.meta.url), planningSteps)
