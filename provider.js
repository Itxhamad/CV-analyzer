/**
 * Base class for all AI providers. Every provider must implement
 * generateText(systemPrompt, userPrompt, options) and resolve with a
 * plain string containing the model's raw text response.
 *
 * Keeping this contract narrow (string in, string out) means the rest
 * of the app (analysisService, schema validation) never needs to know
 * which provider answered the request.
 */
class AIProvider {
  constructor(name) {
    if (new.target === AIProvider) {
      throw new Error('AIProvider is abstract and cannot be instantiated directly');
    }
    this.name = name;
  }

  // eslint-disable-next-line no-unused-vars
  async generateText(systemPrompt, userPrompt, options = {}) {
    throw new Error(`${this.name} provider must implement generateText()`);
  }
}

class AIProviderError extends Error {
  constructor(message, { provider, cause, retryable = true } = {}) {
    super(message);
    this.name = 'AIProviderError';
    this.provider = provider;
    this.retryable = retryable;
    if (cause) this.cause = cause;
  }
}

function getProvider(name) {
  const key = (name || '').toLowerCase();
  // Required here (not top-level) to avoid a circular require, since both
  // concrete providers import AIProvider from this same file.
  const { GroqProvider } = require('./groqProvider');
  const { GeminiProvider } = require('./geminiProvider');

  if (key === 'groq') return new GroqProvider();
  if (key === 'gemini') return new GeminiProvider();
  throw new Error(`Unknown AI provider: "${name}". Supported: groq, gemini`);
}

module.exports = { AIProvider, AIProviderError, getProvider };
