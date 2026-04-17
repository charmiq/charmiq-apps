// lazy Google Fonts loader -- injects a single `<link>` per family, dedupes,
// and awaits `document.fonts.load` so canvas-based PNG export sees the glyphs
// before `drawImage` is called. No API key required: we ship a curated list
// of popular families and query Google Fonts' CSS endpoint directly by name
// ********************************************************************************

// == Curated Family List =========================================================
// hand-picked "top 40" from Google Fonts' popularity ranking. intentionally
// finite so the picker can be a simple search-filtered list rather than a
// paginated browser; users can always search within it. Labels == CSS family
// name (Google's endpoint accepts family names with `+` for spaces)
export const GOOGLE_FONT_FAMILIES: ReadonlyArray<string> = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Source Sans 3', 'Raleway',
  'Nunito', 'Inter', 'Merriweather', 'Playfair Display', 'Oswald', 'Ubuntu',
  'PT Sans', 'PT Serif', 'Noto Sans', 'Noto Serif', 'Work Sans', 'Fira Sans',
  'Quicksand', 'Rubik', 'Mulish', 'DM Sans', 'DM Serif Display', 'Bebas Neue',
  'Lora', 'Bitter', 'Cabin', 'Crimson Text', 'Karla', 'Libre Baskerville',
  'Josefin Sans', 'Archivo', 'Space Grotesk', 'Space Mono', 'JetBrains Mono',
  'Fira Code', 'Inconsolata', 'Caveat', 'Dancing Script', 'Pacifico', 'Permanent Marker',
  'Shadows Into Light', 'Indie Flower', 'Kalam', 'Patrick Hand',
];

// == Internal State ==============================================================
// Map<family, Promise<void>> -- resolves when the font has *loaded* (glyph
// metrics available via `document.fonts`). Re-requesting a family returns the
// same in-flight promise rather than inserting another stylesheet. Tracking
// an explicit promise rather than a Set lets callers `await` before rendering
const loadedFonts = new Map<string, Promise<void>>();

// == Public API ==================================================================
/** inject the Google Fonts stylesheet for `family` (idempotent) and return a
 *  promise that resolves once the font is loadable. Safe to call repeatedly
 *  from hot paths -- every call after the first reuses the cached promise */
export const loadGoogleFont = (family: string): Promise<void> => {
  const existing = loadedFonts.get(family);
  if(existing) return existing;

  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;700&display=swap`;

  const linkPromise = new Promise<void>((resolve) => {
    // attach link (even if it were already present by id, this simply resolves
    // through the cached promise above -- but a preceding injection from
    // another module would still get picked up by document.fonts.load)
    const existingLink = document.querySelector(`link[data-google-font="${family}"]`);
    if(!existingLink) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute('data-google-font', family);
      document.head.appendChild(link);
    } /* else -- already in the document */

    // `document.fonts.load` triggers a real glyph fetch if the face is not yet
    // activated. This asks for the regular weight at a nominal 16px -- the
    // returned FontFace[] is ignored, this only cares about the settle
    if((document as any).fonts && (document as any).fonts.load) {
      (document as any).fonts.load(`16px "${family}"`).then(() => resolve()).catch(() => resolve());
    } else {
      // older engines without FontFaceSet -- resolve after a short grace
      // period so the stylesheet has time to parse
      setTimeout(resolve, 300);
    }
  });

  loadedFonts.set(family, linkPromise);
  return linkPromise;
};

// --------------------------------------------------------------------------------
/** return the canonical CSS font-family stack for a Google font -- the quoted
 *  family name followed by a safe fallback. Stored directly on TextElement.fontFamily
 *  so the renderer needs no awareness of Google Fonts */
export const googleFontStack = (family: string): string => `"${family}", system-ui, sans-serif`;

// --------------------------------------------------------------------------------
/** block until every Google-font family currently referenced by `elements` has
 *  loaded. Called from the PNG exporter before canvas rendering so text nodes draw
 *  in their intended face rather than the fallback */
export const ensureGoogleFontsLoaded = async (fontFamilies: ReadonlyArray<string>): Promise<void> => {
  const seen = new Set<string>();
  const jobs: Promise<void>[] = [];
  for(const stack of fontFamilies) {
    // fontFamily is stored as a full CSS stack -- the Google family (if any) is the
    // first token, quoted. parse it out and skip anything that isn't on the curated
    // list to avoid issuing a fetch for "Georgia" or similar
    const match = stack.match(/^"([^"]+)"/);
    if(!match) continue;
    const family = match[1];
    if(seen.has(family)) continue;
    seen.add(family);
    if(GOOGLE_FONT_FAMILIES.includes(family)) jobs.push(loadGoogleFont(family));
  }
  if(jobs.length < 1) return;/*nothing to load*/
  await Promise.all(jobs);
};
