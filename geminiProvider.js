const { AIProvider, AIProviderError } = require('./provider');
const { config } = require('../config/env');

class GeminiProvider extends AIProvider {
  constructor() {
    super('gemini');
  }

  async generateText(systemPrompt, userPrompt, options = {}) {
    if (!config.geminiApiKey) {
      throw new AIProviderError('GEMINI_API_KEY is not configured on the server', {
        provider: 'gemini',
        retryable: false,
      });
    }

    const model = options.model || config.geminiModel;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);

    try {
      const response = await fetch(`${endpoint}?key=${encodeURIComponent(config.geminiApiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.2,
            maxOutputTokens: options.maxTokens || 4096,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new AIProviderError(
          `Gemini API responded with status ${response.status}`,
          { provider: 'gemini', cause: bodyText, retryable: response.status >= 500 || response.status === 429 }
        );
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('');
      if (!text) {
        const blockReason = data?.promptFeedback?.blockReason;
        throw new AIProviderError(
          blockReason ? `Gemini blocked the request: ${blockReason}` : 'Gemini API returned an empty response',
          { provider: 'gemini', retryable: !blockReason }
        );
      }
      return text;
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if (err.name === 'AbortError') {
        throw new AIProviderError('Gemini API request timed out', { provider: 'gemini', cause: err, retryable: true });
      }
      throw new AIProviderError(`Gemini API request failed: ${err.message}`, {
        provider: 'gemini',
        cause: err,
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = { GeminiProvider };
