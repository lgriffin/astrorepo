import { runFeature } from '@astro/testkit/bdd'
import { weatherSteps } from './weather.steps'

runFeature(new URL('./clear-skies.feature', import.meta.url), weatherSteps)
