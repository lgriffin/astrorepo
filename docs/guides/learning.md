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

## In numbers

For each Messier object the card adds how far away it is, how long its light has been travelling
and when that light set out ("before our species, Homo sapiens, appeared"), and how wide it really
is, worked out from its size on the sky and its distance. Distances are the published ranges from
Wikipedia's Messier object table; the card leads with the middle and shows the range.

## Reading your FITS headers

A file's page (open one from Files or a target's files) has a **Your setup** card: the image scale,
how much sky each pixel sees, from the header's focal length (FOCALLEN) and pixel size (XPIXSZ),
the field the whole frame covers, and whether that suits typical 2″ seeing (two to three pixels
across a star's blur is well matched). A plate-solved file also shows the scale the solve measured,
a check on the header's numbers. XPIXSZ is read as including any binning, as most capture software
writes it.

**Show raw headers** adds a **What it means** column: each keyword the dictionary knows, with why
it matters at the deep level and a **Why?** where an idea lies behind it. Keywords the FITS
standard does not define are marked as capture-software conventions. The dictionary is
`packages/domain/src/learning-fits.ts`.

## Why tonight looks like this

Under **Tonight** on Home, a line says how far the Sun sinks below your horizon tonight, worked out
from your site's latitude and the date: past 18° the night is fully dark; short of it the sky stays
in twilight, as it does around midsummer in Ireland. It also says when that changes ("Fully dark
nights return around 30 Jul"). The figure is good to about a degree. **Why?** sits beside the
dark window, the Moon, a bright-moon note and the best targets, and on the Sky planner beside the
twilight times and the seasons table.

## Stacking and your filters

On a target's **Stack and process** tab, **What your filters catch** sits under the forecast: what
each filter in your frames lets through, and for narrowband and dual-band filters which emission
lines, at what wavelength, from which atoms (Hα at 656.3 nm from hydrogen, O III at 500.7 nm from
doubly ionised oxygen). **Why?** on the forecast explains why each extra hour buys less (signal to
noise grows as √N), and on the Stack card why stacking works and what bias, darks and flats do.
Filters are recognised by the names in your frames' FILTER keyword; a name it does not know is left
out.

## Why?

A **Why?** beside a number or a word opens the idea behind it: a one-line answer, and at the deep
level a paragraph and the formula. **Next** opens a related idea in place; the sources at the foot
open in your browser. Escape, Close or a click outside closes it.

## How much it explains

**Settings → Learning**: off, short or deep (the default). Off hides every explanation but keeps
safety warnings.

## Where the facts come from

The knowledge base is `packages/domain/src/learning.ts`. Every concept and primer names its
sources, and a test fails on a fact with none or on a link to a concept or source that does not
exist. To add a concept, add it to `CONCEPTS` with at least one entry from `LEARNING_SOURCES`; to
correct a fact, change it there and cite the page that supports it.
