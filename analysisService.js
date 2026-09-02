const { getProvider, AIProviderError } = require('./provider');
const { config } = require('../config/env');
const { buildMainAnalysisPrompt, buildJobMatchPrompt, buildRepairPrompt } = require('./prompts');
const { validateAnalysis, validateJobMatch } = require('../schemas/analysisSchema');

function stripCodeFences(text) {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

function tryParseJSON(text) {
  try {
    return { ok: true, value: JSON.parse(stripCodeFences(text)) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function orderedProviderNames() {
  const primary = config.aiProvider;
  const fallback = primary === 'groq' ? 'gemini' : 'groq';
  const names = [primary];
  if (config.aiFallbackEnabled) names.push(fallback);
  return names;
}

/**
 * Runs systemPrompt/userPrompt through the configured provider(s), with
 * fallback on provider failure and one repair attempt if the response
 * fails schema validation. Never sends the same request to more than one
 * provider unless the first one actually failed (see spec section 5/37:
 * don't fan the same CV out to multiple providers "just in case").
 */
async function runStructuredAnalysis({ systemPrompt, userPrompt, validate }) {
  const providerNames = orderedProviderNames();
  let lastError = null;

  for (const providerName of providerNames) {
    let provider;
    try {
      provider = getProvider(providerName);
    } catch (err) {
      lastError = err;
      continue;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const prompt = attempt === 0 ? userPrompt : buildRepairPrompt(userPrompt, lastError?.rawOutput || '', lastError?.validationErrors || []);
        // eslint-disable-next-line no-await-in-loop
        const rawText = await provider.generateText(systemPrompt, prompt);
        const parsed = tryParseJSON(rawText);
        if (!parsed.ok) {
          lastError = Object.assign(new Error(`Invalid JSON from ${providerName}: ${parsed.error}`), {
            rawOutput: rawText,
            validationErrors: [parsed.error],
          });
          continue; // retry (repair) with same provider
        }
        const { valid, errors } = validate(parsed.value);
        if (!valid) {
          lastError = Object.assign(new Error(`Schema validation failed for ${providerName}`), {
            rawOutput: rawText,
            validationErrors: errors,
          });
          continue; // retry (repair) with same provider
        }
        return { data: parsed.value, provider: providerName };
      } catch (err) {
        lastError = err;
        if (err instanceof AIProviderError && !err.retryable) {
          break; // don't burn a repair attempt on a non-retryable error (e.g. missing key)
        }
        break; // move to next provider rather than repair-looping on a transport error
      }
    }
  }

  throw new Error(
    `All AI providers failed. Last error: ${lastError?.message || 'unknown error'}` +
    (lastError?.validationErrors ? ` (${lastError.validationErrors.slice(0, 3).join('; ')})` : '')
  );
}

async function analyzeCv({ cvText, optionalInfo, jobDescription }) {
  const { systemPrompt, userPrompt } = buildMainAnalysisPrompt({ cvText, optionalInfo, jobDescription });
  return runStructuredAnalysis({ systemPrompt, userPrompt, validate: validateAnalysis });
}

async function matchJob({ cvText, jobDescription }) {
  const { systemPrompt, userPrompt } = buildJobMatchPrompt({ cvText, jobDescription });
  return runStructuredAnalysis({ systemPrompt, userPrompt, validate: validateJobMatch });
}

module.exports = { analyzeCv, matchJob };
