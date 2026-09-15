// mock/mockFacebookClient.js
import logger from '../utils/logger.js';

let postCounter = 0;
const mockPosts = [];

/**
 * Creates a mock Facebook post without performing external network requests.
 * @param {string} message
 * @returns {Promise<string>}
 */
export async function createPagePost(message) {
  postCounter++;
  const postId = `mock-post-${String(postCounter).padStart(3, '0')}`;
  mockPosts.push({
    id: postId,
    action: 'CREATE',
    content: message,
    timestamp: new Date().toISOString(),
  });

  logger.info(`[MOCK FACEBOOK POST] Created post ${postId}`);
  return postId;
}

/**
 * Edits an existing mock Facebook post.
 * @param {string} postId
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export async function updatePagePost(postId, message) {
  const existing = mockPosts.find((p) => p.id === postId);
  if (existing) {
    existing.content = message;
    existing.lastUpdated = new Date().toISOString();
  }
  mockPosts.push({
    id: postId,
    action: 'UPDATE',
    content: message,
    timestamp: new Date().toISOString(),
  });

  logger.info(`[MOCK FACEBOOK EDIT] Edited post ${postId}`);
  return true;
}

/**
 * Returns all mock posts recorded during this session.
 * @returns {any[]}
 */
export function getMockPosts() {
  return [...mockPosts];
}

export function isFacebookEnabled() {
  return true;
}

export default {
  createPagePost,
  updatePagePost,
  getMockPosts,
  isFacebookEnabled,
};
