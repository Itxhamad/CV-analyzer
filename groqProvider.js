const { AIProvider, AIProviderError } = require('./provider');
const { config } = require('../config/env');

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

class GroqProvider extends AIProvider {
  constructor() {
    super('groq');
  }

  async generateText(systemPrompt, userPrompt, options = {}) {
    if (!config.groqApiKey) {
      throw new AIProviderError('GROQ_API_KEY is not configured on the server', {
        provider: 'groq',
        retryable: false,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);

    try {
      const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.groqApiKey}`,
        },
        body: JSON.stringify({
          model: options.model || config.groqModel,
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxTokens || 4096,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new AIProviderError(
          `Groq API responded with status ${response.status}`,
          { provider: 'groq', cause: bodyText, retryable: response.status >= 500 || response.status === 429 }
        );
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) {
        throw new AIProviderError('Groq API returned an empty response', {
          provider: 'groq',
          retryable: true,
        });
      }
      return text;
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if (err.name === 'AbortError') {
        throw new AIProviderError('Groq API request timed out', { provider: 'groq', cause: err, retryable: true });
      }
      throw new AIProviderError(`Groq API request failed: ${err.message}`, {
        provider: 'groq',
        cause: err,
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = { GroqProvider };
