// services/db.js
import fs from 'fs/promises';
import path from 'path';
import config from '../config/env.js';
import logger from '../utils/logger.js';

let writeLock = Promise.resolve();

/**
 * Creates an empty database object template.
 * @returns {{ matches: Record<string, any> }}
 */
function createEmptyDb() {
  return {
    matches: {},
  };
}

/**
 * Initializes the database file if it does not already exist.
 * @returns {Promise<void>}
 */
export async function initDb() {
  try {
    await fs.access(config.dbPath);
  } catch {
    logger.info(`db.json not found. Initializing new database at ${config.dbPath}...`);
    await writeDbAtomic(createEmptyDb());
  }
}

/**
 * Safely reads and parses the JSON database.
 * Recovers automatically from corrupted files by backing up and recreating empty db.
 * @returns {Promise<{ matches: Record<string, any> }>}
 */
export async function getDatabase() {
  try {
    const raw = await fs.readFile(config.dbPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.matches) {
      throw new Error('Malformed database structure');
    }
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      const empty = createEmptyDb();
      await writeDbAtomic(empty);
      return empty;
    }

    logger.error(`Database read/parse error: ${err.message}. Backing up corrupted file...`);
    const backupPath = `${config.dbPath}.bak-${Date.now()}`;
    try {
      await fs.copyFile(config.dbPath, backupPath);
      logger.info(`Corrupted db.json copied to ${backupPath}`);
    } catch (copyErr) {
      logger.error(`Failed to create backup of corrupted db: ${copyErr.message}`);
    }

    const recovered = createEmptyDb();
    await writeDbAtomic(recovered);
    return recovered;
  }
}

/**
 * Performs an atomic write to db.json using a temp file + rename in same directory.
 * @param {object} data
 * @returns {Promise<void>}
 */
async function writeDbAtomic(data) {
  const dir = path.dirname(config.dbPath);
  const tempPath = path.join(dir, `.db.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const jsonContent = JSON.stringify(data, null, 2);

  await fs.writeFile(tempPath, jsonContent, 'utf-8');
  await fs.rename(tempPath, config.dbPath);
}

/**
 * Thread-safe / async-safe write queue wrapper.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
function enqueueWrite(operation) {
  const nextLock = writeLock.then(operation, operation);
  writeLock = nextLock.then(() => {}, () => {});
  return nextLock;
}

/**
 * Retrieves a match record by fixtureId, or null if not found.
 * @param {string} fixtureId
 * @returns {Promise<any|null>}
 */
export async function getMatchRecord(fixtureId) {
  const db = await getDatabase();
  return db.matches[fixtureId] || null;
}

/**
 * Saves or updates a match record in the database atomically.
 * @param {string} fixtureId
 * @param {object} record
 * @returns {Promise<void>}
 */
export async function saveMatchRecord(fixtureId, record) {
  return enqueueWrite(async () => {
    const db = await getDatabase();
    db.matches[fixtureId] = {
      ...(db.matches[fixtureId] || {}),
      ...record,
      fixtureId,
      lastUpdated: new Date().toISOString(),
    };
    await writeDbAtomic(db);
  });
}

/**
 * Mutates a match record safely under lock.
 * @param {string} fixtureId
 * @param {(currentRecord: any) => any} updaterFn
 * @returns {Promise<any>}
 */
export async function updateMatchRecord(fixtureId, updaterFn) {
  return enqueueWrite(async () => {
    const db = await getDatabase();
    const current = db.matches[fixtureId] || {
      matchId: fixtureId,
      fixtureId,
      homeName: '',
      awayName: '',
      homeTeam: '',
      awayTeam: '',
      leagueName: '',
      leagueSlug: '',
      lineupPostId: null,
      mainMatchPostId: null,
      lineupsPosted: false,
      score: { home: 0, away: 0 },
      lastScore: { home: 0, away: 0 },
      status: { state: 'pre' },
      events: {},
      facebookPosts: {},
      eventStates: {},
      postedEvents: [],
      latestPostContent: '',
      goalPosts: {},
      injuryEvents: [],
      lastStatus: '',
      lastPeriod: null,
      lastClock: '',
    };

    if (!current.events) current.events = {};
    if (!current.facebookPosts) current.facebookPosts = {};
    if (!current.eventStates) current.eventStates = {};
    if (!current.matchId) current.matchId = fixtureId;

    const updated = updaterFn(current) || current;
    updated.fixtureId = fixtureId;
    updated.matchId = fixtureId;
    updated.lastUpdated = new Date().toISOString();
    db.matches[fixtureId] = updated;

    await writeDbAtomic(db);
    return updated;
  });
}

/**
 * Returns all events for a match from canonical storage.
 * @param {string} fixtureId
 * @returns {Promise<Record<string, any>>}
 */
export async function getMatchEvents(fixtureId) {
  const match = await getMatchRecord(fixtureId);
  return match?.events || {};
}

/**
 * Saves or updates an event in a match's canonical record.
 * @param {string} fixtureId
 * @param {string} eventId
 * @param {object} eventData
 * @returns {Promise<any>}
 */
export async function saveMatchEvent(fixtureId, eventId, eventData) {
  return updateMatchRecord(fixtureId, (match) => {
    if (!match.events) match.events = {};
    match.events[eventId] = {
      ...(match.events[eventId] || {}),
      ...eventData,
      eventId,
      updatedAt: new Date().toISOString(),
    };

    // Keep eventStates backward-compatible alias in sync
    if (!match.eventStates) match.eventStates = {};
    match.eventStates[eventId] = match.events[eventId];

    return match;
  });
}

/**
 * Returns a Facebook post record by ID for a match.
 * @param {string} fixtureId
 * @param {string} postId
 * @returns {Promise<any|null>}
 */
export async function getMatchFacebookPost(fixtureId, postId) {
  const match = await getMatchRecord(fixtureId);
  return match?.facebookPosts?.[postId] || null;
}

/**
 * Records a Facebook post mapping against an event.
 * @param {string} fixtureId
 * @param {string} postId
 * @param {string} eventId
 * @param {string} type
 * @returns {Promise<any>}
 */
export async function recordFacebookPost(fixtureId, postId, eventId, type) {
  return updateMatchRecord(fixtureId, (match) => {
    if (!match.facebookPosts) match.facebookPosts = {};
    match.facebookPosts[postId] = {
      postId,
      eventId,
      type,
      createdAt: new Date().toISOString(),
    };

    if (match.events && match.events[eventId]) {
      match.events[eventId].facebookPostId = postId;
      match.events[eventId].status = 'VALID';
      match.events[eventId].postedAt = match.facebookPosts[postId].createdAt;
    }

    if (match.eventStates && match.eventStates[eventId]) {
      match.eventStates[eventId].facebookPostId = postId;
      match.eventStates[eventId].status = 'POSTED';
      match.eventStates[eventId].postedAt = match.facebookPosts[postId].createdAt;
    }

    return match;
  });
}

/**
 * Returns all match records in the database.
 * @returns {Promise<Record<string, any>>}
 */
export async function getAllMatches() {
  const db = await getDatabase();
  return db.matches;
}

/**
 * Removes a match record from db.json.
 * @param {string} fixtureId
 * @returns {Promise<boolean>}
 */
export async function removeMatchRecord(fixtureId) {
  return enqueueWrite(async () => {
    const db = await getDatabase();
    if (db.matches[fixtureId]) {
      delete db.matches[fixtureId];
      await writeDbAtomic(db);
      return true;
    }
    return false;
  });
}

export default {
  initDb,
  getDatabase,
  getMatchRecord,
  saveMatchRecord,
  updateMatchRecord,
  getMatchEvents,
  saveMatchEvent,
  getMatchFacebookPost,
  recordFacebookPost,
  getAllMatches,
  removeMatchRecord,
};
