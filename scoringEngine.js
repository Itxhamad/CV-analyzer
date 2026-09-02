/**
 * The AI modules each return their own 0-10 score, but the OVERALL score
 * shown to the user is always computed here, in plain backend logic, per
 * the fixed rubric below -- we never just forward an AI-generated overall
 * number. This keeps scoring consistent, auditable, and resistant to a
 * single bad AI response skewing the headline number.
 */

const BASE_WEIGHTS = Object.freeze({
  content: 0.20,
  ats: 0.20,
  experience: 0.15,
  skills: 0.15,
  structureFormatting: 0.10, // average of structure + formatting module scores
  jobRelevance: 0.10, // only present when a job description was supplied
  clarity: 0.05,
  completeness: 0.05,
});

function average(nums) {
  const valid = nums.filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function scoreLabel(score) {
  if (score <= 2) return 'Very Weak';
  if (score <= 4) return 'Needs Major Improvement';
  if (score <= 6) return 'Average';
  if (score <= 8) return 'Good';
  if (score <= 9) return 'Excellent';
  return 'Exceptional';
}

/**
 * @param {object} analysis - validated analysis object from the AI (main schema)
 * @param {object|null} jobMatch - validated jobMatch object, or null if no job description was given
 * @returns {{ overallScore: number, label: string, breakdown: object[] }}
 */
function computeScore(analysis, jobMatch) {
  const structureFormatting = average([analysis.structure?.score, analysis.formatting?.score]);

  const rawScores = {
    content: analysis.content?.score ?? null,
    ats: analysis.ats?.score ?? null,
    experience: analysis.experience?.score ?? null,
    skills: analysis.skills?.score ?? null,
    structureFormatting,
    jobRelevance: jobMatch ? jobMatch.score ?? null : null,
    clarity: analysis.clarity?.score ?? null,
    completeness: analysis.completeness?.score ?? null,
  };

  // Redistribute the "job relevance" weight across the other categories,
  // proportional to their existing weight, whenever there's no job
  // description to score against -- rather than silently scoring it 0.
  const weights = { ...BASE_WEIGHTS };
  if (!jobMatch) {
    const freed = weights.jobRelevance;
    delete weights.jobRelevance;
    const keys = Object.keys(weights);
    const total = keys.reduce((s, k) => s + weights[k], 0);
    keys.forEach((k) => {
      weights[k] += (weights[k] / total) * freed;
    });
  }

  let weightedSum = 0;
  let weightUsed = 0;
  const breakdown = [];

  for (const key of Object.keys(weights)) {
    const value = rawScores[key];
    const weight = weights[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      weightedSum += value * weight;
      weightUsed += weight;
    }
    breakdown.push({ key, label: BREAKDOWN_LABELS[key], score: value, weight: Math.round(weight * 1000) / 1000 });
  }

  const overallScore = weightUsed > 0 ? Math.round((weightedSum / weightUsed) * 10) / 10 : 0;

  return {
    overallScore,
    label: scoreLabel(overallScore),
    breakdown,
  };
}

const BREAKDOWN_LABELS = {
  content: 'Content Quality',
  ats: 'ATS Compatibility',
  experience: 'Experience',
  skills: 'Skills',
  structureFormatting: 'Structure & Formatting',
  jobRelevance: 'Job Relevance',
  clarity: 'Clarity',
  completeness: 'Completeness',
};

module.exports = { computeScore, scoreLabel, BASE_WEIGHTS };
