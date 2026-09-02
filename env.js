const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function bool(val, fallback) {
  if (val === undefined) return fallback;
  return val === 'true' || val === '1';
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  aiProvider: (process.env.AI_PROVIDER || 'groq').toLowerCase(),
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  aiFallbackEnabled: bool(process.env.AI_FALLBACK_ENABLED, true),
  aiTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '45000', 10),

  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || String(10 * 1024 * 1024), 10), // 10MB
  cvRetentionMinutes: parseInt(process.env.CV_RETENTION_MINUTES || '30', 10),
  tmpDir: process.env.TMP_DIR || path.join(__dirname, '..', '..', 'tmp'),

  jobMarketProvider: (process.env.JOB_MARKET_PROVIDER || 'none').toLowerCase(),

  corsOrigin: process.env.CORS_ORIGIN || '*',

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
    generalMax: parseInt(process.env.RATE_LIMIT_GENERAL_MAX || '200', 10),
    heavyMax: parseInt(process.env.RATE_LIMIT_HEAVY_MAX || '15', 10),
  },
};

function warnIfMisconfigured() {
  const warnings = [];
  if (!config.groqApiKey && !config.geminiApiKey) {
    warnings.push(
      'No AI provider API keys are set (GROQ_API_KEY / GEMINI_API_KEY). ' +
      'CV analysis requests will fail until at least one is configured in .env.'
    );
  }
  if (config.aiProvider === 'groq' && !config.groqApiKey) {
    warnings.push('AI_PROVIDER is "groq" but GROQ_API_KEY is missing.');
  }
  if (config.aiProvider === 'gemini' && !config.geminiApiKey) {
    warnings.push('AI_PROVIDER is "gemini" but GEMINI_API_KEY is missing.');
  }
  warnings.forEach((w) => console.warn(`[config] WARNING: ${w}`));
}

module.exports = { config, warnIfMisconfigured };
