// utils/retry.js
import logger from './logger.js';

/**
 * Checks whether an error is transient and retryable.
 * @param {any} error
 * @returns {boolean}
 */
export function isRetryableError(error) {
  if (!error) return false;

  // Timeout or network connection error
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return true;
  }

  // HTTP status codes
  const status = error.response?.status;
  if (status) {
    if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
      return true;
    }
    // Permanent client errors 4xx (except 429) are not retryable
    if (status >= 400 && status < 500) {
      return false;
    }
  }

  return true;
}

/**
 * Executes an async operation with exponential backoff retries.
 * Attempt 1: immediate
 * Attempt 2: 2s
 * Attempt 3: 4s
 * Attempt 4: 8s
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} maxRetries
 * @param {string} [opName='Operation']
 * @returns {Promise<T>}
 */
export async function withRetry(fn, maxRetries = 3, opName = 'Operation') {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      if (attempt > maxRetries || !isRetryableError(err)) {
        logger.error(`${opName} failed after attempt ${attempt}/${maxRetries + 1}: ${err.message}`);
        throw err;
      }

      // Calculate backoff: 2s, 4s, 8s
      const delayMs = Math.pow(2, attempt) * 1000;
      logger.warn(`${opName} failed (attempt ${attempt}/${maxRetries + 1}): ${err.message}. Retrying in ${delayMs / 1000}s...`);
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
}

/**
 * Fallback resolution pattern.
 * Calls primary loader, validates result with validator, and if missing/invalid,
 * tries each fallback loader in sequence until validation succeeds.
 * @template T
 * @param {() => Promise<T>} primaryLoader
 * @param {Array<() => Promise<T>>} fallbackLoaders
 * @param {(data: T) => boolean} validator
 * @param {string} [fieldName='Data']
 * @returns {Promise<T|null>}
 */
export async function resolveWithFallbacks(primaryLoader, fallbackLoaders, validator, fieldName = 'Data') {
  try {
    const primaryResult = await primaryLoader();
    if (validator(primaryResult)) {
      return primaryResult;
    }
    logger.warn(`Primary source missing valid ${fieldName}; initiating fallback chain...`);
  } catch (err) {
    logger.warn(`Primary loader for ${fieldName} encountered error: ${err.message}; falling back...`);
  }

  for (let i = 0; i < fallbackLoaders.length; i++) {
    try {
      logger.debug(`Attempting fallback ${i + 1}/${fallbackLoaders.length} for ${fieldName}...`);
      const fallbackResult = await fallbackLoaders[i]();
      if (validator(fallbackResult)) {
        logger.info(`Resolved ${fieldName} via fallback ${i + 1}.`);
        return fallbackResult;
      }
    } catch (err) {
      logger.warn(`Fallback ${i + 1} for ${fieldName} failed: ${err.message}`);
    }
  }

  logger.warn(`All fallback attempts for ${fieldName} exhausted without resolving valid data.`);
  return null;
}
