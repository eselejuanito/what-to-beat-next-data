// Weekly: new fan ports, recompilations and native layers on GitHub, for a person to review.
// Searches the topics and words this community uses, keeps the projects that publish a downloadable
// release with builds for some system and are not in sources/ports.json or sources/ignore.json yet,
// and writes them into one open issue ("Port candidates"), replacing its list each week.
// Nothing is added by itself: a candidate goes to ports.json (or ignore.json) by hand, after a look.
// Usage: node scripts/discover.mjs [--dry-run]   (GITHUB_TOKEN; GITHUB_REPOSITORY for the issue)
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hostsOf } from './build.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const API = 'https://api.github.com/';
const TITLE = 'Port candidates';
const MIN_STARS = 50;
const SINCE_DAYS = 90;
const QUERIES = [
  'topic:static-recompilation',
  'topic:n64recomp',
  'topic:decompilation',
  'topic:source-port',
  '"static recompilation" in:description',
  '"native PC port" in:description',
  '"PC port" game in:description',
  '"bring your own" game in:description',
  '"your own copy" game in:description',
  '"no game assets" in:description',
];
// Software that shares the words but is no game: AI tools, servers, apps.
const NOT_GAMES = /\b(AI|LLM|agents?|API key|Redis|database|music player|chat|copilot|decompiler|reverse engineering tool|IDE)\b/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'what-to-beat-next-data',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

async function api(path, options = {}) {
  const response = await fetch(API + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${path}: ${response.status} ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

const since = new Date(Date.now() - SINCE_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10);
const known = new Set();
for (const file of ['sources/ports.json', 'sources/ignore.json']) {
  const data = JSON.parse(await readFile(join(ROOT, file), 'utf8').catch(() => '{}'));
  for (const port of data.ports || []) if (port.repo) known.add(port.repo.toLowerCase());
  for (const repo of data.repos || []) known.add(repo.toLowerCase());
}

const found = new Map();
for (const query of QUERIES) {
  const result = await api(`search/repositories?q=${encodeURIComponent(`${query} stars:>=${MIN_STARS} pushed:>=${since} archived:false`)}&sort=stars&per_page=50`);
  for (const repo of (result && result.items) || []) {
    if (!known.has(repo.full_name.toLowerCase()) && !NOT_GAMES.test(repo.description || '')) found.set(repo.full_name, repo);
  }
  await sleep(2500); // the search API allows 30 requests a minute
}

// Only what can be downloaded today, with the systems its files name.
const candidates = [];
for (const repo of found.values()) {
  const release = await api(`repos/${repo.full_name}/releases/latest`) || ((await api(`repos/${repo.full_name}/releases?per_page=1`)) || [])[0];
  await sleep(300);
  if (!release) continue;
  const hosts = [...new Set((release.assets || []).flatMap((asset) => hostsOf(asset.name)))].sort();
  if (!hosts.length) continue;
  candidates.push({ repo, release, hosts });
}
candidates.sort((a, b) => b.repo.stargazers_count - a.repo.stargazers_count);

const cell = (text) => String(text || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 140);
const body = [
  `Projects found on ${new Date().toISOString().slice(0, 10)} that publish a release with builds and are not in \`sources/ports.json\` or \`sources/ignore.json\` (at least ${MIN_STARS} stars, updated in the last ${SINCE_DAYS} days).`,
  '',
  'For each one: check that it asks for your own copy of the game and ships no game files, then add it to `sources/ports.json` (games, platform, method, project, url, repo) or its `owner/name` to `ignore.json`. This list is rewritten every week.',
  '',
  '| Project | ★ | Release | Systems | What it says |',
  '|---|---|---|---|---|',
  ...candidates.map(({ repo, release, hosts }) => `| [${repo.full_name}](${repo.html_url}) | ${repo.stargazers_count} | ${cell(release.tag_name)} (${(release.published_at || '').slice(0, 10)}) | ${hosts.join(' ')} | ${cell(repo.description)} |`),
  ...(candidates.length ? [] : ['| (nothing new this week) | | | | |']),
].join('\n');

console.log(`discover: ${found.size} new projects, ${candidates.length} with a release to review`);
if (process.argv.includes('--dry-run') || !process.env.GITHUB_REPOSITORY) {
  console.log(body);
} else {
  const repository = process.env.GITHUB_REPOSITORY;
  const open = (await api(`repos/${repository}/issues?state=open&per_page=100`)) || [];
  const issue = open.find((entry) => entry.title === TITLE && !entry.pull_request);
  const payload = { method: issue ? 'PATCH' : 'POST', body: JSON.stringify({ title: TITLE, body }) };
  await api(issue ? `repos/${repository}/issues/${issue.number}` : `repos/${repository}/issues`, payload);
  console.log(`discover: issue ${issue ? `#${issue.number} updated` : 'opened'}`);
}
