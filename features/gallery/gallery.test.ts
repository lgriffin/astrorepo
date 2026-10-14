import { runFeature } from '@astro/testkit/bdd'
import { gallerySteps } from './gallery.steps'

runFeature(new URL('./gallery.feature', import.meta.url), gallerySteps)
