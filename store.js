const fs = require('fs/promises');
const { config } = require('../config/env');

/**
 * Deliberately in-memory (a Map), not a database. Per the spec's data
 * minimization principle (section 35) this app avoids persisting raw CV
 * content at all -- everything here disappears when the process restarts,
 * and is also actively deleted after CV_RETENTION_MINUTES regardless.
 *
 * For a multi-instance production deployment, swap this module for Redis
 * (with a TTL/EXPIRE matching cvRetentionMinutes) without changing callers.
 */

const sessions = new Map(); // sessionId -> { filePath, ext, cvText, meta, createdAt, expiresAt, timeoutHandle }
const analyses = new Map(); // analysisId -> { sessionId, result, createdAt, expiresAt, timeoutHandle }

function ttlMs() {
  return config.cvRetentionMinutes * 60 * 1000;
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[store] Failed to delete file ${filePath}:`, err.message);
  }
}

function createSession({ id, filePath, ext, cvText, meta }) {
  const createdAt = Date.now();
  const expiresAt = createdAt + ttlMs();
  const timeoutHandle = setTimeout(() => deleteSession(id), ttlMs());
  timeoutHandle.unref?.();
  sessions.set(id, { filePath, ext, cvText, meta, createdAt, expiresAt, timeoutHandle });
  return { id, expiresAt };
}

function getSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    deleteSession(id);
    return null;
  }
  return session;
}

async function deleteSession(id) {
  const session = sessions.get(id);
  if (!session) return false;
  clearTimeout(session.timeoutHandle);
  await safeUnlink(session.filePath);
  sessions.delete(id);
  return true;
}

function saveAnalysis({ id, sessionId, result }) {
  const createdAt = Date.now();
  const expiresAt = createdAt + ttlMs();
  const timeoutHandle = setTimeout(() => analyses.delete(id), ttlMs());
  timeoutHandle.unref?.();
  analyses.set(id, { sessionId, result, createdAt, expiresAt, timeoutHandle });
  return { id, expiresAt };
}

function getAnalysis(id) {
  const analysis = analyses.get(id);
  if (!analysis) return null;
  if (Date.now() > analysis.expiresAt) {
    clearTimeout(analysis.timeoutHandle);
    analyses.delete(id);
    return null;
  }
  return analysis;
}

function mergeJobMatchIntoAnalysis(id, jobMatch) {
  const analysis = getAnalysis(id);
  if (!analysis) return null;
  analysis.result.jobMatch = jobMatch;
  return analysis;
}

/** Called once at server startup to sweep any files left behind by a previous crashed process. */
async function cleanupOrphanedFiles() {
  try {
    const files = await fs.readdir(config.tmpDir);
    const trackedPaths = new Set([...sessions.values()].map((s) => s.filePath));
    await Promise.all(
      files
        .filter((f) => f !== '.gitkeep')
        .map(async (f) => {
          const full = `${config.tmpDir}/${f}`;
          if (!trackedPaths.has(full)) await safeUnlink(full);
        })
    );
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[store] Startup cleanup failed:', err.message);
  }
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
  saveAnalysis,
  getAnalysis,
  mergeJobMatchIntoAnalysis,
  cleanupOrphanedFiles,
};
