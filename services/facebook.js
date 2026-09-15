// services/facebook.js
import axios from 'axios';
import config from '../config/env.js';
import logger from '../utils/logger.js';

let facebookEnabled = Boolean(config.facebook.pageId && config.facebook.accessToken && !config.isMockMode);
const publishedPostsLog = [];

export function isFacebookEnabled() {
  return facebookEnabled;
}

export function setFacebookEnabled(enabled) {
  facebookEnabled = enabled;
}

export function getPublishedPostsLog() {
  return [...publishedPostsLog];
}

/**
 * Executes a Facebook Graph API request with exponential backoff for rate limits.
 * Handles token invalidation (error code 190) gracefully.
 * @param {string} method
 * @param {string} url
 * @param {object} [data={}]
 * @returns {Promise<any>}
 */
async function callGraphApiWithRetry(method, url, data = {}) {
  if (!facebookEnabled) {
    logger.warn('Facebook publishing is disabled or unconfigured. Skipping API request.');
    return null;
  }

  const maxRetries = config.facebook.maxRetries;
  let attempt = 0;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const response = await axios({
        method,
        url,
        data,
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (err) {
      const fbError = err.response?.data?.error;
      const errorCode = fbError?.code;
      const subcode = fbError?.error_subcode;

      // Check for Invalid / Expired Access Token (Error Code 190)
      if (errorCode === 190) {
        facebookEnabled = false;
        logger.error(
          'Facebook access token is invalid or expired (Code 190). Facebook publishing has been disabled. ESPN monitoring will continue.'
        );
        return null;
      }

      // Check for Rate Limit Codes (4, 17, 32)
      const isRateLimit = errorCode === 4 || errorCode === 17 || errorCode === 32;
      if (isRateLimit && attempt <= maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000;
        logger.warn(
          `Facebook Graph API rate limit encountered (Code ${errorCode}). Backing off for ${delayMs / 1000}s (Attempt ${attempt}/${maxRetries})...`
        );
        await new Promise((res) => setTimeout(res, delayMs));
        continue;
      }

      // If we exhausted retries or encountered another error
      if (attempt > maxRetries) {
        logger.error(`Facebook request failed after ${attempt} attempts: ${fbError?.message || err.message}`);
        return null;
      }

      logger.error(`Facebook API error: ${fbError?.message || err.message} (Code: ${errorCode})`);
      return null;
    }
  }
  return null;
}

/**
 * Creates a new post on the configured Facebook Page.
 * @param {string} message
 * @returns {Promise<string|null>} returns post_id or null
 */
export async function createPagePost(message) {
  if (!message) return null;

  if (!facebookEnabled) {
    const mockId = `live-sim-post-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    publishedPostsLog.unshift({
      id: mockId,
      action: 'CREATE',
      content: message,
      timestamp: new Date().toISOString(),
      status: 'SIMULATED',
    });
    logger.info(`[FACEBOOK SIMULATED POST] id=${mockId}\n${message}`);
    return mockId;
  }

  const url = `https://graph.facebook.com/v19.0/${config.facebook.pageId}/feed`;
  const result = await callGraphApiWithRetry('POST', url, {
    message,
    access_token: config.facebook.accessToken,
  });

  if (result?.id) {
    publishedPostsLog.unshift({
      id: result.id,
      action: 'CREATE',
      content: message,
      timestamp: new Date().toISOString(),
      status: 'PUBLISHED',
    });
    logger.info(`Facebook post created successfully: id=${result.id}`);
    return result.id;
  }

  return null;
}

/**
 * Updates/edits an existing Facebook Page post.
 * @param {string} postId
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export async function updatePagePost(postId, message) {
  if (!postId || !message) return false;

  if (!facebookEnabled) {
    publishedPostsLog.unshift({
      id: postId,
      action: 'UPDATE',
      content: message,
      timestamp: new Date().toISOString(),
      status: 'SIMULATED',
    });
    logger.info(`[FACEBOOK SIMULATED EDIT] id=${postId}\n${message}`);
    return true;
  }

  const url = `https://graph.facebook.com/v19.0/${postId}`;
  const result = await callGraphApiWithRetry('POST', url, {
    message,
    access_token: config.facebook.accessToken,
  });

  if (result?.success || result?.id) {
    publishedPostsLog.unshift({
      id: postId,
      action: 'UPDATE',
      content: message,
      timestamp: new Date().toISOString(),
      status: 'UPDATED',
    });
    logger.info(`Facebook post updated successfully: id=${postId}`);
    return true;
  }

  return false;
}

export default {
  isFacebookEnabled,
  setFacebookEnabled,
  createPagePost,
  updatePagePost,
  getPublishedPostsLog,
};
