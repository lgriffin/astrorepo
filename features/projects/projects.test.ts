import { runFeature } from '@astro/testkit/bdd'
import { projectSteps } from './projects.steps'

runFeature(new URL('./astronomy-projects.feature', import.meta.url), projectSteps)
