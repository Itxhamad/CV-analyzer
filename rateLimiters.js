const rateLimit = require('express-rate-limit');
const { config } = require('../config/env');

// General limiter for all API traffic.
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.generalMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

// Stricter limiter for expensive operations (upload + AI analysis) so a
// single anonymous client can't run up API provider costs or exhaust
// server resources. Keyed by IP address plus the client-generated
// anonymous session id (header), when present, so it's a bit harder to
// evade by itself while still requiring no login.
const heavyLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.heavyMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const sessionId = req.headers['x-session-id'];
    return sessionId ? `${req.ip}:${sessionId}` : req.ip;
  },
  message: { error: 'Too many analysis requests from this session. Please try again later.' },
});

module.exports = { generalLimiter, heavyLimiter };
