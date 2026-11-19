// Demos, betas and trials are not games of their own (the full game comes later), so they are left out of the catalog.
// Decided by the NAME only, so it has to be careful: a real game whose title merely contains one of these words must stay
// ("Prototype", "Tales of Monkey Island: The Trial and Execution of Guybrush Threepwood"). Words that are ordinary in
// real titles (prototype) are not markers; anything that does look like a marker but is a real game goes in KEEP.

// Markers: demo / demonstration, "Trial Version|Edition|Code" or "[Trial]", a beta that is not the first word (so "Beta BLOC" stays),
// 体験版 (trial version), PSP kiosk discs, "[Preview]" / "Preview Disc" / a trailing "Preview". "Trial" alone is NOT a marker
// ("Urban Trial Freestyle", "Time Trial Challenge" are games).
const MARKER = /\b(?:demos?|demonstration|kiosk)\b|体験版|(?<!^)\bbeta\b|\btrial\s+(?:version|edition|code|ver\.?)\b|\[trial\]|\[preview\]|\bpreview\s+disc\b|\bpreview\s*[)\]]*$/i;

// Real games (or what the owner wants kept) that the markers would catch. Names, matched ignoring case.
const KEEP = [
  /\btrial and execution\b/i,   // Tales of Monkey Island, chapter 4
  /^p\.t\.$/i,                  // Silent Hills "P.T.": kept on purpose (it is its own thing, the game was cancelled)
];

// Trials that carry no marker word.
const ALSO = [/^macross trial frontier$/i];

export function isDemo(title) {
  const text = (title || '').replace(/[™®©]/g, ' ').trim();
  return (MARKER.test(text) || ALSO.some((also) => also.test(text))) && !KEEP.some((keep) => keep.test(text));
}

// games: [{ title, ... }]. Returns { games: the ones to keep, dropped: titles left out }.
export function dropDemos(games) {
  const kept = [];
  const dropped = [];
  for (const game of games) (isDemo(game.title) ? dropped : kept).push(game);
  return { games: kept, dropped: dropped.map((game) => game.title) };
}
