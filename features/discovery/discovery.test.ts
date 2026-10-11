import { runFeature } from '@astro/testkit/bdd'
import { discoverySteps } from './discovery.steps'

runFeature(new URL('./ready-to-stack.feature', import.meta.url), discoverySteps)
