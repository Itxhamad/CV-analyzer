function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
function isStr(v) {
  return typeof v === 'string';
}
function isStrArray(v) {
  return Array.isArray(v) && v.every(isStr);
}

const VALID_PRIORITIES = new Set(['critical', 'important', 'optional']);

function validateRecommendations(recs, path, errors) {
  if (!Array.isArray(recs)) {
    errors.push(`${path} must be an array`);
    return;
  }
  recs.forEach((r, i) => {
    const p = `${path}[${i}]`;
    if (!r || typeof r !== 'object') { errors.push(`${p} must be an object`); return; }
    if (!VALID_PRIORITIES.has(r.priority)) errors.push(`${p}.priority must be one of critical|important|optional`);
    if (!isStr(r.problem)) errors.push(`${p}.problem must be a string`);
    if (!isStr(r.reason)) errors.push(`${p}.reason must be a string`);
    if (r.current !== null && !isStr(r.current)) errors.push(`${p}.current must be a string or null`);
    if (!isStr(r.suggested)) errors.push(`${p}.suggested must be a string`);
    if (!isStr(r.action)) errors.push(`${p}.action must be a string`);
  });
}

function validateModule(obj, key, errors, { requireRecommendations = true, extraArrayFields = [] } = {}) {
  const mod = obj[key];
  if (!mod || typeof mod !== 'object') {
    errors.push(`${key} must be an object`);
    return;
  }
  if (!isNum(mod.score) || mod.score < 0 || mod.score > 10) errors.push(`${key}.score must be a number 0-10`);
  if (!isNum(mod.confidence) || mod.confidence < 0 || mod.confidence > 1) errors.push(`${key}.confidence must be a number 0-1`);
  if (requireRecommendations) {
    if (!isStrArray(mod.strengths)) errors.push(`${key}.strengths must be a string array`);
    if (!isStrArray(mod.weaknesses)) errors.push(`${key}.weaknesses must be a string array`);
    validateRecommendations(mod.recommendations, `${key}.recommendations`, errors);
  }
  extraArrayFields.forEach((f) => {
    if (!isStrArray(mod[f])) errors.push(`${key}.${f} must be a string array`);
  });
}

function validateAnalysis(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['Response is not a JSON object'] };

  if (!obj.extracted || typeof obj.extracted !== 'object') {
    errors.push('extracted must be an object');
  } else {
    if (!isStrArray(obj.extracted.links)) errors.push('extracted.links must be a string array');
    if (!isStrArray(obj.extracted.sectionsFound)) errors.push('extracted.sectionsFound must be a string array');
    if (typeof obj.extracted.summaryPresent !== 'boolean') errors.push('extracted.summaryPresent must be a boolean');
  }

  ['structure', 'ats', 'content', 'experience', 'education', 'formatting'].forEach((key) =>
    validateModule(obj, key, errors)
  );
  validateModule(obj, 'skills', errors, { extraArrayFields: ['missingSkills'] });

  ['clarity', 'completeness'].forEach((key) => validateModule(obj, key, errors, { requireRecommendations: false }));

  if (!isStr(obj.overallImpression)) errors.push('overallImpression must be a string');
  if (!isStrArray(obj.topPriorityActions)) errors.push('topPriorityActions must be a string array');

  return { valid: errors.length === 0, errors };
}

function validateJobMatch(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || !obj.jobMatch || typeof obj.jobMatch !== 'object') {
    return { valid: false, errors: ['Response must be an object with a jobMatch field'] };
  }
  const jm = obj.jobMatch;
  if (!isNum(jm.score) || jm.score < 0 || jm.score > 10) errors.push('jobMatch.score must be a number 0-10');
  if (!isNum(jm.matchPercentage) || jm.matchPercentage < 0 || jm.matchPercentage > 100) {
    errors.push('jobMatch.matchPercentage must be a number 0-100');
  }
  ['matchingSkills', 'missingRequirements', 'relevantExperience', 'weakAreas', 'recommendedKeywords'].forEach((f) => {
    if (!isStrArray(jm[f])) errors.push(`jobMatch.${f} must be a string array`);
  });
  validateRecommendations(jm.recommendations, 'jobMatch.recommendations', errors);
  if (!isNum(jm.confidence) || jm.confidence < 0 || jm.confidence > 1) errors.push('jobMatch.confidence must be a number 0-1');

  return { valid: errors.length === 0, errors };
}

module.exports = { validateAnalysis, validateJobMatch };
