// utils/logger.js
import { DateTime } from 'luxon';

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
  CRITICAL: 4,
};

const currentLevel = process.env.LOG_LEVEL ? (LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] ?? 1) : 1;

/**
 * Format timestamp in YYYY-MM-DD HH:mm:ss
 * @returns {string}
 */
function getTimestamp() {
  return DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss');
}

/**
 * Core logging method
 * @param {string} level
 * @param {string} message
 * @param {any[]} args
 */
function log(level, message, ...args) {
  const numLevel = LOG_LEVELS[level] ?? 1;
  if (numLevel < currentLevel) return;

  const prefix = `${getTimestamp()} [${level}]`;
  if (level === 'ERROR' || level === 'CRITICAL') {
    console.error(`${prefix} ${message}`, ...args);
  } else if (level === 'WARNING') {
    console.warn(`${prefix} ${message}`, ...args);
  } else {
    console.log(`${prefix} ${message}`, ...args);
  }
}

export const logger = {
  debug: (msg, ...args) => log('DEBUG', msg, ...args),
  info: (msg, ...args) => log('INFO', msg, ...args),
  warn: (msg, ...args) => log('WARNING', msg, ...args),
  error: (msg, ...args) => log('ERROR', msg, ...args),
  critical: (msg, ...args) => log('CRITICAL', msg, ...args),
};

export default logger;
