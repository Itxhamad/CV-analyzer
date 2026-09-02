(() => {
  'use strict';

  // ---------- Anonymous session id (not authentication; used only for
  // basic per-client rate-limit bucketing, see server/security/rateLimiters.js) ----------
  function getAnonId() {
    let id = localStorage.getItem('cvAnalyzerAnonId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('cvAnalyzerAnonId', id);
    }
    return id;
  }
  const ANON_ID = getAnonId();

  const state = {
    file: null,
    sessionId: null,
    analysisId: null,
    result: null,
  };

  // ---------- View management ----------
  const views = ['landing', 'upload', 'optional-info', 'processing', 'results'];
  function showView(name) {
    views.forEach((v) => {
      document.getElementById(`view-${v}`).classList.toggle('hidden', v !== name);
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function showGlobalError(message) {
    const el = document.getElementById('global-error');
    el.textContent = message;
    el.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function clearGlobalError() {
    document.getElementById('global-error').classList.add('hidden');
  }
  function showInlineError(elId, message) {
    const el = document.getElementById(elId);
    el.textContent = message;
    el.classList.remove('hidden');
  }
  function clearInlineError(elId) {
    document.getElementById(elId).classList.add('hidden');
  }

  async function apiFetch(path, options = {}) {
    const headers = Object.assign({ 'X-Session-Id': ANON_ID }, options.headers || {});
    const res = await fetch(path, Object.assign({}, options, { headers }));
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (body && body.error) message = body.error;
      } catch (_) { /* non-JSON error body */ }
      throw new Error(message);
    }
    return res;
  }

  // ---------- Landing ----------
  document.getElementById('btn-start').addEventListener('click', () => showView('upload'));

  // ---------- Upload ----------
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const btnBrowse = document.getElementById('btn-browse');
  const fileInfo = document.getElementById('file-info');
  const fileNameEl = document.getElementById('file-name');
  const fileMetaEl = document.getElementById('file-meta');
  const progressTrack = document.getElementById('upload-progress-track');
  const progressFill = document.getElementById('upload-progress-fill');
  const btnContinue = document.getElementById('btn-continue-to-info');

  const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.txt'];
  const MAX_SIZE = 10 * 1024 * 1024;

  btnBrowse.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); })
  );
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelected(e.target.files[0]);
  });

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function extOf(filename) {
    const i = filename.lastIndexOf('.');
    return i === -1 ? '' : filename.slice(i).toLowerCase();
  }

  function handleFileSelected(file) {
    clearInlineError('upload-error');
    const ext = extOf(file.name);
    if (!ALLOWED_EXT.includes(ext)) {
      showInlineError('upload-error', `Unsupported file type "${ext || 'unknown'}". Please upload a PDF, DOC, DOCX, or TXT file.`);
      return;
    }
    if (file.size > MAX_SIZE) {
      showInlineError('upload-error', `File is too large (${formatSize(file.size)}). Maximum size is 10 MB.`);
      return;
    }

    state.file = file;
    fileNameEl.textContent = file.name;
    fileMetaEl.textContent = `${formatSize(file.size)} · ${ext.slice(1).toUpperCase()}`;
    fileInfo.classList.remove('hidden');
    btnContinue.disabled = true;

    uploadFile(file);
  }

  function uploadFile(file) {
    progressTrack.classList.remove('hidden');
    progressFill.style.width = '0%';

    const formData = new FormData();
    formData.append('cv', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/cv/upload');
    xhr.setRequestHeader('X-Session-Id', ANON_ID);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        progressFill.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
      }
    });

    xhr.addEventListener('load', () => {
      let body;
      try { body = JSON.parse(xhr.responseText); } catch (_) { body = null; }

      if (xhr.status >= 200 && xhr.status < 300 && body) {
        state.sessionId = body.sessionId;
        progressFill.style.width = '100%';
        btnContinue.disabled = false;
      } else {
        const message = (body && body.error) || 'Upload failed. Please try again.';
        showInlineError('upload-error', message);
        resetFileSelection();
      }
    });

    xhr.addEventListener('error', () => {
      showInlineError('upload-error', 'Upload failed due to a network error. Please try again.');
      resetFileSelection();
    });

    xhr.send(formData);
  }

  function resetFileSelection() {
    state.file = null;
    state.sessionId = null;
    fileInfo.classList.add('hidden');
    progressTrack.classList.add('hidden');
    fileInput.value = '';
    btnContinue.disabled = true;
  }

  document.getElementById('btn-remove').addEventListener('click', async () => {
    if (state.sessionId) {
      apiFetch(`/api/cv/${state.sessionId}`, { method: 'DELETE' }).catch(() => {});
    }
    resetFileSelection();
  });
  document.getElementById('btn-replace').addEventListener('click', () => fileInput.click());
  document.getElementById('btn-back-to-landing').addEventListener('click', () => showView('landing'));
  btnContinue.addEventListener('click', () => showView('optional-info'));

  // ---------- Optional info ----------
  const infoForm = document.getElementById('optional-info-form');
  document.getElementById('btn-back-to-upload').addEventListener('click', () => showView('upload'));
  document.getElementById('btn-skip-analyze').addEventListener('click', () => runAnalysis({}));
  document.getElementById('btn-analyze').addEventListener('click', () => {
    const formData = new FormData(infoForm);
    const payload = {};
    for (const [key, value] of formData.entries()) payload[key] = value;
    runAnalysis(payload);
  });

  // ---------- Processing steps ----------
  function setStep(id, status) {
    const el = document.getElementById(id);
    el.classList.remove('active', 'done');
    if (status) el.classList.add(status);
  }

  async function runAnalysis(formPayload) {
    clearInlineError('analyze-error');
    if (!state.sessionId) {
      showInlineError('analyze-error', 'Your file upload session has expired. Please upload your CV again.');
      showView('upload');
      return;
    }

    showView('processing');
    // Upload + parsing already completed during the upload step -- reflect
    // that truthfully instead of re-animating fake progress for it.
    setStep('step-upload', 'done');
    setStep('step-parse', 'done');
    setStep('step-analyze', 'active');
    setStep('step-score', null);

    const { jobDescription, ...optionalInfo } = formPayload;

    try {
      const res = await apiFetch('/api/cv/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId, jobDescription, ...optionalInfo }),
      });
      setStep('step-analyze', 'done');
      setStep('step-score', 'done');
      const result = await res.json();
      state.analysisId = result.analysisId;
      state.result = result;
      renderResults(result);
      showView('results');
    } catch (err) {
      showView('optional-info');
      showInlineError('analyze-error', err.message || 'Analysis failed. Please try again.');
    }
  }

  // ---------- Results rendering ----------
  function scoreColorVar(score) {
    if (score <= 4) return 'var(--weak)';
    if (score <= 6) return 'var(--average)';
    return 'var(--good)';
  }

  const PRIORITY_ORDER = { critical: 0, important: 1, optional: 2 };
  const MODULE_TITLES = {
    structure: 'Structure', ats: 'ATS Compatibility', content: 'Content Quality',
    skills: 'Skills', experience: 'Experience', education: 'Education', formatting: 'Formatting',
  };

  function renderResults(result) {
    document.getElementById('score-num').textContent = result.overallScore;
    document.getElementById('score-num').style.color = scoreColorVar(result.overallScore);
    document.getElementById('score-label').textContent = result.label;
    document.getElementById('overall-impression').textContent = result.analysis.overallImpression || '';

    // Breakdown
    const grid = document.getElementById('breakdown-grid');
    grid.innerHTML = '';
    result.breakdown
      .filter((b) => b.score !== null && b.score !== undefined)
      .forEach((b) => {
        const card = document.createElement('div');
        card.className = 'breakdown-card';
        card.innerHTML = `<div class="b-label">${b.label}</div><div class="b-score" style="color:${scoreColorVar(b.score)}">${b.score}/10</div>`;
        grid.appendChild(card);
      });

    // Top priority actions
    const topActions = document.getElementById('top-actions');
    topActions.innerHTML = '';
    (result.analysis.topPriorityActions || []).forEach((a) => {
      const li = document.createElement('li');
      li.textContent = a;
      topActions.appendChild(li);
    });

    // Module accordion
    const accordion = document.getElementById('module-accordion');
    accordion.innerHTML = '';
    Object.keys(MODULE_TITLES).forEach((key) => {
      const mod = result.analysis[key];
      if (!mod) return;
      const details = document.createElement('details');
      const strengthsHtml = (mod.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('');
      const weaknessesHtml = (mod.weaknesses || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('');
      details.innerHTML = `
        <summary>${MODULE_TITLES[key]} — ${mod.score}/10</summary>
        <div class="accordion-body">
          ${strengthsHtml ? `<h4>Strengths</h4><ul>${strengthsHtml}</ul>` : ''}
          ${weaknessesHtml ? `<h4>Weaknesses</h4><ul>${weaknessesHtml}</ul>` : ''}
        </div>`;
      accordion.appendChild(details);
    });

    // Recommendations (merged across modules + job match, sorted by priority)
    const allRecs = [];
    Object.keys(MODULE_TITLES).forEach((key) => {
      const mod = result.analysis[key];
      (mod?.recommendations || []).forEach((r) => allRecs.push({ ...r, source: MODULE_TITLES[key] }));
    });
    if (result.jobMatch) {
      (result.jobMatch.recommendations || []).forEach((r) => allRecs.push({ ...r, source: 'Job Match' }));
    }
    allRecs.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3));

    const recsEl = document.getElementById('recommendations');
    recsEl.innerHTML = '';
    allRecs.forEach((r) => {
      const div = document.createElement('div');
      div.className = `rec-card ${r.priority}`;
      div.innerHTML = `
        <div class="rec-priority">${r.priority} · ${escapeHtml(r.source)}</div>
        <p class="rec-problem">${escapeHtml(r.problem)}</p>
        <p class="rec-field"><b>Why it matters</b>${escapeHtml(r.reason)}</p>
        ${r.current ? `<p class="rec-field"><b>Current</b>${escapeHtml(r.current)}</p>` : ''}
        <p class="rec-field"><b>Suggested</b>${escapeHtml(r.suggested)}</p>
        <p class="rec-field"><b>Action</b>${escapeHtml(r.action)}</p>
      `;
      recsEl.appendChild(div);
    });

    // Job match section
    renderJobMatch(result.jobMatch);
  }

  function renderJobMatch(jobMatch) {
    const section = document.getElementById('job-match-section');
    if (!jobMatch) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    document.getElementById('match-percent').textContent = `${Math.round(jobMatch.matchPercentage)}%`;
    const details = document.getElementById('job-match-details');
    details.innerHTML = `
      ${jobMatch.matchingSkills?.length ? `<p class="rec-field"><b>Matching skills</b>${escapeHtml(jobMatch.matchingSkills.join(', '))}</p>` : ''}
      ${jobMatch.missingRequirements?.length ? `<p class="rec-field"><b>Missing requirements</b>${escapeHtml(jobMatch.missingRequirements.join(', '))}</p>` : ''}
      ${jobMatch.recommendedKeywords?.length ? `<p class="rec-field"><b>Recommended keywords</b>${escapeHtml(jobMatch.recommendedKeywords.join(', '))}</p>` : ''}
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // ---------- Add job description after the fact ----------
  document.getElementById('btn-toggle-add-job').addEventListener('click', () => {
    document.getElementById('add-job-form').classList.toggle('hidden');
  });
  document.getElementById('btn-run-job-match').addEventListener('click', async () => {
    const jobDescription = document.getElementById('add-job-textarea').value.trim();
    if (!jobDescription) return;
    const btn = document.getElementById('btn-run-job-match');
    btn.disabled = true;
    btn.textContent = 'Matching…';
    try {
      const res = await apiFetch('/api/job-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId, analysisId: state.analysisId, jobDescription }),
      });
      const data = await res.json();
      state.result.jobMatch = data.jobMatch;
      if (data.merged) {
        state.result.overallScore = data.overallScore;
        state.result.label = data.label;
        state.result.breakdown = data.breakdown;
      }
      renderResults(state.result);
      document.getElementById('add-job-form').classList.add('hidden');
    } catch (err) {
      showGlobalError(err.message || 'Job match failed. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Match Against This Job';
    }
  });

  // ---------- Downloads ----------
  document.getElementById('btn-download-pdf').addEventListener('click', async () => {
    try {
      const res = await apiFetch('/api/report/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: state.analysisId }),
      });
      const blob = await res.blob();
      downloadBlob(blob, 'cv-analysis-report.pdf');
    } catch (err) {
      showGlobalError(err.message || 'Could not generate the PDF report.');
    }
  });

  document.getElementById('btn-download-json').addEventListener('click', async () => {
    try {
      const res = await apiFetch(`/api/report/json/${state.analysisId}`);
      const blob = await res.blob();
      downloadBlob(blob, 'cv-analysis-report.json');
    } catch (err) {
      showGlobalError(err.message || 'Could not generate the JSON report.');
    }
  });

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- Start over ----------
  document.getElementById('btn-start-over').addEventListener('click', async () => {
    if (state.sessionId) {
      apiFetch(`/api/cv/${state.sessionId}`, { method: 'DELETE' }).catch(() => {});
    }
    state.file = null;
    state.sessionId = null;
    state.analysisId = null;
    state.result = null;
    resetFileSelection();
    infoForm.reset();
    clearGlobalError();
    showView('landing');
  });
})();
