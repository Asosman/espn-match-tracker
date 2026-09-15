// utils/time.js
import { DateTime } from 'luxon';

export const TIMEZONE_WAT = 'Africa/Lagos';

/**
 * Returns current DateTime in West Africa Time (Africa/Lagos).
 * @returns {DateTime}
 */
export function getNowWAT() {
  return DateTime.now().setZone(TIMEZONE_WAT);
}

/**
 * Returns today's date string in YYYYMMDD format in West Africa Time.
 * @returns {string}
 */
export function getTodayDateWAT() {
  return getNowWAT().toFormat('yyyyLLdd');
}

/**
 * Returns today's date string in YYYY-MM-DD format in West Africa Time.
 * @returns {string}
 */
export function getTodayDateIsoWAT() {
  return getNowWAT().toFormat('yyyy-MM-dd');
}

/**
 * Returns yesterday's date string in YYYY-MM-DD format in West Africa Time.
 * @returns {string}
 */
export function getYesterdayDateIsoWAT() {
  return getNowWAT().minus({ days: 1 }).toFormat('yyyy-MM-dd');
}

/**
 * Checks if a given UTC ISO-8601 string from ESPN belongs strictly
 * to today's calendar date in Africa/Lagos.
 * Never includes yesterday, tomorrow, or future dates.
 * @param {string} utcIsoString
 * @param {string} [targetDateWAT] optional override date in YYYY-MM-DD format (defaults to current date in WAT)
 * @returns {boolean}
 */
export function isDateInTodayWAT(utcIsoString, targetDateWAT = null) {
  if (!utcIsoString) return false;
  try {
    const dtInWAT = DateTime.fromISO(utcIsoString, { zone: 'utc' }).setZone(TIMEZONE_WAT);
    if (!dtInWAT.isValid) return false;

    const targetDate = targetDateWAT || getTodayDateIsoWAT();
    const eventDateInWAT = dtInWAT.toFormat('yyyy-MM-dd');
    return eventDateInWAT === targetDate;
  } catch (err) {
    return false;
  }
}

/**
 * Formats a UTC ISO timestamp to a 24-hour kickoff time in WAT (e.g., "15:00").
 * @param {string} utcIsoString
 * @returns {string}
 */
export function formatKickoffWAT(utcIsoString) {
  if (!utcIsoString) return 'TBD';
  try {
    const dt = DateTime.fromISO(utcIsoString, { zone: 'utc' }).setZone(TIMEZONE_WAT);
    return dt.isValid ? dt.toFormat('HH:mm') : 'TBD';
  } catch (err) {
    return 'TBD';
  }
}

/**
 * Formats date display for fixtures header (e.g. "Saturday, 12 September 2026").
 * @param {DateTime|string|Date} [date]
 * @returns {string}
 */
export function formatDateDisplayWAT(date) {
  let dt;
  if (!date) {
    dt = getNowWAT();
  } else if (typeof date === 'string') {
    dt = DateTime.fromISO(date).setZone(TIMEZONE_WAT);
  } else if (date instanceof Date) {
    dt = DateTime.fromJSDate(date).setZone(TIMEZONE_WAT);
  } else {
    dt = date;
  }
  return dt.toFormat('EEEE, d MMMM yyyy');
}
