import { runFeature } from '@astro/testkit/bdd'
import { captureSteps } from './captures.steps'
import { coverageSteps } from './coverage.steps'
import { mosaicSteps } from './mosaics.steps'

runFeature(new URL('./mosaic-workspace.feature', import.meta.url), mosaicSteps)
runFeature(new URL('./mosaic-captures.feature', import.meta.url), captureSteps)
runFeature(new URL('./mosaic-coverage.feature', import.meta.url), coverageSteps)
