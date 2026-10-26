import { runFeature } from '@astro/testkit/bdd'
import { forecastSteps } from './forecasts.steps'

runFeature(new URL('./integration-forecasts.feature', import.meta.url), forecastSteps)
