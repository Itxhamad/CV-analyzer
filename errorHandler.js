const { ParseError } = require('../parsers/documentParser');
const multer = require('multer');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ParseError) {
    return res.status(422).json({ error: err.message });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'File is too large. Please upload a smaller file.'
      : `Upload error: ${err.message}`;
    return res.status(400).json({ error: message });
  }
  if (err.status && err.expose) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error('[errorHandler]', err);
  const isDev = process.env.NODE_ENV !== 'production';
  return res.status(500).json({
    error: 'Something went wrong while processing your request. Please try again in a moment.',
    ...(isDev ? { detail: err.message } : {}),
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found.' });
}

module.exports = { errorHandler, notFoundHandler };
