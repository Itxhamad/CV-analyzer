const { validateAnalysis, validateJobMatch } = require('../server/schemas/analysisSchema');

function baseModule(overrides = {}) {
  return { score: 7, strengths: [], weaknesses: [], recommendations: [], confidence: 0.8, ...overrides };
}

function validAnalysis() {
  return {
    extracted: { name: 'A', email: null, phone: null, location: null, links: [], summaryPresent: true, sectionsFound: ['experience'] },
    structure: baseModule(),
    ats: baseModule(),
    content: baseModule(),
    skills: baseModule({ missingSkills: [] }),
    experience: baseModule(),
    education: baseModule(),
    formatting: baseModule(),
    clarity: { score: 7, confidence: 0.8 },
    completeness: { score: 7, confidence: 0.8 },
    overallImpression: 'Solid CV overall.',
    topPriorityActions: ['Quantify achievements'],
  };
}

function validJobMatch() {
  return {
    jobMatch: {
      score: 8,
      matchPercentage: 72,
      matchingSkills: ['SQL'],
      missingRequirements: ['Kubernetes'],
      relevantExperience: ['3 years backend'],
      weakAreas: [],
      recommendedKeywords: ['CI/CD'],
      recommendations: [],
      confidence: 0.7,
    },
  };
}

describe('validateAnalysis', () => {
  test('accepts a well-formed analysis object', () => {
    expect(validateAnalysis(validAnalysis())).toEqual({ valid: true, errors: [] });
  });

  test('rejects a missing required module', () => {
    const bad = validAnalysis();
    delete bad.ats;
    const { valid, errors } = validateAnalysis(bad);
    expect(valid).toBe(false);
    expect(errors).toContain('ats must be an object');
  });

  test('rejects an out-of-range score', () => {
    const bad = validAnalysis();
    bad.content.score = 15;
    expect(validateAnalysis(bad).valid).toBe(false);
  });

  test('rejects an invalid recommendation priority', () => {
    const bad = validAnalysis();
    bad.structure.recommendations = [{ priority: 'urgent', problem: 'p', reason: 'r', current: null, suggested: 's', action: 'a' }];
    const { valid, errors } = validateAnalysis(bad);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('priority'))).toBe(true);
  });

  test('rejects a non-object response', () => {
    expect(validateAnalysis(null).valid).toBe(false);
    expect(validateAnalysis('nope').valid).toBe(false);
  });
});

describe('validateJobMatch', () => {
  test('accepts a well-formed job match object', () => {
    expect(validateJobMatch(validJobMatch())).toEqual({ valid: true, errors: [] });
  });

  test('rejects a match percentage outside 0-100', () => {
    const bad = validJobMatch();
    bad.jobMatch.matchPercentage = 150;
    expect(validateJobMatch(bad).valid).toBe(false);
  });

  test('rejects missing array fields', () => {
    const bad = { jobMatch: { score: 5, matchPercentage: 50, confidence: 0.5 } };
    const { valid, errors } = validateJobMatch(bad);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });
});
