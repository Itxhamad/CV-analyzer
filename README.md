# AI CV Analyzer

A no-login web app that analyzes an uploaded CV/resume with AI and returns a score, estimated ATS
compatibility, section-by-section feedback, and prioritized recommendations — with an optional job
description for job-match scoring.

Plain HTML/CSS/JS frontend + a Node/Express backend. No build step required.

## 1. Architecture

```
Browser (public/)
   |  HTTPS, fetch/XHR
   v
Express server (server/)
   |
   +-- routes/            HTTP endpoints
   +-- security/          file validation, heuristic scan, rate limiting
   +-- parsers/            PDF/DOCX/TXT -> plain text
   +-- ai/                 provider abstraction (Groq, Gemini) + prompts + orchestration
   +-- schemas/            validates the AI's JSON output before trusting it
   +-- scoring/             computes the trusted overall score (backend logic, not the AI's own number)
   +-- jobMarket/          optional external job-data provider interface (off by default)
   +-- report/             PDF report generation
   +-- storage/            in-memory session/analysis store with TTL auto-delete
```

**Your Groq/Gemini API keys never reach the browser.** They live only in server-side environment
variables and are read only inside `server/ai/groqProvider.js` / `geminiProvider.js`.

### Why one combined AI call instead of 7+ separate ones

The spec's "modular analyzers" (structure, ATS, content, skills, experience, education, formatting)
are implemented as distinct, independently testable prompt sections in `server/ai/prompts.js` and are
validated as distinct fields in `server/schemas/analysisSchema.js` — but at runtime they're sent as
**one** combined request per analysis (plus one more only if a job description is supplied), not 7+
separate API calls. Firing 7+ calls per CV would multiply cost and latency for no real accuracy gain,
and the spec itself says not to send the same CV to multiple providers/calls unnecessarily. If you want
true per-module isolation (e.g. to swap models per module), each prompt in `prompts.js` is already
structured so you can split it into its own `provider.generateText()` call.

## 2. Local setup

Requires Node.js 18+ (uses the built-in global `fetch`).

```bash
npm install
cp .env.example .env
# edit .env and add at least one of GROQ_API_KEY / GEMINI_API_KEY
npm start
# open http://localhost:3000
```

For auto-restart on file changes during development: `npm run dev` (uses nodemon).

## 3. Getting API keys

- **Groq**: console.groq.com → API Keys. Free tier available. Set `GROQ_API_KEY` and optionally
  `GROQ_MODEL` (check Groq's current model list — model names are periodically retired/renamed).
- **Gemini**: aistudio.google.com/apikey. Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL`.

Set `AI_PROVIDER=groq` or `AI_PROVIDER=gemini` to choose which is tried first. If
`AI_FALLBACK_ENABLED=true` (default) and the first provider fails, the other is tried automatically —
only on failure, never as a duplicate "just in case" call.

**Rotate any key that has ever been pasted into a chat, ticket, or shared document before using it in
production.** Never commit `.env`.

## 4. Environment variables

See `.env.example` for the full list with defaults. Key ones:

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` | `groq` or `gemini` — tried first |
| `GROQ_API_KEY` / `GEMINI_API_KEY` | Server-side only, never sent to the browser |
| `MAX_FILE_SIZE` | Upload size limit in bytes (default 10MB) |
| `CV_RETENTION_MINUTES` | How long an uploaded file + analysis lives before auto-deletion (default 30) |
| `JOB_MARKET_PROVIDER` | `none` by default — see section 8 |
| `CORS_ORIGIN` | Set to your real frontend origin in production, not `*` |

## 5. API endpoints

```
GET    /api/health                 basic status check
POST   /api/cv/upload              multipart file upload -> { sessionId, ... }
DELETE /api/cv/:sessionId          immediately delete a session's file + text
POST   /api/cv/analyze             { sessionId, jobDescription?, ...optionalInfo } -> full analysis
GET    /api/analysis/:analysisId   re-fetch a previous (unexpired) analysis
POST   /api/job-match              { sessionId, analysisId?, jobDescription } -> add/update job match
POST   /api/report/pdf             { analysisId } -> streams a PDF
GET    /api/report/json/:id        -> downloads the raw JSON report
```

## 6. Security implemented

- MIME + extension whitelist **and** magic-byte verification (rejects a `.exe` renamed to `.pdf`)
- Double-extension tricks (`resume.pdf.exe`) explicitly blocked
- 10MB size limit (configurable), empty-file rejection
- Files stored under `crypto.randomUUID()` names, never the original filename, never publicly served
- Automatic deletion of uploaded files + extracted text after `CV_RETENTION_MINUTES`, plus an
  immediate delete endpoint and a startup sweep for orphaned files from a crashed process
- `helmet` security headers + a restrictive CSP, `cors`, JSON body size limit
- Two-tier rate limiting: general traffic + a stricter limiter on upload/analyze specifically
  (`server/security/rateLimiters.js`), keyed by IP + an anonymous client-generated session id
- Prompt-injection mitigation: CV text and job descriptions are wrapped in explicit "this is
  untrusted data" delimiters in every prompt, with an explicit system instruction to never treat
  their contents as commands (see `server/ai/prompts.js`)
- AI output is never trusted as-is: it's JSON-parsed, schema-validated
  (`server/schemas/analysisSchema.js`), and given **one** repair retry before falling back to the
  other provider

### What's intentionally out of scope in this build (and how to add it)

Being upfront here matters more than pretending these are done:

- **Malware scanning**: `server/security/malwareScan.js` does heuristic checks (embedded
  PDF JavaScript/Launch actions, Office macro markers) — it is **not** a real antivirus engine.
  Wire in [`clamscan`](https://www.npmjs.com/package/clamscan) against a ClamAV daemon, or a cloud AV
  API, at the marked extension point before accepting untrusted uploads in production.
- **OCR for scanned/image CVs**: JPG/PNG uploads and text-less scanned PDFs are rejected with a clear
  message rather than silently producing garbage analysis. To add OCR, install `tesseract.js` and call
  it from `server/parsers/documentParser.js` where image files are currently rejected.
- **Legacy `.doc` (pre-2007 binary Word format)**: rejected with a clear message asking for `.docx`/`.pdf`
  instead, since there's no reliable dependency-free parser for the old binary format.
- **Real external job-market data**: `server/jobMarket/jobMarketProvider.js` ships only a no-op
  provider plus a commented example (`AdzunaProvider`) showing how to plug in a real, licensed job-data
  API. No market statistics are ever fabricated — job-market enrichment is simply absent until you
  configure a real provider.
- **Persistent database**: sessions/analyses live in an in-memory `Map` (see `server/storage/store.js`)
  with the exact same interface a Redis-backed version would have. This is intentional data
  minimization (nothing outlives the process + retention window), but means analyses don't survive a
  server restart and won't work across multiple server instances without swapping this module for
  Redis.

## 7. Testing

```bash
npm test
```

Covers: scoring-engine weighting math (including the no-job-description weight redistribution),
AI-output schema validation (valid/invalid cases), file-upload security validation (disguised files,
double extensions, oversized files), and document text extraction. These are unit tests against pure
functions — they don't call the real Groq/Gemini APIs (no API keys are required to run them).

## 8. Adding real job-market data

1. Pick a licensed job-search API you're entitled to use.
2. Implement a class extending `JobMarketProvider` in `server/jobMarket/jobMarketProvider.js` (the
   commented `AdzunaProvider` skeleton shows the shape).
3. Register it in `getJobMarketProvider()` and set `JOB_MARKET_PROVIDER` in `.env`.
4. Wire a call to it into `server/routes/analysis.js` where you want it to enrich results — keep it
   wrapped in try/catch so a provider outage never blocks CV analysis itself.

## 9. Deploying

Any host that runs a persistent Node process works (Render, Railway, Fly.io, a plain VPS, etc.).
Steps:

1. Push this repo to GitHub (see section 10).
2. Create a new web service on your host, pointing at the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Set environment variables in the host's dashboard (never commit `.env`): at minimum
   `GROQ_API_KEY` and/or `GEMINI_API_KEY`, and `CORS_ORIGIN` set to your deployed URL.
5. Ensure the platform terminates HTTPS (most PaaS hosts do this automatically).
6. Confirm the health check: `GET https://your-domain/api/health`.
7. Upload a test CV end-to-end and confirm an analysis comes back.
8. **Verify no API key exposure** (see section 11) before treating it as production-ready.

There's no database to provision for the default in-memory store. If you swap in Redis for
multi-instance deployments, provision it and point `server/storage/store.js` at it.

## 10. Pushing to GitHub

```bash
cd ai-cv-analyzer
git init
git add .
git commit -m "Initial commit: AI CV Analyzer"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

`.gitignore` already excludes `node_modules/`, `.env`, and the `tmp/` upload directory contents, so
your API keys and any uploaded files never get committed.

## 11. Before going to production: API-key exposure checklist

- [ ] View page source and the JS bundle in the browser — no `GROQ_API_KEY` / `GEMINI_API_KEY` string
      anywhere
- [ ] Check the Network tab for every request the frontend makes — no key in headers, query strings, or
      response bodies
- [ ] Check `localStorage`/`sessionStorage` in devtools — only the anonymous session UUID should be
      there, never a provider key
- [ ] `GET /api/health` and every other endpoint response — confirm no key is ever echoed back
- [ ] `.env` is not committed (`git status` should not show it; `.gitignore` already covers it)

## 12. Troubleshooting

- **"No AI provider API keys are set" warning on startup**: add `GROQ_API_KEY` and/or
  `GEMINI_API_KEY` to `.env` and restart.
- **Analysis fails immediately**: check the server logs — a schema-validation or provider error message
  is logged with detail; the browser only sees a safe, generic message.
- **"No selectable text was found in this PDF"**: the PDF is likely a scanned image; OCR isn't enabled
  in this build (see section 6).
- **Uploads rejected as "contents do not match extension"**: the file is genuinely corrupted, or was
  renamed from a different format — re-export it and try again.
- **Rate limited during testing**: `RATE_LIMIT_HEAVY_MAX` in `.env` caps upload/analyze requests per
  15-minute window per session; raise it for local testing.
