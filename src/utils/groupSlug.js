// "Access and data" -> "access-and-data". Used for the ?group= part of Settings and Admin links.
export const groupSlug = label => String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The ?group= and ?tab= values in the current hash.
export const hashParams = () => new URLSearchParams(window.location.hash.split('?')[1] || '');

// Old ?group= slugs (bookmarks) and the new slug(s) to try for each, in order.
const LEGACY_SLUGS = { 'this-ledger': ['ledgers'], display: ['settings'], 'members-and-data': ['access', 'data'], 'people-and-access': ['access'], 'shared-lists': ['settings'] };
export const slugCandidates = slug => (slug ? (LEGACY_SLUGS[slug] || [slug]) : []);
// The first of `groups` (labels) that the slug, or its legacy replacement, points at; undefined when none.
export const resolveGroup = (slug, groups) => slugCandidates(slug).map(c => groups.find(g => groupSlug(g) === c)).find(Boolean);
