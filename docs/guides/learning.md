# Learning while you observe

AstroRepo explains the astrophysics behind what it shows, in the place you meet it (spec
[042](../../specs/042-learning/requirements.md)).

## The physics of each target

A target's **Overview** has a **The physics** card for its kind of object: what it is, what makes
the light you capture, where it comes from and how long it lasts, what to look for in your picture,
and how that physics shapes the way to image it (why narrowband filters suit an emission nebula
but remove a reflection nebula, why a globular cluster wants short subs). Its magnitude and size are
told in words, such as "about 6 full Moons across". The Sun's card always carries its safety
warning.

## Why?

A **Why?** beside a number or a word opens the idea behind it: a one-line answer, and at the deep
level a paragraph and the formula. **Next** opens a related idea in place; the sources at the foot
open in your browser. Escape, Close or a click outside closes it.

## How much it explains

**Settings → Learning**: off, short (the default) or deep. Off hides every explanation but keeps
safety warnings.

## Where the facts come from

The knowledge base is `packages/domain/src/learning.ts`. Every concept and primer names its
sources, and a test fails on a fact with none or on a link to a concept or source that does not
exist. To add a concept, add it to `CONCEPTS` with at least one entry from `LEARNING_SOURCES`; to
correct a fact, change it there and cite the page that supports it.
