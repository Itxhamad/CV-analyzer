const express = require('express');

const store = require('../storage/store');
const { matchJob } = require('../ai/analysisService');
const { computeScore } = require('../scoring/scoringEngine');
const { heavyLimiter } = require('../security/rateLimiters');

const router = express.Router();

router.post('/job-match', heavyLimiter, async (req, res, next) => {
  try {
    const { sessionId, analysisId, jobDescription } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' });
    if (!jobDescription || !jobDescription.trim()) {
      return res.status(400).json({ error: 'jobDescription is required.' });
    }

    const session = store.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'This upload session was not found or has expired. Please upload your CV again.' });
    }

    const { data } = await matchJob({ cvText: session.cvText, jobDescription: jobDescription.trim().slice(0, 8000) });
    const jobMatch = data.jobMatch;

    if (analysisId) {
      const merged = store.mergeJobMatchIntoAnalysis(analysisId, jobMatch);
      if (merged) {
        // Job relevance now enters the weighting, so the headline score and
        // breakdown must be recalculated -- never leave a stale overall
        // score on screen after new information changes the inputs.
        const { overallScore, label, breakdown } = computeScore(merged.result.analysis, jobMatch);
        merged.result.overallScore = overallScore;
        merged.result.label = label;
        merged.result.breakdown = breakdown;
        return res.json({ analysisId, overallScore, label, breakdown, jobMatch, merged: true });
      }
    }

    res.json({ jobMatch, merged: false });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
