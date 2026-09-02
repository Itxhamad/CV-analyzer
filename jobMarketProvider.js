/**
 * Job market data is used to enrich results with real, sourced information
 * (e.g. "roles like this are commonly posted requiring X, Y, Z"). Per spec
 * section 19, this must come from legitimate sources -- never
 * unauthorized scraping -- and per section 37, we never fabricate market
 * statistics.
 *
 * This build ships with only a NoOpJobMarketProvider (returns nothing)
 * because wiring a real provider requires a developer's own API
 * credentials for a specific service, which vary by region/plan and can't
 * be responsibly hard-coded here. An AdzunaProvider skeleton is included,
 * commented, as a concrete example of "how to plug one in" using a
 * provider that has a real public API with a free tier.
 *
 * Whatever provider is configured, a failure here must NEVER block CV
 * analysis (spec section 33) -- callers should catch and continue.
 */

class JobMarketProvider {
  async search(/* { title, location, skills } */) {
    throw new Error('JobMarketProvider.search() must be implemented by a subclass');
  }
}

class NoOpJobMarketProvider extends JobMarketProvider {
  async search() {
    return { available: false, postings: [], source: null };
  }
}

/*
// Example skeleton for a real provider. Uncomment and fill in credentials
// via .env (JOB_MARKET_PROVIDER=adzuna, ADZUNA_APP_ID, ADZUNA_APP_KEY) to
// enable. Adzuna is used only as a concrete, legitimate example -- swap
// for whichever licensed job-data API your deployment is entitled to use.
//
// class AdzunaProvider extends JobMarketProvider {
//   async search({ title, location }) {
//     const params = new URLSearchParams({
//       app_id: process.env.ADZUNA_APP_ID,
//       app_key: process.env.ADZUNA_APP_KEY,
//       what: title || '',
//       where: location || '',
//       results_per_page: '10',
//     });
//     const res = await fetch(`https://api.adzuna.com/v1/api/jobs/us/search/1?${params}`);
//     if (!res.ok) throw new Error(`Adzuna API error: ${res.status}`);
//     const data = await res.json();
//     return {
//       available: true,
//       source: 'Adzuna',
//       postings: (data.results || []).map((job) => ({
//         title: job.title,
//         company: job.company?.display_name || null,
//         location: job.location?.display_name || null,
//         url: job.redirect_url,
//       })),
//     };
//   }
// }
*/

function getJobMarketProvider(name) {
  const key = (name || 'none').toLowerCase();
  if (key === 'none' || !key) return new NoOpJobMarketProvider();
  // Extend here as real providers are added (see AdzunaProvider skeleton above).
  console.warn(`[jobMarketProvider] Unknown JOB_MARKET_PROVIDER "${name}", falling back to no-op.`);
  return new NoOpJobMarketProvider();
}

module.exports = { JobMarketProvider, NoOpJobMarketProvider, getJobMarketProvider };
