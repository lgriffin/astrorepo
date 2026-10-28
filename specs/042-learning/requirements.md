# 042 Learning while you observe: requirements

Leigh asked (28 October 2026): "I'm super interested in astrophysics, can we make the app more
educational and integrate learning opportunities as the user is using it". The app teaches inside
the places already used (a target's page, Tonight, the FITS headers, stacking, mosaics, the
gallery), not in a separate course, and where it can the explanation is worked out from the user's
own numbers. Every fact names a source, so nothing is invented (PRODUCT.md).

The whole plan (slices L1 to L7) is in the plan document linked from `docs/roadmap.md`. Only the
slice being built has requirements here (charter III).

## L1: foundation

- A knowledge base in `packages/domain/src/learning.ts`: concepts (a one-line answer, a
  paragraph, a formula where there is one, related concepts, sources) and a primer for every kind of
  object a target can be (what it is, what makes its light, where it comes from, what to look for,
  how its physics shapes the imaging, and a warning where one is needed). It reaches the renderer
  over `learning:library`; a source opens by id over `learning:open-source`.
- One shared **Why?** control (`components/ui/Explain.tsx`) and a **The physics** card on every
  target's Overview, with the target's magnitude and size told in words.
- **Settings → Learning**: off, short (the default) or deep.

| ID | Pattern | Requirement |
|----|---------|-------------|
| LRN-001 | Event | When the user opens a Why? beside a value, the system shall show the concept behind it at the user's learning level, with its related concepts to open in place and the sources it rests on, and shall close it on Escape, on Close or on a click outside, giving focus back to the Why?. |
| LRN-002 | Ubiquitous | The system shall name at least one source for every concept and object primer, link only to concepts and sources the knowledge base holds, and keep each concept's one-line answer within 160 characters. |
| LRN-003 | Ubiquitous | The system shall show on every target's Overview a primer for its kind of object, saying what it is, what makes its light, where it comes from, what to look for and how its physics shapes the imaging, and shall show the not yet known primer for a kind it does not know. |
| LRN-004 | Event | When the user chooses a learning level of off, short or deep in Settings → Learning, the system shall save it and apply it at once, short being the level until one is chosen. |
| LRN-005 | Unwanted | If the page asks to open a source that the knowledge base does not hold, then the system shall open nothing, since a source's address never comes from the page. |
| LRN-006 | Ubiquitous | The system shall tell a target's angular size against the width of the full Moon. |
| LRN-007 | Ubiquitous | The system shall show an object's safety warning, such as never pointing at the Sun without a certified solar filter, at every learning level including off. |
