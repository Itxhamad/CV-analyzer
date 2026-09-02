const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { config, warnIfMisconfigured } = require('./config/env');
const { generalLimiter } = require('./security/rateLimiters');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const store = require('./storage/store');

const cvRoutes = require('./routes/cv');
const analysisRoutes = require('./routes/analysis');
const jobMatchRoutes = require('./routes/jobMatch');
const reportRoutes = require('./routes/report');

if (!fs.existsSync(config.tmpDir)) fs.mkdirSync(config.tmpDir, { recursive: true });

const app = express();

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use(generalLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', aiProvider: config.aiProvider, fallbackEnabled: config.aiFallbackEnabled });
});

app.use('/api/cv', cvRoutes);
app.use('/api', analysisRoutes);
app.use('/api', jobMatchRoutes);
app.use('/api', reportRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use('/api', notFoundHandler);
app.use(errorHandler);

async function start() {
  warnIfMisconfigured();
  await store.cleanupOrphanedFiles();
  app.listen(config.port, () => {
    console.log(`AI CV Analyzer running on http://localhost:${config.port} (env: ${config.nodeEnv})`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
