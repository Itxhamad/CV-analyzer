const { computeScore, scoreLabel } = require('../server/scoring/scoringEngine');

const sampleAnalysis = {
  content: { score: 6 },
  ats: { score: 7 },
  experience: { score: 5 },
  skills: { score: 8 },
  structure: { score: 7 },
  formatting: { score: 6 },
  clarity: { score: 7 },
  completeness: { score: 5 },
};

describe('computeScore', () => {
  test('computes a weighted overall score without a job description', () => {
    const { overallScore, breakdown } = computeScore(sampleAnalysis, null);
    expect(overallScore).toBeGreaterThan(0);
    expect(overallScore).toBeLessThanOrEqual(10);
    expect(breakdown.find((b) => b.key === 'jobRelevance')).toBeUndefined();
  });

  test('includes job relevance in the weighting when a job match is present', () => {
    const withJob = computeScore(sampleAnalysis, { score: 9 });
    const withoutJob = computeScore(sampleAnalysis, null);
    const jobBreakdownEntry = withJob.breakdown.find((b) => b.key === 'jobRelevance');
    expect(jobBreakdownEntry).toBeDefined();
    expect(jobBreakdownEntry.score).toBe(9);
    // A high job-match score should pull the overall score up relative to no job description.
    expect(withJob.overallScore).toBeGreaterThan(withoutJob.overallScore);
  });

  test('redistributes weight gracefully when some module scores are missing', () => {
    const partial = { content: { score: 8 }, ats: { score: 8 } };
    const { overallScore } = computeScore(partial, null);
    expect(overallScore).toBeCloseTo(8, 1);
  });

  test('returns 0 when no scores are available at all', () => {
    const { overallScore } = computeScore({}, null);
    expect(overallScore).toBe(0);
  });
});

describe('scoreLabel', () => {
  test.each([
    [1, 'Very Weak'],
    [2, 'Very Weak'],
    [3, 'Needs Major Improvement'],
    [4, 'Needs Major Improvement'],
    [5, 'Average'],
    [6, 'Average'],
    [7, 'Good'],
    [8, 'Good'],
    [9, 'Excellent'],
    [10, 'Exceptional'],
  ])('scoreLabel(%d) === %s', (score, expected) => {
    expect(scoreLabel(score)).toBe(expected);
  });
});
