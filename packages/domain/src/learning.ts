/**
 * Learning while you observe (specs/042-learning): the astrophysics behind what the app shows.
 * A small, sourced knowledge base of concepts (what a light year is, why a reflection nebula is
 * blue) and a primer for every kind of object a target can be, with the rules that look them up
 * and check that every fact names where it comes from (LRN-002). Pure data and rules; the renderer
 * only shows them.
 */

/** Where a fact comes from: a page a reader can open to check it. */
export interface LearningSource {
  id: string
  title: string
  publisher: string
  url: string
}

/** One idea, told in a line, then a paragraph, then (for the curious) the formula behind it. */
export interface Concept {
  id: string
  title: string
  /** One sentence, the answer to "why?". */
  short: string
  /** A paragraph for the reader who wants more. */
  detail: string
  /** The relation behind it in plain notation, when there is one. */
  formula: string | null
  /** Concepts a reader may want next. */
  related: string[]
  sources: string[]
}

/** What a kind of object is, why it shines, how long it lasts, and how to photograph it. */
export interface ObjectPrimer {
  kind: string
  title: string
  /** What it is, in one or two sentences. */
  summary: string
  /** What makes the light you capture. */
  shines: string
  /** Where it comes from and how long it lasts. */
  life: string
  /** What to look for in your picture. */
  inPicture: string
  /** How its physics shapes the way to image it. */
  imaging: string
  /** A warning that must always show, such as solar safety. */
  caution: string | null
  concepts: string[]
  sources: string[]
}

/** Every kind a target can be (the shared ObjectType), so each has a primer (LRN-003). */
export const OBJECT_KINDS = [
  'galaxy', 'emission_nebula', 'reflection_nebula', 'planetary_nebula', 'dark_nebula', 'open_cluster',
  'globular_cluster', 'star_cluster', 'supernova_remnant', 'molecular_cloud', 'galaxy_cluster', 'star',
  'comet', 'asteroid', 'planet', 'moon', 'solar_object', 'variable_star', 'widefield_region',
  'constellation', 'custom', 'unknown'
] as const

/**
 * Finer kinds the shipped catalogues store beside the shared ones (NGC and IC spiral, elliptical and
 * irregular galaxies, and plain nebulae), each with a primer of its own (LRN-003).
 */
export const CATALOGUE_KINDS = ['spiral_galaxy', 'elliptical_galaxy', 'irregular_galaxy', 'nebula'] as const

export type ObjectKind = (typeof OBJECT_KINDS)[number] | (typeof CATALOGUE_KINDS)[number]

/** The warning that must show beside the Sun at every learning level (LRN-007); the renderer holds the same words. */
export const SOLAR_CAUTION =
  'Never point a telescope, camera or finder at the Sun without a certified solar filter over the front. It can blind you instantly and destroy a camera.'

const wiki = (id: string, article: string, title = article.replace(/_/g, ' ')): LearningSource => ({
  id,
  title,
  publisher: 'Wikipedia',
  url: `https://en.wikipedia.org/wiki/${article}`
})

export const LEARNING_SOURCES: readonly LearningSource[] = [
  wiki('wiki-galaxy', 'Galaxy'),
  wiki('wiki-messier-object', 'Messier_object'),
  wiki('wiki-kpg-extinction', 'Cretaceous%E2%80%93Paleogene_extinction_event', 'Cretaceous–Paleogene extinction event'),
  wiki('wiki-oldowan', 'Oldowan'),
  wiki('wiki-homo-sapiens', 'Homo_sapiens', 'Homo sapiens'),
  wiki('wiki-neolithic-revolution', 'Neolithic_Revolution'),
  wiki('wiki-history-of-writing', 'History_of_writing'),
  wiki('wiki-spiral-galaxy', 'Spiral_galaxy'),
  wiki('wiki-density-wave', 'Density_wave_theory'),
  wiki('wiki-elliptical-galaxy', 'Elliptical_galaxy'),
  wiki('wiki-irregular-galaxy', 'Irregular_galaxy'),
  wiki('wiki-nebula', 'Nebula'),
  wiki('wiki-milky-way', 'Milky_Way', 'Milky Way'),
  wiki('wiki-emission-nebula', 'Emission_nebula'),
  wiki('wiki-h-ii-region', 'H_II_region', 'H II region'),
  wiki('wiki-reflection-nebula', 'Reflection_nebula'),
  wiki('wiki-planetary-nebula', 'Planetary_nebula'),
  wiki('wiki-dark-nebula', 'Dark_nebula'),
  wiki('wiki-open-cluster', 'Open_cluster'),
  wiki('wiki-globular-cluster', 'Globular_cluster'),
  wiki('wiki-star-cluster', 'Star_cluster'),
  wiki('wiki-supernova-remnant', 'Supernova_remnant'),
  wiki('wiki-crab-nebula', 'Crab_Nebula'),
  wiki('wiki-molecular-cloud', 'Molecular_cloud'),
  wiki('wiki-galaxy-cluster', 'Galaxy_cluster'),
  wiki('wiki-star', 'Star'),
  wiki('wiki-stellar-evolution', 'Stellar_evolution'),
  wiki('wiki-nucleosynthesis', 'Stellar_nucleosynthesis', 'Stellar nucleosynthesis'),
  wiki('wiki-variable-star', 'Variable_star'),
  wiki('wiki-cepheid', 'Cepheid_variable', 'Cepheid variable'),
  wiki('wiki-comet', 'Comet'),
  wiki('wiki-asteroid', 'Asteroid'),
  wiki('wiki-planet', 'Planet'),
  wiki('wiki-moon', 'Moon'),
  wiki('wiki-sun', 'Sun'),
  wiki('wiki-solar-observation', 'Solar_observation', 'Solar observation'),
  wiki('wiki-constellation', 'Constellation'),
  wiki('wiki-light-year', 'Light-year'),
  wiki('wiki-apparent-magnitude', 'Apparent_magnitude'),
  wiki('wiki-surface-brightness', 'Surface_brightness'),
  wiki('wiki-angular-diameter', 'Angular_diameter'),
  wiki('wiki-h-alpha', 'H-alpha'),
  wiki('wiki-oiii', 'Doubly_ionized_oxygen', 'Doubly ionized oxygen'),
  wiki('wiki-rayleigh', 'Rayleigh_scattering'),
  wiki('wiki-extinction', 'Extinction_(astronomy)', 'Extinction (astronomy)'),
  wiki('wiki-color-index', 'Color_index'),
  wiki('wiki-wien', 'Wien%27s_displacement_law', "Wien's displacement law"),
  wiki('wiki-seeing', 'Astronomical_seeing'),
  wiki('wiki-lucky-imaging', 'Lucky_imaging'),
  wiki('wiki-fits', 'FITS'),
  wiki('wiki-bayer-filter', 'Bayer_filter'),
  wiki('wiki-demosaicing', 'Demosaicing'),
  wiki('wiki-plate-scale', 'Plate_scale'),
  wiki('wiki-nyquist', 'Nyquist%E2%80%93Shannon_sampling_theorem', 'Nyquist–Shannon sampling theorem'),
  wiki('wiki-gnomonic', 'Gnomonic_projection'),
  wiki('wiki-shot-noise', 'Shot_noise'),
  wiki('wiki-snr-imaging', 'Signal-to-noise_ratio_(imaging)', 'Signal-to-noise ratio (imaging)'),
  wiki('wiki-dark-current', 'Dark_current_(physics)', 'Dark current (physics)'),
  wiki('wiki-dark-frame', 'Dark-frame_subtraction', 'Dark-frame subtraction'),
  wiki('wiki-air-mass', 'Air_mass_(astronomy)', 'Air mass (astronomy)'),
  wiki('wiki-twilight', 'Twilight'),
  wiki('wiki-season', 'Season'),
  wiki('wiki-axial-tilt', 'Axial_tilt'),
  wiki('wiki-position-of-the-sun', 'Position_of_the_Sun'),
  wiki('wiki-midnight-sun', 'Midnight_sun'),
  wiki('wiki-lunar-phase', 'Lunar_phase'),
  wiki('wiki-sky-brightness', 'Sky_brightness'),
  wiki('wiki-balmer', 'Balmer_series'),
  wiki('wiki-forbidden', 'Forbidden_mechanism'),
  wiki('wiki-false-color', 'False_color'),
  wiki('wiki-signal-averaging', 'Signal_averaging'),
  wiki('wiki-shift-and-add', 'Shift-and-add'),
  wiki('wiki-flat-field', 'Flat-field_correction'),
  wiki('wiki-celestial-sphere', 'Celestial_sphere'),
  wiki('wiki-equatorial-coordinates', 'Equatorial_coordinate_system'),
  wiki('wiki-icrs', 'International_Celestial_Reference_System'),
  wiki('wiki-gnomonic-projection', 'Gnomonic_projection'),
  wiki('wiki-position-angle', 'Position_angle'),
  wiki('wiki-charles-messier', 'Charles_Messier'),
  {
    id: 'fits-standard',
    title: 'The FITS standard',
    publisher: 'NASA FITS Support Office',
    url: 'https://fits.gsfc.nasa.gov/fits_standard.html'
  },
  {
    id: 'iau-constellations',
    title: 'The constellations',
    publisher: 'International Astronomical Union',
    url: 'https://www.iau.org/public/themes/constellations/'
  }
]

export const CONCEPTS: readonly Concept[] = [
  {
    id: 'light-year',
    title: 'Light year',
    short: 'A light year is a distance: how far light travels in one year, about 9.46 trillion kilometres.',
    detail:
      'Light crosses space at 299,792 km every second. Even so, the nearest star beyond the Sun is over four light years away and the Andromeda Galaxy about 2.5 million. Astronomers also use the parsec, about 3.26 light years.',
    formula: '1 light year = 299,792.458 km/s × 31,557,600 s ≈ 9.4607 × 10¹² km',
    related: ['lookback', 'angular-size'],
    sources: ['wiki-light-year']
  },
  {
    id: 'lookback',
    title: 'Looking back in time',
    short: 'Light takes time to reach you, so you see every object as it was when its light set out.',
    detail:
      'The light in a picture of an object a million light years away left it a million years ago. The farther you look, the older the light. A galaxy picture is a record of the past, and the object may have changed since.',
    formula: 'travel time = distance ÷ speed of light (in years, the distance in light years)',
    related: ['light-year'],
    sources: ['wiki-light-year']
  },
  {
    id: 'apparent-magnitude',
    title: 'Magnitude',
    short: 'Magnitude is brightness on a backwards, logarithmic scale: bigger numbers are fainter.',
    detail:
      'Five magnitudes are a factor of exactly 100 in brightness, so one magnitude is about 2.512 times. Vega is near 0, the faintest stars the eye sees under a dark sky about 6, the full Moon about −12.7 and the Sun about −26.7. A catalogue magnitude for a nebula or galaxy is all its light added up as if it were one point.',
    formula: 'm₁ − m₂ = −2.5 × log₁₀(F₁ ÷ F₂)',
    related: ['surface-brightness'],
    sources: ['wiki-apparent-magnitude']
  },
  {
    id: 'surface-brightness',
    title: 'Surface brightness',
    short: 'A large object spreads its light over a wide area, so it can be far fainter per pixel than its magnitude suggests.',
    detail:
      'Two galaxies with the same magnitude look very different if one is ten times wider: its light is spread over a hundred times the area. Surface brightness, light per square arcsecond, is what decides how hard an extended object is to image and how dark your sky must be.',
    formula: 'surface brightness ≈ m + 2.5 × log₁₀(area in square arcseconds)',
    related: ['apparent-magnitude', 'angular-size'],
    sources: ['wiki-surface-brightness']
  },
  {
    id: 'angular-size',
    title: 'Angular size',
    short: 'How big an object looks is an angle on the sky, not a size: the full Moon spans about half a degree.',
    detail:
      'Sizes on the sky are given in degrees, arcminutes (1/60 of a degree) and arcseconds (1/60 of an arcminute). An object’s true size follows from its angular size and its distance, which is why a nearby small nebula and a distant huge galaxy can look the same size in your frame.',
    formula: 'true size ≈ distance × angle in radians (1 arcminute ≈ 1/3438 radian)',
    related: ['light-year', 'surface-brightness'],
    sources: ['wiki-angular-diameter']
  },
  {
    id: 'emission-lines',
    title: 'Emission lines',
    short: 'Gas lit by ultraviolet starlight glows at a few exact colours, one for each change an atom’s electron makes.',
    detail:
      'Hot young stars give off ultraviolet light that strips electrons from hydrogen and oxygen atoms. When an electron is caught again it drops down through fixed energy levels, giving off light at exact wavelengths. That is why nebulae glow in a few narrow colours, and why narrowband filters can pass that light and block most of the rest.',
    formula: 'wavelength = Planck constant × speed of light ÷ energy step',
    related: ['h-alpha', 'oiii'],
    sources: ['wiki-emission-nebula', 'wiki-h-ii-region']
  },
  {
    id: 'h-alpha',
    title: 'Hydrogen alpha',
    short: 'Hydrogen alpha is the deep red light, at 656.3 nm, that hydrogen gives off when its electron drops from the third level to the second.',
    detail:
      'Hydrogen is most of the gas in the universe, so H-alpha is the brightest light of most emission nebulae and the pink knots in spiral galaxies. It sits so far into the red that the eye barely sees it, while a camera records it well.',
    formula: 'λ = 656.28 nm (Balmer series, n = 3 → 2)',
    related: ['emission-lines', 'oiii'],
    sources: ['wiki-h-alpha']
  },
  {
    id: 'oiii',
    title: 'Oxygen III',
    short: 'O III is oxygen missing two electrons; it glows teal at 495.9 and 500.7 nm where gas is hot and very thin.',
    detail:
      'These are “forbidden” lines: in a laboratory the atoms would lose their energy in collisions first. Only in gas as thin as a nebula’s do they glow, so O III marks the hottest, most strongly lit parts of planetary nebulae, supernova remnants and star-forming regions.',
    formula: 'λ = 495.9 nm and 500.7 nm',
    related: ['emission-lines', 'h-alpha'],
    sources: ['wiki-oiii']
  },
  {
    id: 'scattering',
    title: 'Why dust looks blue',
    short: 'Small dust grains scatter blue light more strongly than red, so dust lit by nearby stars looks blue.',
    detail:
      'Similar physics makes the daytime sky blue. A reflection nebula is starlight bounced towards you by dust; the blue part of that light is scattered most, while red passes on. Because it is reflected starlight, its colours are a whole spectrum, not a few lines.',
    formula: null,
    related: ['dust-extinction'],
    sources: ['wiki-reflection-nebula', 'wiki-rayleigh']
  },
  {
    id: 'dust-extinction',
    title: 'Dust dims and reddens',
    short: 'Dust between you and a star absorbs and scatters its light, so the star looks fainter and redder.',
    detail:
      'Thick clouds of dust block the light behind them altogether, which is how dark nebulae show as holes in the Milky Way. Thinner dust removes more blue than red, so stars behind it look redder than they are.',
    formula: null,
    related: ['scattering'],
    sources: ['wiki-extinction', 'wiki-dark-nebula']
  },
  {
    id: 'star-colour',
    title: 'A star’s colour is its temperature',
    short: 'Blue-white stars are hot and orange-red ones cool; colour is a thermometer for stars.',
    detail:
      'A hot body gives off most of its light at a wavelength that shortens as it gets hotter. The Sun’s surface is about 5,800 K and looks white to yellow; stars over 10,000 K look blue-white and those under 3,500 K orange-red. Keeping star colour in processing keeps that information.',
    formula: 'peak wavelength ≈ 2.898 × 10⁻³ m·K ÷ temperature',
    related: ['stellar-evolution'],
    sources: ['wiki-wien', 'wiki-color-index']
  },
  {
    id: 'stellar-evolution',
    title: 'How stars live and die',
    short: 'A star’s mass decides its life: massive stars burn out in millions of years, small ones last for many billions.',
    detail:
      'Stars shine by fusing hydrogen into helium in their cores. The Sun will do so for about 10 billion years in all, then swell into a red giant and shed its outer layers as a planetary nebula. Stars of more than about eight Suns live only millions of years and end as supernovae.',
    formula: null,
    related: ['nucleosynthesis', 'star-colour'],
    sources: ['wiki-stellar-evolution', 'wiki-star']
  },
  {
    id: 'nucleosynthesis',
    title: 'Elements made in stars',
    short: 'Nearly every element heavier than helium, including the carbon and oxygen in you, was made in stars.',
    detail:
      'Fusion in stars builds carbon, oxygen and the elements up to iron; supernovae and merging dead stars make many heavier ones. Dying stars return that material to space through planetary nebulae and supernova remnants, where it goes into new stars and planets.',
    formula: null,
    related: ['stellar-evolution'],
    sources: ['wiki-nucleosynthesis']
  },
  {
    id: 'seeing',
    title: 'Seeing',
    short: 'Seeing is how much the air’s turbulence blurs and shakes a star, measured as the width of its image in arcseconds.',
    detail:
      'Pockets of warmer and cooler air bend starlight a little differently from moment to moment, so a point of light becomes a dancing blur. Typical seeing at an amateur site is 1.5 to 3 arcseconds. Very short exposures can freeze moments of good seeing, which is how planets are imaged.',
    formula: null,
    related: ['sampling', 'solar-system-motion'],
    sources: ['wiki-seeing', 'wiki-lucky-imaging']
  },
  {
    id: 'solar-system-motion',
    title: 'Things that move against the stars',
    short: 'Planets, comets and asteroids are close enough to move against the background stars from hour to hour or night to night.',
    detail:
      'The stars are so far away that they keep their patterns for lifetimes, but objects in the solar system orbit the Sun in front of them. Stacking on the stars smears a comet; stacking on the comet smears the stars, so comet images are often stacked twice and combined.',
    formula: null,
    related: ['seeing'],
    sources: ['wiki-comet', 'wiki-asteroid']
  },
  {
    id: 'fits-header',
    title: 'The FITS header',
    short: 'A FITS file opens with a header of 80-character lines, each a keyword, a value and a comment, describing the picture that follows.',
    detail:
      'FITS was made by astronomers in 1981 so that data could move between observatories and still be read decades later. The standard defines a few keywords, such as the picture’s size and how its pixels are stored; capture software adds many more by convention, such as the exposure, filter and sensor temperature.',
    formula: null,
    related: ['wcs', 'image-scale'],
    sources: ['fits-standard', 'wiki-fits']
  },
  {
    id: 'bayer',
    title: 'The Bayer pattern',
    short: 'A colour camera covers its pixels with a grid of red, green and blue filters, so each pixel records only one colour.',
    detail:
      'The usual grid repeats a 2 × 2 block of one red, two green and one blue, because our eyes are most sensitive to green. Debayering works out the two missing colours at every pixel from its neighbours. A raw colour frame is therefore a single grey plane until it is debayered, and a hydrogen-alpha nebula falls only on the red quarter of the pixels.',
    formula: null,
    related: ['h-alpha'],
    sources: ['wiki-bayer-filter', 'wiki-demosaicing']
  },
  {
    id: 'image-scale',
    title: 'Image scale',
    short: 'Image scale is how much sky one pixel sees, in arcseconds: 206.265 × the pixel size in µm ÷ the focal length in mm.',
    detail:
      'A radian holds 206,265 arcseconds, and a pixel of size p at the focus of a lens of focal length f sees an angle of p ÷ f radians. Multiply the scale by the picture’s width and height in pixels and you have its field of view. A plate solve measures the scale directly, which is a good check on the numbers in the header.',
    formula: 'scale (″ per pixel) = 206.265 × pixel size (µm) ÷ focal length (mm)',
    related: ['sampling', 'angular-size'],
    sources: ['wiki-plate-scale']
  },
  {
    id: 'sampling',
    title: 'Sampling',
    short: 'Sampling compares the image scale with the seeing: two to three pixels across a star’s blur records all the detail the air lets through.',
    detail:
      'With fewer than two pixels across the blur, stars turn square and fine detail is lost: under-sampled. With more than three, the same light is spread over more pixels, each with its own noise, for no extra detail: over-sampled. The rule comes from the sampling theorem, which says a signal needs at least two samples across its finest detail.',
    formula: 'matched when seeing ÷ 3 ≤ scale ≤ seeing ÷ 2',
    related: ['image-scale', 'seeing'],
    sources: ['wiki-nyquist', 'wiki-seeing']
  },
  {
    id: 'wcs',
    title: 'Sky coordinates in a picture',
    short: 'A plate-solved file carries a world coordinate system: keywords that turn any pixel into a right ascension and a declination.',
    detail:
      'The solver matches the stars in the frame against a catalogue, then records one reference pixel (CRPIX), where it lies on the sky (CRVAL), and how far and in which direction each pixel steps (CDELT and CROTA, or the CD matrix). A projection, usually the tangent-plane one, links the flat picture to the curved sky.',
    formula: null,
    related: ['image-scale'],
    sources: ['fits-standard', 'wiki-gnomonic']
  },
  {
    id: 'noise',
    title: 'Signal and noise',
    short: 'Signal grows in step with exposure time, while its random noise grows only as the square root, so the signal-to-noise ratio improves as √time.',
    detail:
      'Light arrives as separate photons, so even a steady source gives a count that varies at random: shot noise, the square root of the count. Four times the exposure gives four times the signal but only twice the noise. The camera adds read noise each time a frame is read out, which gain and offset settings trade against how bright a star can get before it saturates.',
    formula: 'SNR ∝ √(total exposure)',
    related: ['dark-current'],
    sources: ['wiki-shot-noise', 'wiki-snr-imaging']
  },
  {
    id: 'dark-current',
    title: 'Dark current',
    short: 'Heat alone frees electrons in a sensor, adding a signal and its noise even in complete darkness, and it rises steeply with temperature.',
    detail:
      'A dark frame is an exposure with the light blocked, at the same length, gain and temperature as the lights. Subtracting a stack of darks removes the dark signal and the hot pixels, but not its noise, which is why cooled cameras hold the sensor at a fixed low temperature.',
    formula: null,
    related: ['noise'],
    sources: ['wiki-dark-current', 'wiki-dark-frame']
  },
  {
    id: 'airmass',
    title: 'Airmass',
    short: 'Airmass is how much air starlight passes through compared with looking straight up: 1 overhead, about 2 at 30° above the horizon.',
    detail:
      'Away from the horizon it is close to 1 ÷ the sine of the altitude. More air means more light scattered away, especially blue, and more turbulence, so targets look dimmer, redder and softer low down. That is why the best time for a target is usually when it is highest.',
    formula: 'airmass ≈ 1 ÷ sin(altitude)',
    related: ['scattering', 'dust-extinction', 'seeing'],
    sources: ['wiki-air-mass']
  },
  {
    id: 'twilight',
    title: 'Twilight',
    short: 'After sunset the sky darkens in stages as the Sun sinks: civil twilight ends at 6° below the horizon, nautical at 12°, astronomical at 18°.',
    detail:
      'Even below the horizon the Sun lights the upper air, and that scattered light keeps the sky from being fully dark. Only once the Sun is 18° down is the sky as dark as it gets; faint galaxies and nebulae need that. Nautical darkness, 12° down, is dark enough for bright targets and narrowband imaging.',
    formula: null,
    related: ['seasons', 'scattering'],
    sources: ['wiki-twilight']
  },
  {
    id: 'seasons',
    title: 'Seasons and the night sky',
    short: 'Earth’s axis is tilted 23.4°, so through the year the Sun climbs higher or stays lower, changing how long and how dark your nights are.',
    detail:
      'In summer your hemisphere leans towards the Sun, which then stays close below the horizon at midnight; far enough north it never gets 18° down and the night is never fully dark. Through the year Earth also moves around its orbit, so the night side faces a different part of the sky: each target has a season, rising about four minutes earlier each night.',
    formula: 'Sun’s depth at midnight ≈ 90° − |latitude + declination|',
    related: ['twilight'],
    sources: ['wiki-season', 'wiki-axial-tilt', 'wiki-position-of-the-sun', 'wiki-midnight-sun']
  },
  {
    id: 'moon-phase',
    title: 'The Moon’s phases',
    short: 'The Moon is always half lit by the Sun; its phase is how much of that lit half faces us, going from new to full and back every 29.5 days.',
    detail:
      'At new moon the Moon sits near the Sun in our sky, so it is up by day and gone at night: the darkest nights of the month. At full moon it is opposite the Sun, rising at sunset and up all night. Around first quarter it sets near midnight, around last quarter it rises then, so half the night can still be dark.',
    formula: null,
    related: ['moonlight'],
    sources: ['wiki-lunar-phase']
  },
  {
    id: 'moonlight',
    title: 'Moonlight and the sky',
    short: 'Moonlight is sunlight reflected off the Moon, and the air scatters it across the whole sky, so a bright Moon washes out faint targets.',
    detail:
      'A full Moon brightens the sky background many times over, which buries faint galaxies and reflection nebulae. Emission nebulae shine in a few narrow lines, so a narrowband or dual-band filter that passes only those lines blocks most of the moonlit sky and still lets the target through. Keeping well away from the Moon helps too.',
    formula: null,
    related: ['moon-phase', 'scattering', 'emission-lines'],
    sources: ['wiki-sky-brightness', 'wiki-lunar-phase']
  },
  {
    id: 'sii',
    title: 'Sulphur II',
    short: 'S II is sulphur missing one electron; it glows deep red at 671.6 and 673.1 nm, just past hydrogen alpha.',
    detail:
      'Like O III it is a forbidden line: on Earth atoms bump into each other too often to give it off, but in a nebula’s thin gas they have time to. It is usually fainter than hydrogen alpha and strongest at the edges of nebulae and where shock waves pass, so an S II image often shows structure the others miss.',
    formula: null,
    related: ['emission-lines', 'hubble-palette'],
    sources: ['wiki-forbidden', 'wiki-emission-nebula']
  },
  {
    id: 'hubble-palette',
    title: 'The Hubble palette',
    short: 'Narrowband images are often shown with S II as red, hydrogen alpha as green and O III as blue, so the three gases show apart.',
    detail:
      'Hydrogen alpha and S II are both deep red, so in true colour they blur together. Mapping each line to its own channel is false colour: it does not show what the eye would see, but it shows where each element is. Made famous by the Hubble Space Telescope’s Pillars of Creation, it is also called SHO after the order of the channels.',
    formula: 'red = S II, green = Hα, blue = O III',
    related: ['sii', 'h-alpha', 'oiii'],
    sources: ['wiki-false-color']
  },
  {
    id: 'stacking',
    title: 'Why stacking works',
    short: 'Every frame holds the same signal but different random noise, so averaging N frames keeps the signal and shrinks the noise by √N.',
    detail:
      'Sixteen frames are four times cleaner than one; a hundred are ten times. Each doubling of total time buys only √2, about 41% more signal to noise, which is why each extra hour buys less than the last. Stacking also lets outlier rejection drop what is in only a few frames, such as satellite trails, cosmic-ray hits and aircraft.',
    formula: 'SNR of N frames = √N × SNR of one',
    related: ['noise', 'calibration'],
    sources: ['wiki-signal-averaging', 'wiki-shift-and-add']
  },
  {
    id: 'calibration',
    title: 'Calibration frames',
    short: 'Bias, dark and flat frames record what the camera and optics add, so it can be taken out of every light before stacking.',
    detail:
      'A bias is the shortest possible exposure: the camera’s fixed offset and pattern. A dark is a light-tight exposure as long and warm as the lights: the heat signal and hot pixels. A flat is an evenly lit frame: dust shadows and the darkening towards the corners (vignetting). Lights have the dark taken away and are divided by the flat.',
    formula: 'calibrated = (light − dark) ÷ normalised flat',
    related: ['dark-current', 'stacking'],
    sources: ['wiki-dark-frame', 'wiki-flat-field']
  },
  {
    id: 'celestial-sphere',
    title: 'RA and Dec',
    short: 'Picture the sky as a sphere around Earth: declination is latitude on it and right ascension is longitude, so each object has a fixed address.',
    detail:
      'Declination is measured in degrees north or south of the celestial equator, Earth’s equator projected onto the sky. Right ascension is measured eastwards along that equator from the point where the Sun crosses it in March, in hours: 24 hours make the full circle. The stars are so far away that their addresses barely change, while their altitude and direction change all night as Earth turns. The app gives positions in the ICRS, today’s standard frame, pinned to distant quasars.',
    formula: '1 h of RA = 15°; on the sky that is 15° × cos(Dec), shrinking towards the poles',
    related: ['tangent-plane', 'position-angle', 'seasons'],
    sources: ['wiki-celestial-sphere', 'wiki-equatorial-coordinates', 'wiki-icrs']
  },
  {
    id: 'tangent-plane',
    title: 'The tangent plane',
    short: 'A mosaic is laid out on a flat plane touching the sky at the grid’s centre, which is how a lens maps the sky onto a flat sensor.',
    detail:
      'Points on the sky are projected from the sphere’s centre onto a plane that touches it: the gnomonic projection. Straight lines on that plane are great circles on the sky, as with a lens, so each panel is a true rectangle. Lines of right ascension, by contrast, meet at the poles, so a grid stepped in RA would pinch near Polaris. Far from the centre the plane stretches, so an equal step there covers a little less sky.',
    formula: 'distance on the plane = tan(angle from the centre)',
    related: ['celestial-sphere', 'position-angle', 'image-scale'],
    sources: ['wiki-gnomonic-projection']
  },
  {
    id: 'position-angle',
    title: 'Position angle',
    short: 'Position angle is a direction on the sky, measured from north through east: 0° points north and 90° east.',
    detail:
      'Looking up at the sky you see the sphere from inside, so with north at the top, east is on the left, the mirror of a map. Here the angle sets which way each panel’s up edge points. Plate solvers report the same idea as the picture’s rotation, though programs differ in the sign and the starting edge they use.',
    formula: null,
    related: ['celestial-sphere', 'tangent-plane', 'wcs'],
    sources: ['wiki-position-angle']
  },
  {
    id: 'messier-catalogue',
    title: 'Messier’s catalogue',
    short: 'Charles Messier, a comet hunter in Paris, listed fuzzy objects that were not comets so they would not fool him; they became the best-known list in the sky.',
    detail:
      'Messier (1730–1817) published his final list in 1781 with 103 objects, some of them found by his colleague Pierre Méchain. M104 to M110 were added in the 20th century from their notes. Everything on it is visible from Paris, so it favours the northern sky, and it mixes every kind of object: a supernova remnant (M1), star clusters, nebulae and galaxies.',
    formula: null,
    related: ['lookback', 'angular-size'],
    sources: ['wiki-charles-messier', 'wiki-messier-object']
  }
]

const EMPTY_PRIMER = {
  shines: 'Once this target has a type, this card explains what makes its light.',
  life: 'Its type also says where it comes from and how long it lasts.',
  inPicture: 'Set its type when you edit the target to learn what to look for.',
  imaging: 'Imaging advice follows from the type too.'
}

export const PRIMERS: Readonly<Record<ObjectKind, ObjectPrimer>> = {
  galaxy: {
    kind: 'galaxy',
    title: 'Galaxy',
    summary: 'A galaxy is a vast system of stars, gas, dust and dark matter held together by gravity. Our own, the Milky Way, holds an estimated 100 to 400 billion stars.',
    shines: 'The combined light of billions of stars. Spiral arms look blue from young, hot stars; the core is yellower from older ones; pink knots are clouds of hydrogen lit by newborn stars.',
    life: 'Most galaxies are many billions of years old and grow by drawing in gas and merging with smaller galaxies.',
    inPicture: 'Dark dust lanes across the disc, pink star-forming regions along the arms, and small companion galaxies nearby.',
    imaging: 'Galaxies are faint and spread out, so they need dark skies and long integration. Broadband colour shows the stars; adding H-alpha brings out the star-forming regions.',
    caution: null,
    concepts: ['lookback', 'light-year', 'surface-brightness', 'h-alpha', 'dust-extinction'],
    sources: ['wiki-galaxy', 'wiki-milky-way']
  },
  spiral_galaxy: {
    kind: 'spiral_galaxy',
    title: 'Spiral galaxy',
    summary: 'A spiral galaxy is a flat, rotating disc of stars, gas and dust with arms winding out from a central bulge. The Milky Way and the Andromeda Galaxy are spirals.',
    shines: 'The arms are blue with young, hot stars and dotted with pink clouds of hydrogen lit by newborn stars; the bulge is yellower with older stars.',
    life: 'The arms are not fixed rings of stars: in the leading explanation they are waves where stars and gas crowd together as they orbit, setting off new star formation as gas passes through.',
    inPicture: 'Arms, dark dust lanes along them, pink star-forming knots, and in many a straight bar across the centre.',
    imaging: 'Long broadband integration under dark skies shows the arms; H-alpha added to red brings out the star-forming knots.',
    caution: null,
    concepts: ['lookback', 'h-alpha', 'star-colour', 'dust-extinction', 'surface-brightness'],
    sources: ['wiki-spiral-galaxy', 'wiki-density-wave']
  },
  elliptical_galaxy: {
    kind: 'elliptical_galaxy',
    title: 'Elliptical galaxy',
    summary: 'An elliptical galaxy is a smooth, rounded swarm of stars with little gas or dust and little new star formation. The largest galaxies known are giant ellipticals.',
    shines: 'Mostly old, yellow and red stars; with little gas left, few new stars form.',
    life: 'Many are thought to have grown through mergers of smaller galaxies, which used up or blew away their gas.',
    inPicture: 'A smooth glow, brightest at the centre and fading outwards; giant ones are ringed by swarms of globular clusters.',
    imaging: 'Smooth and featureless, so flats must be good to keep the faint outer glow even. The bright core needs care when stretching.',
    caution: null,
    concepts: ['lookback', 'star-colour', 'surface-brightness'],
    sources: ['wiki-elliptical-galaxy']
  },
  irregular_galaxy: {
    kind: 'irregular_galaxy',
    title: 'Irregular galaxy',
    summary: 'An irregular galaxy has no clear spiral or elliptical shape, often because the gravity of a neighbour has pulled it about. The Magellanic Clouds are irregular galaxies.',
    shines: 'Many are rich in gas and forming stars, so they are full of young blue stars and pink hydrogen clouds.',
    life: 'Encounters with other galaxies can stir up their gas and set off bursts of star formation.',
    inPicture: 'Patchy, lopsided shapes with bright knots of star formation.',
    imaging: 'Broadband with H-alpha shows the star-forming knots; most are small, so focal length helps.',
    caution: null,
    concepts: ['lookback', 'h-alpha', 'stellar-evolution'],
    sources: ['wiki-irregular-galaxy']
  },
  nebula: {
    kind: 'nebula',
    title: 'Nebula',
    summary: 'A nebula is a cloud of gas and dust in space. What it looks like depends on the stars near it: it glows, reflects their light, or blocks the light behind it.',
    shines: 'Gas lit by hot stars glows in emission lines; dust near cooler stars reflects their light, often blue; dense dust shows as a silhouette.',
    life: 'Some are where stars are born, others what dying stars threw off.',
    inPicture: 'Red or teal glow from gas, blue haze from dust, or dark lanes, often several together.',
    imaging: 'If it glows red, narrowband filters suit it; if it is blue reflected light, use broadband under dark skies.',
    caution: null,
    concepts: ['emission-lines', 'scattering', 'dust-extinction'],
    sources: ['wiki-nebula']
  },
  emission_nebula: {
    kind: 'emission_nebula',
    title: 'Emission nebula',
    summary: 'An emission nebula is a cloud of gas, mostly hydrogen, set glowing by the ultraviolet light of hot young stars inside it. Many are where stars are being born.',
    shines: 'Its own light: gas ionised by starlight gives off emission lines, above all deep red hydrogen alpha, with teal oxygen III near the hottest stars.',
    life: 'The stars that light it live only a few million years, and their winds and radiation slowly clear the gas away.',
    inPicture: 'Pillars and dark knots where dense gas resists the starlight, bright rims where it is being eroded, and the young stars themselves.',
    imaging: 'Its light comes in a few narrow lines, so narrowband or dual-band filters work well, even with the Moon up.',
    caution: null,
    concepts: ['emission-lines', 'h-alpha', 'oiii', 'stellar-evolution'],
    sources: ['wiki-emission-nebula', 'wiki-h-ii-region']
  },
  reflection_nebula: {
    kind: 'reflection_nebula',
    title: 'Reflection nebula',
    summary: 'A reflection nebula is a cloud of dust lit by nearby stars that are not hot enough to make the gas glow. You see their light bounced off the dust.',
    shines: 'Reflected starlight. Small dust grains scatter blue light more than red, so most reflection nebulae look blue.',
    life: 'The dust is often left from the cloud the stars formed in, or a cloud they happen to be passing through.',
    inPicture: 'Soft blue haze around bright stars, with fine streaks where the dust is shaped by the stars’ motion and light.',
    imaging: 'Its light is a whole spectrum, so narrowband filters remove it. Use broadband colour, dark moonless skies and long integration.',
    caution: null,
    concepts: ['scattering', 'dust-extinction', 'surface-brightness'],
    sources: ['wiki-reflection-nebula', 'wiki-rayleigh']
  },
  planetary_nebula: {
    kind: 'planetary_nebula',
    title: 'Planetary nebula',
    summary: 'A planetary nebula is the shell of gas a dying Sun-like star throws off at the end of its life. It has nothing to do with planets: it looked round like a planet in early telescopes.',
    shines: 'The star’s exposed core, very hot and on its way to becoming a white dwarf, lights the shell with ultraviolet, so it glows in oxygen III and hydrogen alpha.',
    life: 'The shell glows for only some tens of thousands of years before it fades into space. The Sun will make one in roughly 5 billion years.',
    inPicture: 'Rings, shells and lobes around a faint central star, often teal inside and red at the edge.',
    imaging: 'Most are small and bright: use your longest focal length and shorter subs so the core does not burn out. An O III filter shows the shell well.',
    caution: null,
    concepts: ['stellar-evolution', 'oiii', 'h-alpha', 'nucleosynthesis'],
    sources: ['wiki-planetary-nebula', 'wiki-stellar-evolution']
  },
  dark_nebula: {
    kind: 'dark_nebula',
    title: 'Dark nebula',
    summary: 'A dark nebula is a dense cloud of dust and cold gas that blocks the light of everything behind it. You see it as a silhouette.',
    shines: 'It does not: it shows only against the stars or the bright nebula behind it.',
    life: 'These cold clouds are where new stars form when parts of them collapse under their own gravity.',
    inPicture: 'Holes and lanes in a star field or a glowing nebula, with stars reddened near their edges.',
    imaging: 'It needs a wide field, a dark sky and long broadband integration to show the faint background it hides.',
    caution: null,
    concepts: ['dust-extinction', 'stellar-evolution'],
    sources: ['wiki-dark-nebula', 'wiki-extinction']
  },
  open_cluster: {
    kind: 'open_cluster',
    title: 'Open cluster',
    summary: 'An open cluster is a loose group of tens to thousands of stars born together from the same cloud.',
    shines: 'The light of its stars, each seen on its own. Their colours tell their temperatures.',
    life: 'Most are young in cosmic terms, often less than a few hundred million years old, and drift apart as the galaxy’s gravity pulls on them.',
    inPicture: 'Stars of mixed colours: hot blue-white ones, and in older clusters a few orange giants.',
    imaging: 'Bright and quick to capture. Keep subs short enough that the brightest stars keep their colour, and avoid stretching stars into blobs.',
    caution: null,
    concepts: ['star-colour', 'stellar-evolution', 'apparent-magnitude'],
    sources: ['wiki-open-cluster']
  },
  globular_cluster: {
    kind: 'globular_cluster',
    title: 'Globular cluster',
    summary: 'A globular cluster is a tight ball of hundreds of thousands of old stars orbiting in the halo of a galaxy. The Milky Way has about 150 of them.',
    shines: 'Mostly old red and yellow stars; the young blue stars burned out long ago.',
    life: 'Many are over 10 billion years old, among the oldest things in the galaxy.',
    inPicture: 'A dense core that thins out into separate stars at the edge, with a few orange giants standing out.',
    imaging: 'The core saturates quickly, so use short subs. Good seeing and a long focal length resolve stars nearer the core.',
    caution: null,
    concepts: ['stellar-evolution', 'star-colour', 'seeing'],
    sources: ['wiki-globular-cluster']
  },
  star_cluster: {
    kind: 'star_cluster',
    title: 'Star cluster',
    summary: 'A star cluster is a group of stars born together and held, at least for a while, by their shared gravity.',
    shines: 'The light of its stars. Their colours tell their temperatures, and together they show the cluster’s age.',
    life: 'Loose open clusters drift apart over hundreds of millions of years; dense globular clusters can last over 10 billion.',
    inPicture: 'Stars of mixed colours and brightness around a common centre.',
    imaging: 'Short subs keep the brightest stars from saturating and keep their colour.',
    caution: null,
    concepts: ['star-colour', 'stellar-evolution'],
    sources: ['wiki-star-cluster']
  },
  supernova_remnant: {
    kind: 'supernova_remnant',
    title: 'Supernova remnant',
    summary: 'A supernova remnant is the expanding wreck of a star that exploded. The Crab Nebula (M1) is the remnant of a supernova recorded by Chinese astronomers in 1054.',
    shines: 'Shock waves from the blast heat the gas they sweep up, so it glows in emission lines: hydrogen alpha, oxygen III and sulphur II.',
    life: 'The debris spreads at thousands of kilometres per second and fades into space over tens of thousands of years or more, seeding it with new elements.',
    inPicture: 'Fine filaments and arcs, often red and teal side by side.',
    imaging: 'Narrowband filters bring out the filaments; many remnants are large and faint, so give them long integration.',
    caution: null,
    concepts: ['stellar-evolution', 'nucleosynthesis', 'h-alpha', 'oiii'],
    sources: ['wiki-supernova-remnant', 'wiki-crab-nebula']
  },
  molecular_cloud: {
    kind: 'molecular_cloud',
    title: 'Molecular cloud',
    summary: 'A molecular cloud is a cold, dense cloud of molecular hydrogen and dust, the raw material of stars. The largest hold the mass of millions of Suns.',
    shines: 'Barely in visible light: you see its dust blocking stars, and nebulae glowing where young stars light its edges.',
    life: 'Parts collapse into stars over millions of years; the new stars’ light and winds then break the cloud up.',
    inPicture: 'Dark lanes, faint brown dust and bright patches where it is lit.',
    imaging: 'Wide fields, very dark skies and long broadband integration show the dust.',
    caution: null,
    concepts: ['dust-extinction', 'stellar-evolution'],
    sources: ['wiki-molecular-cloud']
  },
  galaxy_cluster: {
    kind: 'galaxy_cluster',
    title: 'Galaxy cluster',
    summary: 'A galaxy cluster is hundreds to thousands of galaxies bound by gravity, the largest such structures in the universe.',
    shines: 'The light of its galaxies. Between them lies hot gas that shines in X-rays, and most of the mass is dark matter that does not shine at all.',
    life: 'Clusters build up over billions of years as galaxies and groups fall together.',
    inPicture: 'Many small smudges, elliptical and spiral, scattered across the field.',
    imaging: 'A wide field at a long enough focal length to tell the galaxies apart, with long integration under dark skies.',
    caution: null,
    concepts: ['lookback', 'light-year', 'surface-brightness'],
    sources: ['wiki-galaxy-cluster']
  },
  star: {
    kind: 'star',
    title: 'Star',
    summary: 'A star is a ball of hot gas held together by its own gravity and shining from nuclear fusion in its core.',
    shines: 'Fusion turns hydrogen into helium; the energy works its way out and leaves the surface as light.',
    life: 'A star’s mass sets its life: from a few million years for the most massive to far longer than the universe’s present age for the smallest.',
    inPicture: 'Its colour, which tells its surface temperature, and any companions near it.',
    imaging: 'Short exposures avoid saturation. Spikes and halos around bright stars come from the telescope, not the star.',
    caution: null,
    concepts: ['star-colour', 'stellar-evolution', 'apparent-magnitude'],
    sources: ['wiki-star', 'wiki-stellar-evolution']
  },
  comet: {
    kind: 'comet',
    title: 'Comet',
    summary: 'A comet is a small body of ice and dust from the outer solar system. Near the Sun its ice turns to gas, making a glowing head and tails.',
    shines: 'The head and dust tail reflect sunlight; the straight ion tail glows as gas is ionised by the Sun’s light and the solar wind. Many heads look green from gases such as diatomic carbon.',
    life: 'A comet loses some of its ice every time it passes the Sun, so it wears away over many orbits.',
    inPicture: 'A curved, yellowish dust tail and a straight, bluish ion tail pointing away from the Sun.',
    imaging: 'It moves against the stars: stack once aligned on the comet and once on the stars, then combine.',
    caution: null,
    concepts: ['solar-system-motion', 'scattering', 'emission-lines'],
    sources: ['wiki-comet']
  },
  asteroid: {
    kind: 'asteroid',
    title: 'Asteroid',
    summary: 'An asteroid is a rocky or metal body orbiting the Sun, most of them in the belt between Mars and Jupiter.',
    shines: 'Reflected sunlight only.',
    life: 'Most are left over from the formation of the planets about 4.6 billion years ago.',
    inPicture: 'A point of light that moves between frames, or a short trail in a long sub.',
    imaging: 'Compare frames taken minutes apart to see it move.',
    caution: null,
    concepts: ['solar-system-motion'],
    sources: ['wiki-asteroid']
  },
  planet: {
    kind: 'planet',
    title: 'Planet',
    summary: 'A planet orbits the Sun, is massive enough to be round, and has cleared its path of other bodies: the International Astronomical Union’s definition since 2006.',
    shines: 'Reflected sunlight.',
    life: 'The planets formed with the Sun about 4.6 billion years ago.',
    inPicture: 'Cloud bands, rings and moons, depending on the planet.',
    imaging: 'Planets are small and bright, so seeing limits the detail. Capture video, keep the sharpest frames and stack them (lucky imaging).',
    caution: null,
    concepts: ['seeing', 'solar-system-motion'],
    sources: ['wiki-planet', 'wiki-lucky-imaging']
  },
  moon: {
    kind: 'moon',
    title: 'The Moon',
    summary: 'The Moon is Earth’s natural satellite, about 384,000 km away; its light reaches you in about 1.3 seconds.',
    shines: 'Reflected sunlight. Its phase is how much of its lit half faces us.',
    life: 'It formed about 4.5 billion years ago, most likely from debris after a giant impact on the young Earth.',
    inPicture: 'Craters and mountains, sharpest along the terminator, where the Sun is low and shadows are long.',
    imaging: 'It is very bright: short exposures, and video with lucky imaging for detail. Its light also brightens the whole sky for deep-sky work.',
    caution: null,
    concepts: ['seeing', 'apparent-magnitude'],
    sources: ['wiki-moon']
  },
  solar_object: {
    kind: 'solar_object',
    title: 'The Sun',
    summary: 'The Sun is our star, about 4.6 billion years old and about 150 million km away; its light takes about 8 minutes 20 seconds to reach you.',
    shines: 'Fusion of hydrogen into helium in its core. Its surface is about 5,800 K.',
    life: 'It is about halfway through its life of fusing hydrogen.',
    inPicture: 'Sunspots, cooler regions where magnetic fields hold heat in, and with special filters prominences and filaments.',
    imaging: 'Only through a certified solar filter that covers the front of the telescope, or a dedicated solar telescope.',
    caution: SOLAR_CAUTION,
    concepts: ['star-colour', 'stellar-evolution'],
    sources: ['wiki-sun', 'wiki-solar-observation']
  },
  variable_star: {
    kind: 'variable_star',
    title: 'Variable star',
    summary: 'A variable star changes in brightness: it pulsates, is eclipsed by a companion, or erupts.',
    shines: 'Like any star, from fusion; what varies is its size, its temperature or what blocks it.',
    life: 'Pulsating stars such as Cepheids are in a short phase of their lives. Henrietta Leavitt found that a Cepheid’s period tells its true brightness, which made them a way to measure distances to other galaxies.',
    inPicture: 'Compare its brightness with stars nearby from night to night.',
    imaging: 'For measuring brightness, use the same exposure each time and keep the star below saturation.',
    caution: null,
    concepts: ['apparent-magnitude', 'light-year'],
    sources: ['wiki-variable-star', 'wiki-cepheid']
  },
  widefield_region: {
    kind: 'widefield_region',
    title: 'Wide-field region',
    summary: 'A wide area of sky with many objects in it, often along the Milky Way: the disc of our own galaxy seen from inside.',
    shines: 'Countless stars, glowing nebulae and the dust that blocks them.',
    life: 'Many objects at very different distances that only appear together.',
    inPicture: 'Star clouds, dark lanes of dust and red patches of hydrogen.',
    imaging: 'A short focal length or a mosaic, and dark skies.',
    caution: null,
    concepts: ['dust-extinction', 'light-year', 'h-alpha'],
    sources: ['wiki-milky-way']
  },
  constellation: {
    kind: 'constellation',
    title: 'Constellation',
    summary: 'A constellation is one of the 88 areas the International Astronomical Union divides the sky into, with official borders.',
    shines: 'Its stars are usually at very different distances and unrelated; they only line up from where we stand.',
    life: 'The patterns slowly change as stars move, but over tens of thousands of years, not a lifetime.',
    inPicture: 'The bright stars of its pattern and their colours.',
    imaging: 'A camera lens or a very short focal length.',
    caution: null,
    concepts: ['light-year', 'apparent-magnitude', 'star-colour'],
    sources: ['wiki-constellation', 'iau-constellations']
  },
  custom: {
    kind: 'custom',
    title: 'Your own target',
    summary: 'A target you added yourself.',
    ...EMPTY_PRIMER,
    caution: null,
    concepts: ['angular-size', 'apparent-magnitude'],
    sources: ['wiki-angular-diameter']
  },
  unknown: {
    kind: 'unknown',
    title: 'Not yet known',
    summary: 'This target’s type is not known yet.',
    ...EMPTY_PRIMER,
    caution: null,
    concepts: ['angular-size', 'apparent-magnitude'],
    sources: ['wiki-angular-diameter']
  }
}

/** The primer for a kind of object; a kind the app does not know gets the "not yet known" primer (LRN-003). */
export function primerFor(kind: string | null | undefined): ObjectPrimer {
  return kind && Object.hasOwn(PRIMERS, kind) ? PRIMERS[kind as ObjectKind] : PRIMERS.unknown
}

/** The concept with this id, or null. */
export function conceptById(id: string, concepts: readonly Concept[] = CONCEPTS): Concept | null {
  return concepts.find(c => c.id === id) ?? null
}

/** Where a source points, only for a source the knowledge base holds (LRN-005). */
export function sourceUrl(id: string, sources: readonly LearningSource[] = LEARNING_SOURCES): string | null {
  return sources.find(s => s.id === id)?.url ?? null
}

/** The longest a one-line answer may be, so it fits beside the number it explains. */
export const SHORT_MAX = 160

/**
 * What is wrong with a knowledge base, one line each (LRN-002): a fact without a source, a link to
 * a concept or source that does not exist, a repeated id, a one-line answer too long for a line,
 * a source that is not a web page, or a kind of object with no primer.
 */
export function libraryProblems(
  concepts: readonly Concept[] = CONCEPTS,
  primers: Readonly<Record<string, ObjectPrimer>> = PRIMERS,
  sources: readonly LearningSource[] = LEARNING_SOURCES,
  kinds: readonly string[] = [...OBJECT_KINDS, ...CATALOGUE_KINDS]
): string[] {
  const problems: string[] = []
  const sourceIds = new Set<string>()
  for (const s of sources) {
    if (sourceIds.has(s.id)) problems.push(`Source ${s.id} is listed twice.`)
    sourceIds.add(s.id)
    if (!s.url.startsWith('https://')) problems.push(`Source ${s.id} is not an https address.`)
  }
  const conceptIds = new Set<string>()
  for (const c of concepts) {
    if (conceptIds.has(c.id)) problems.push(`Concept ${c.id} is listed twice.`)
    conceptIds.add(c.id)
  }
  const cited = (owner: string, ids: readonly string[]): void => {
    if (ids.length === 0) problems.push(`${owner} names no source.`)
    for (const id of ids) if (!sourceIds.has(id)) problems.push(`${owner} cites ${id}, which is not a source.`)
  }
  const linked = (owner: string, ids: readonly string[]): void => {
    for (const id of ids) if (!conceptIds.has(id)) problems.push(`${owner} links to ${id}, which is not a concept.`)
  }
  for (const c of concepts) {
    const owner = `Concept ${c.id}`
    cited(owner, c.sources)
    linked(owner, c.related)
    if (c.related.includes(c.id)) problems.push(`${owner} links to itself.`)
    if (c.short.length > SHORT_MAX) problems.push(`${owner} has a one-line answer over ${SHORT_MAX} characters.`)
  }
  for (const kind of kinds) {
    const p = primers[kind]
    if (!p) {
      problems.push(`The ${kind} kind has no primer.`)
      continue
    }
    const owner = `Primer ${kind}`
    if (p.kind !== kind) problems.push(`${owner} is filed as ${p.kind}.`)
    cited(owner, p.sources)
    linked(owner, p.concepts)
  }
  return problems
}

/** A theme of the Learn page: ideas that belong together, in the order they read best. */
export interface ConceptTheme {
  id: string
  title: string
  concepts: string[]
}

/** Every concept under one theme (LRN-024). */
export const CONCEPT_THEMES: readonly ConceptTheme[] = [
  { id: 'distance', title: 'Distance and time', concepts: ['light-year', 'lookback', 'angular-size', 'apparent-magnitude', 'surface-brightness'] },
  { id: 'light', title: 'Light and colour', concepts: ['emission-lines', 'h-alpha', 'oiii', 'sii', 'hubble-palette', 'star-colour', 'scattering', 'dust-extinction'] },
  { id: 'stars', title: 'How stars live', concepts: ['stellar-evolution', 'nucleosynthesis'] },
  {
    id: 'sky',
    title: 'The sky above you',
    concepts: ['celestial-sphere', 'tangent-plane', 'position-angle', 'seasons', 'twilight', 'moon-phase', 'moonlight', 'airmass', 'seeing', 'solar-system-motion', 'messier-catalogue']
  },
  { id: 'camera', title: 'Your camera and your data', concepts: ['fits-header', 'bayer', 'image-scale', 'sampling', 'wcs', 'noise', 'dark-current', 'stacking', 'calibration'] }
]

/** What is wrong with the themes, one line each: a concept under no theme or two, or a theme naming a concept that does not exist. */
export function themeProblems(themes: readonly ConceptTheme[] = CONCEPT_THEMES, concepts: readonly Concept[] = CONCEPTS): string[] {
  const problems: string[] = []
  const ids = new Set(concepts.map(c => c.id))
  const placed = new Map<string, string>()
  for (const t of themes) {
    for (const id of t.concepts) {
      if (!ids.has(id)) problems.push(`Theme ${t.id} lists ${id}, which is not a concept.`)
      const earlier = placed.get(id)
      if (earlier) problems.push(`Concept ${id} is under both ${earlier} and ${t.id}.`)
      else placed.set(id, t.id)
    }
  }
  for (const c of concepts) if (!placed.has(c.id)) problems.push(`Concept ${c.id} is under no theme.`)
  return problems
}
