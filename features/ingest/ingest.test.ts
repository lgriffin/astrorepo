import { runFeature } from '@astro/testkit/bdd'
import { ingestSteps } from './ingest.steps'

runFeature(new URL('./duplicates-and-sources.feature', import.meta.url), ingestSteps)
runFeature(new URL('./prep-for-siril.feature', import.meta.url), ingestSteps)
