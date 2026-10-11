import { runFeature } from '@astro/testkit/bdd'
import { sirilSteps } from './siril.steps'

runFeature(new URL('./stacking-plan.feature', import.meta.url), sirilSteps)
