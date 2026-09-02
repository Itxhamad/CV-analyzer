const express = require('express');

const store = require('../storage/store');
const { generatePdfReport } = require('../report/pdfReport');

const router = express.Router();

router.post('/report/pdf', (req, res) => {
  const { analysisId } = req.body || {};
  const analysis = analysisId && store.getAnalysis(analysisId);
  if (!analysis) return res.status(404).json({ error: 'Analysis not found or has expired.' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="cv-analysis-report.pdf"');
  generatePdfReport(res, analysis.result);
});

router.get('/report/json/:analysisId', (req, res) => {
  const analysis = store.getAnalysis(req.params.analysisId);
  if (!analysis) return res.status(404).json({ error: 'Analysis not found or has expired.' });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="cv-analysis-report.json"');
  res.json({ analysisId: req.params.analysisId, ...analysis.result });
});

module.exports = router;
