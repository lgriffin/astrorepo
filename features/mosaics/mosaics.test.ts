import { runFeature } from '@astro/testkit/bdd'
import { mosaicSteps } from './mosaics.steps'

runFeature(new URL('./mosaic-workspace.feature', import.meta.url), mosaicSteps)
