// utils/hashtags.js

const STANDARD_HASHTAGS = ['#Livescore', '#FootballNews', '#Matchday', '#LiveScore'];

const LEAGUE_HASHTAG_MAP = {
  'uefa champions league': ['#UCL'],
  'uefa europa league': ['#UEL'],
  'uefa europa conference league': ['#UECL'],
  'uefa conference league': ['#UECL'],
  'english premier league': ['#PremierLeague', '#EPL'],
  'premier league': ['#PremierLeague', '#EPL'],
  'laliga': ['#LaLiga'],
  'spanish laliga': ['#LaLiga'],
  'serie a': ['#SerieA'],
  'italian serie a': ['#SerieA'],
  'bundesliga': ['#Bundesliga'],
  'german bundesliga': ['#Bundesliga'],
  'french ligue 1': ['#Ligue1'],
  'ligue 1': ['#Ligue1'],
  'major league soccer': ['#MLS'],
  'mls': ['#MLS'],
  'fa cup': ['#FACup'],
  'carabao cup': ['#CarabaoCup'],
  'copa del rey': ['#CopaDelRey'],
  'copa libertadores': ['#Libertadores'],
  'fifa world cup': ['#WorldCup'],
  'afc champions league elite east': ['#ACLElite', '#ACLEast'],
  'afc champions league elite west': ['#ACLElite', '#ACLWest'],
};

/**
 * Cleans a team or entity name into a PascalCase hashtag string.
 * Strips punctuation, collapses whitespace.
 * @param {string} str
 * @returns {string}
 */
export function sanitizeToHashtag(str) {
  if (!str) return '';
  // Remove special characters, accents/punctuation except spaces
  const cleaned = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim();

  if (!cleaned) return '';

  // Convert words to PascalCase
  const words = cleaned.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return `#${words.join('')}`;
}

/**
 * Builds standard and match-specific hashtags.
 * @param {string} homeName
 * @param {string} awayName
 * @param {string} leagueName
 * @returns {string}
 */
export function buildMatchHashtags(homeName, awayName, leagueName) {
  const tags = new Set(STANDARD_HASHTAGS);

  // League specific
  if (leagueName) {
    const key = leagueName.trim().toLowerCase();
    const mapped = LEAGUE_HASHTAG_MAP[key];
    if (mapped) {
      mapped.forEach((t) => tags.add(t));
    } else {
      const customTag = sanitizeToHashtag(leagueName);
      if (customTag) tags.add(customTag);
    }
  }

  // Home and Away teams
  const homeTag = sanitizeToHashtag(homeName);
  if (homeTag) tags.add(homeTag);

  const awayTag = sanitizeToHashtag(awayName);
  if (awayTag) tags.add(awayTag);

  // Format with standard line break
  const standardList = [...STANDARD_HASHTAGS].join(' ');
  const matchSpecific = [...tags].filter((t) => !STANDARD_HASHTAGS.includes(t)).join(' ');

  if (matchSpecific) {
    return `${standardList}\n${matchSpecific}`;
  }
  return standardList;
}

export default buildMatchHashtags;
