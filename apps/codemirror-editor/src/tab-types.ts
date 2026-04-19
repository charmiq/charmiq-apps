// tab identity primitives — the editor distinguishes two flavors of "string ID"
// for a tab and they MUST NOT be confused at call sites
// ********************************************************************************
// == Type Aliases ================================================================
/** the platform-minted, opaque content ID. Used for selectors (`[id='...']`),
 *  edit forwarding, and DOM-level addressing. Authors cannot know it ahead of
 *  time and it is unstable across platforms */
export type TabId = string/*alias*/;

/** the app-controlled stable handle parsed from the left side of an app-content
 *  name tuple ("<slug>:<display-name>"). The slug is the key for `tabModes` and
 *  `tabOrder` in appState because it is the only handle a document author can
 *  write declaratively while staying disjoint from the platform ID */
export type TabSlug = string/*alias*/;

// == Constants ===================================================================
/** delimiter between slug and display name in the raw app-content name. First
 *  occurrence wins so display names are free to contain further colons */
const SLUG_DELIMITER = ':';

// == Types =======================================================================
/** result of splitting a raw app-content name into its identity tuple */
export interface ParsedName {
  /** non-null when the raw name carried a delimiter; null marks a legacy
   *  slug-less name awaiting migration */
  readonly slug: TabSlug | null;
  readonly displayName: string;
}

// --------------------------------------------------------------------------------
/** the public projection of a tab — the shape returned by `listTabs` and pushed
 *  through `tabs$()`. Carries no slug; external callers see only the display
 *  name and the platform-minted ID */
export interface TabInfo {
  readonly id: TabId;
  readonly name: string;
  readonly mode: string;
  readonly isActive: boolean;
}

// --------------------------------------------------------------------------------
/** emission shape for `changes$()` — one event per content update for any tab,
 *  including the initial population on tab creation. Subscribers typically filter
 *  by `name` and react to `content` */
export interface TabContentChange {
  readonly tabId: TabId;
  readonly name: string;
  readonly mode: string;
  readonly content: string;
}

// == Functions ===================================================================
/** split a raw app-content name into `{ slug, displayName }`. A name with no
 *  delimiter is treated as slug-less (the entire string becomes the display
 *  name) and triggers the migration path on ingest. A missing/empty name
 *  yields `{ slug: null, displayName: '' }` — TabManager treats that as a
 *  content-only echo (no name change) for an existing tab */
export function parseName(rawName: string | undefined | null): ParsedName {
  if(!rawName) return { slug: null, displayName: '' };

  const idx = rawName.indexOf(SLUG_DELIMITER);
  if(idx < 0) return { slug: null, displayName: rawName };

  return {
    slug: rawName.slice(0, idx),
    displayName: rawName.slice(idx + 1)
  };
}

/** compose a `(slug, displayName)` tuple back into a raw app-content name */
export function composeName(slug: TabSlug, displayName: string): string {
  return `${slug}${SLUG_DELIMITER}${displayName}`;
}

// --------------------------------------------------------------------------------
/** mint a fresh slug for runtime tab creation or for migrating a legacy
 *  slug-less name. ~46 bits of entropy — sufficient for per-listing uniqueness;
 *  collisions are still handled defensively in TabManager */
export function mintSlug(): TabSlug {
  return Math.random().toString(36).slice(2, 11)/*9 base36 chars*/;
}
