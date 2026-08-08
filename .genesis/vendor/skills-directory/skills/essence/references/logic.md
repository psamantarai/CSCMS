# /essence - the logic behind it

This file explains WHY the procedure works. It deliberately does not name the
academic machinery involved. You do not need the names. You need the logic.

## The one idea

> A column only earns its place if it tells you something the others do not.

Ten columns can carry less information than two. If most of your columns are noisy
copies of the same few underlying signals, you have not measured ten things. You
have measured two things, several times, with slightly different noise on each
copy. Counting them as ten independent facts is double-counting dressed up as data.

## Why redundant columns carry no new information

Imagine you record a person's height in centimeters, in inches, in meters, and
also "height plus a tiny measurement wobble" three more times. That is six columns.
But knowing any one of them tells you almost everything about the other five. The
six columns trace a single line through space: move along that line and all six
change together; there is no other way for them to move. The extra columns add
width to your table but no new directions for the data to vary in. Information
lives in the directions data can move, not in the count of labels.

## Why the directions of largest spread are where the differences live

If two rows differ, they differ ALONG some direction. The directions where rows are
most spread out are, by definition, the directions that separate rows the most.
A direction with almost no spread means every row has nearly the same value there.
A column where everyone scores the same cannot distinguish anyone. So to find what
actually makes rows different, you hunt for the directions of biggest spread and
ignore the flat ones. Spread is just another word for "this is where the differences
are."

## Why you peel them off one at a time

The single direction of largest spread usually soaks up a big chunk of the variation
on its own. But once you have it, you do not want the second direction to just be a
slight tilt of the first; that would re-tell you what you already know. So you remove
everything the first direction explains, and only then look for the largest spread in
what is left over. Forced to be different from the first, the second direction captures
genuinely new variation. Repeat, and each direction you add is the most informative one
that is not already covered. You are peeling the table like an onion, biggest layer
first.

## Why a handful usually explains almost everything

Real data is built from a few causes with a lot of noise on top. A product's reviews
are mostly "is it good" and "is it expensive," restated across twenty phrased-differently
questions. A sensor array mostly measures "temperature" and "vibration," echoed across
ten slightly-redundant probes. Because the world generating the data has few real knobs,
the spread concentrates into a few directions and the rest is just measurement wobble.
That is why the running total of variation shoots up fast and then flattens: the first
few directions are signal, the long tail is noise. When the curve flattens, you have
found everything worth keeping.

## Why centering and scaling come first

If you do not subtract each column's average, the "largest spread" calculation gets
fooled by columns that sit at big numbers rather than columns that actually vary.
A column of values around 1,000,000 looks enormous next to one around 0.5, even if the
million-column never changes and the half-column swings wildly. Centering removes the
position so only the variation counts; putting columns on a common scale stops a
big-unit column from impersonating the main signal. Get this wrong and you will keep
the loudest column instead of the most informative one.

## Why importance is not the same as spread

This is the one trap. Largest-spread finds where rows differ most, which is usually
what matters, but not always. A fraud flag, a rare defect, a single life-saving outlier
can have tiny spread (almost everything is "normal") and yet be the entire point of the
analysis. Spread tells you where the variation is, not what you value. So before you
throw a quiet direction away, ask whether it happens to hold the thing you actually
care about. Keep the cheap, dominant axes by default, but never on autopilot.

## The mental model in one line

    Most columns are echoes. Keep the few directions the data really moves along, drop the repeats.
