const express = require('express');
const crypto = require('crypto');

const store = require('../storage/store');
const { analyzeCv, matchJob } = require('../ai/analysisService');
const { computeScore } = require('../scoring/scoringEngine');
const { heavyLimiter } = require('../security/rateLimiters');

const router = express.Router();

const OPTIONAL_INFO_FIELDS = [
  'skills',
  'degree',
  'field',
  'university',
  'graduationYear',
  'targetJob',
  'experienceLevel',
  'targetLocation',
];

function pickOptionalInfo(body = {}) {
  const info = {};
  OPTIONAL_INFO_FIELDS.forEach((key) => {
    if (typeof body[key] === 'string' && body[key].trim()) info[key] = body[key].trim().slice(0, 500);
  });
  return info;
}

router.post('/cv/analyze', heavyLimiter, async (req, res, next) => {
  try {
    const { sessionId, jobDescription } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' });

    const session = store.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'This upload session was not found or has expired. Please upload your CV again.' });
    }

    const optionalInfo = pickOptionalInfo(req.body);
    const trimmedJobDescription = typeof jobDescription === 'string' ? jobDescription.trim().slice(0, 8000) : '';

    const { data: analysis } = await analyzeCv({
      cvText: session.cvText,
      optionalInfo,
      jobDescription: trimmedJobDescription || null,
    });

    let jobMatch = null;
    if (trimmedJobDescription) {
      try {
        const jobResult = await matchJob({ cvText: session.cvText, jobDescription: trimmedJobDescription });
        jobMatch = jobResult.data.jobMatch;
      } catch (err) {
        // Job matching is an enhancement, not core CV analysis -- a failure
        // here must not block the rest of the report (spec section 33).
        console.warn('[analysis] job match failed, continuing without it:', err.message);
      }
    }

    const { overallScore, label, breakdown } = computeScore(analysis, jobMatch);

    const analysisId = crypto.randomUUID();
    const result = { overallScore, label, breakdown, analysis, jobMatch, meta: session.meta };
    store.saveAnalysis({ id: analysisId, sessionId, result });

    res.json({ analysisId, ...result });
  } catch (err) {
    next(err);
  }
});

router.get('/analysis/:analysisId', (req, res) => {
  const analysis = store.getAnalysis(req.params.analysisId);
  if (!analysis) return res.status(404).json({ error: 'Analysis not found or has expired.' });
  res.json({ analysisId: req.params.analysisId, ...analysis.result });
});

module.exports = router;
