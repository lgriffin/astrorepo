import { runFeature } from '@astro/testkit/bdd'
import { experimentSteps } from './experiments.steps'

runFeature(new URL('./experiment-lab.feature', import.meta.url), experimentSteps)
