// Other ways a catalog title may be written in IGDB (and in HowLongToBeat): the emulator lists carry dump tags
// ("[Disc 1 of 2]", "[with Bonus DVD]"), HTML entities ("Pokk&eacute;n"), "Name - Subtitle", "Name, The", "&" for "and".
// Used by igdb.mjs to look a game up under each of them. Pure: no I/O.
import { matchKey } from './build.mjs';

// Some titles reach us with HTML entities.
const ENTITIES = { amp: '&', quot: '"', apos: "'", eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä', ccedil: 'ç', ecirc: 'ê', acirc: 'â', ocirc: 'ô', icirc: 'î', reg: '®', trade: '™', copy: '©' };
export const decode = (text) => (text || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, name) => {
  if (name[0] === '#') { const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1)); return code ? String.fromCodePoint(code) : m; }
  return ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? m;
});

const TAGS = /\s*[[(][^\])]*[\])]/g;
const DISC = /\s*[-:–,]?\s*\bdisc\s*\d+(?:\s*of\s*\d+)?\b/gi;

// The title written in the ways that can differ from IGDB's, original first.
// Returns { names: [every spelling], search: [the cleanest ones, for IGDB's search], year: a "(1997)" tag's year or null }.
export function spellings(title, alt = []) {
  const names = [];
  const search = [];
  let year = null;
  const add = (list, text) => { const s = text.replace(/\s+/g, ' ').trim(); if (s.length >= 3 && !list.includes(s)) list.push(s); };
  for (const [index, source] of [title, ...alt].entries()) {
    if (!source) continue;
    let t = decode(source).replace(/[™®©]/g, '');
    add(names, t);
    if (index === 0) { const tag = t.match(/[[(]\s*((?:19|20)\d\d)\s*[\])]/); if (tag) year = Number(tag[1]); }
    t = t.replace(TAGS, ' ');
    add(names, t);
    t = t.replace(DISC, ' ');
    add(names, t);
    t = t.replace(/\s+[-–—]\s+/g, ': ');
    add(names, t);
    add(names, t.replace(/\s*&\s*/g, ' and '));
    const article = t.match(/^(.*?),\s*(the|a|an)$/i);
    if (article) add(names, `${article[2]} ${article[1]}`);
    add(search, article ? `${article[2]} ${article[1]}` : t);
  }
  return { names, search, year };
}

// The match keys that count as "the same game" for a title (see igdb.mjs pick()).
export const keysOf = (title, alt = []) => new Set(spellings(title, alt).names.map(matchKey).filter(Boolean));
