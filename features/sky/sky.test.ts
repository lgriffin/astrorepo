import { runFeature } from '@astro/testkit/bdd'
import { skySteps } from './sky.steps'

runFeature(new URL('./plate-solving-and-mosaics.feature', import.meta.url), skySteps)
