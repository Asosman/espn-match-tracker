// config/env.js
import dotenv from 'dotenv';
import path from 'path';

// Load .env before anything else
dotenv.config();

const isMockMode = process.argv.includes('--mock') || process.env.MOCK_MODE === 'true';

/**
 * Validates and converts an environment variable to a positive integer.
 * @param {string} key
 * @param {number} defaultValue
 * @param {number} [min=1]
 * @returns {number}
 */
function parsePositiveInt(key, defaultValue, min = 1) {
  const val = process.env[key];
  if (val === undefined || val === '') {
    return defaultValue;
  }
  const parsed = Number(val);
  if (isNaN(parsed) || parsed < min) {
    console.error(`[CONFIG ERROR] ${key} must be a valid number >= ${min}, received: "${val}"`);
    process.exit(1);
  }
  return parsed;
}

// In live mode (not mock), validate Facebook credentials
if (!isMockMode) {
  const missing = [];
  if (!process.env.FACEBOOK_PAGE_ID) {
    missing.push('FACEBOOK_PAGE_ID');
  }
  if (!process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
    missing.push('FACEBOOK_PAGE_ACCESS_TOKEN');
  }
  if (missing.length > 0) {
    console.warn(`[CONFIG WARNING] Missing required Facebook environment variables for live publishing: ${missing.join(', ')}.`);
    console.warn(`Running in unauthenticated mode for Facebook. Facebook calls will be simulated/logged unless credentials are provided.`);
  }
}

const config = Object.freeze({
  isMockMode,
  facebook: {
    pageId: process.env.FACEBOOK_PAGE_ID || '',
    accessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
    maxRetries: parsePositiveInt('FACEBOOK_MAX_RETRIES', 4, 1),
  },
  monitoring: {
    pollIntervalMs: parsePositiveInt('POLL_INTERVAL_MS', 30000, 5000),
    maxMonitoredMatches: parsePositiveInt('MAX_MONITORED_MATCHES', 15, 1),
    lineupGraceMinutes: parsePositiveInt('LINEUP_GRACE_MINUTES_BEFORE_KICKOFF', 0, 0),
  },
  espn: {
    requestTimeoutMs: parsePositiveInt('ESPN_REQUEST_TIMEOUT_MS', 15000, 1000),
    maxRetries: parsePositiveInt('ESPN_MAX_RETRIES', 3, 0),
  },
  timezone: 'Africa/Lagos',
  dbPath: path.resolve(process.cwd(), 'db.json'),
});

export default config;
