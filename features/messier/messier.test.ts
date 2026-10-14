import { runFeature } from '@astro/testkit/bdd'
import { messierSteps } from './messier.steps'

runFeature(new URL('./messier-mosaic.feature', import.meta.url), messierSteps)
