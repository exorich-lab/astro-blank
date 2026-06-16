---
name: bing-webmaster-api
description: Use Bing Webmaster API key credentials for verified-site workflows, URL submission, quotas, sitemap/indexing support, and Bing-related launch tasks in this starter.
---

# Bing Webmaster API

Use this skill when the user asks about Bing Webmaster Tools, Bing site verification, Bing sitemaps, URL submission, IndexNow/Bing indexing, Bing rank/traffic data, or Bing keyword research workflow.

## Local Source Of Truth

- CLI: `scripts/bing-webmaster.mjs`
- Secret: `/Users/sergejapetenok/credentials/bing-webmaster.json`
- Plans/reports: `/Users/sergejapetenok/credentials/astro-blank/bing/plans`
- API cache: `/Users/sergejapetenok/credentials/astro-blank/bing/cache`
- Config auth type: `apiKey`

## Commands

```bash
make bing-sites
make bing-quota DOMAIN=https://example.com
make bing-submit-url DOMAIN=https://example.com URL=https://example.com/page
make bing-keyword KEYWORD="essay writing service" COUNTRY=us LANGUAGE=en-US
make bing-related-keywords KEYWORD="essay writing service" COUNTRY=us LANGUAGE=en-US
make bing-research KEYWORD="essay writing service" DEPTH=2 PER_SEED=15 LIMIT=100
make bing-clusters KEYWORD="essay writing service" DEPTH=2 PER_SEED=15 LIMIT=100
make bing-site-plan KEYWORD="essay writing service" DAYS=30 DEPTH=2 PER_SEED=20 LIMIT=300
make bing-site-plan KEYWORD="essay writing service" SEED_PLAN=essay-writing-affiliate-seed-plan.json DAYS=30 DEPTH=2 PER_SEED=20 LIMIT=300
make bing-site-plan KEYWORD="essay writing service" SEED_PLAN=essay-writing-affiliate-seed-plan.json DAYS=30 DEPTH=2 PER_SEED=10 LIMIT=300 SEED_LIMIT=40 MAX_REQUESTS=30 DELAY_MS=500 STATS_DELAY_MS=500 THROTTLE_DELAY_MS=60000
make bing-plans
make bing-query-stats DOMAIN=https://example.com
make bing-page-stats DOMAIN=https://example.com
```

Direct commands:

```bash
npm run bing:sites
npm run bing:quota -- --site https://example.com
npm run bing:submit-url -- --site https://example.com --url https://example.com/page
npm run bing:submit-urls -- --site https://example.com --urls https://example.com/a,https://example.com/b
npm run bing:keyword-stats -- --keyword "essay writing service" --country us --language en-US
npm run bing:related-keywords -- --keyword "essay writing service" --country us --language en-US
npm run bing:keyword-research -- --seeds "essay writing service,write my essay" --depth 2 --per-seed 10 --limit 100
npm run bing:keyword-clusters -- --seeds "essay writing service,write my essay" --depth 2 --per-seed 10 --limit 100
npm run bing:keyword-site-plan -- --keyword "essay writing service" --days 30 --depth 2 --per-seed 20 --limit 300
npm run bing:plans
npm run bing:query-stats -- --site https://example.com
npm run bing:page-stats -- --site https://example.com
npm run bing:add-site -- --site https://example.com
npm run bing:keyword-config
```

## MCP vs Local CLI

Use `search-console-mcp` when its Bing tools are available and already authenticated.

Use the local CLI when:

- the MCP does not see the Bing account
- the task must read `/Users/sergejapetenok/credentials/bing-webmaster.json`
- the workflow needs deterministic automation in scripts/CI
- you need to verify that the API key works

Do not try to force `search-console-mcp` to read the local Bing JSON unless its upstream docs explicitly support that config. The local CLI is the reliable project-owned layer.

## Keyword Research

Bing Webmaster API can collect two kinds of keyword data:

- Multi-pass research before a new site exists: `make bing-research KEYWORD="essay writing service" DEPTH=2 PER_SEED=15 LIMIT=100`.
- Full anti-cannibalization clustering before a new site exists: `make bing-clusters KEYWORD="essay writing service" DEPTH=2 PER_SEED=15 LIMIT=100`.
- Full HTML site planning report before a new site exists: `make bing-site-plan KEYWORD="essay writing service" DAYS=30 DEPTH=2 PER_SEED=20 LIMIT=300`.
- Seed keyword stats before a new site exists: `make bing-keyword KEYWORD="essay writing service" COUNTRY=us LANGUAGE=en-US`.
- Related keyword collection before a new site exists: `make bing-related-keywords KEYWORD="essay writing service" COUNTRY=us LANGUAGE=en-US`.
- Real verified-site search data after launch: `make bing-query-stats DOMAIN=https://example.com` and `make bing-page-stats DOMAIN=https://example.com`.

Seed keyword stats depend on Bing data availability for the country/language pair. Some narrow terms may return an empty response.
Use `bing-site-plan` for actual site preparation because it expands multiple related phrases, filters obvious noise, groups terms into page-level clusters, chooses a primary keyword per page, adds a cannibalization rule, and writes a readable HTML report to `/Users/sergejapetenok/credentials/astro-blank/bing/plans`. Before running it for a serious site, the agent must create a niche-specific seed-plan JSON from reasoning, not from hardcoded script lists. Include `clusterRules` when a broad branch must split into separate pages, for example homework by subject or service type. For affiliate/commercial topics, treat money pages as the base of the site and keep informational/tool clusters only when they have a clear funnel bridge to an offer or service decision.

## Stored Plan Library

Treat `/Users/sergejapetenok/credentials/astro-blank/bing/plans` as a reusable research library, not as disposable output.

Before starting keyword research for a new site:

1. Run `make bing-plans` or inspect the plans folder.
2. Compare the requested niche, country, language, and business model with existing seed-plan JSON and HTML reports.
3. If a close match exists, read the existing plan/report first and tell the user whether it can be reused as-is, should be expanded with a branch seed-plan, or is stale/irrelevant.
4. Prefer expanding an existing relevant plan over starting from zero, because it preserves prior research, avoids duplicate API calls, and reduces Bing throttling.
5. Start a fresh plan only when no stored plan matches the new site's topic/market/model.

When expanding a stored plan, create a new branch seed-plan in the same plans folder and name it clearly, for example `gambling-canada-slots-branch-seed-plan.json`, then write the new HTML report back to the same folder.

For casino/slots affiliate research, seed-plans may include `gameTitles`. These are not page titles; they are discovery hypotheses. The CLI automatically checks the pure game name plus buyer variants such as `online`, `casino`, `review`, `bonus`, `real money`, and detected country hints. Use this when broad demand suggests a game-title branch, because real players often search the slot name without adding the word `slot`.

If a report contains a high-volume thin cluster, create a branch seed-plan and rerun that branch. Do not stop after finding one high-volume keyword. Bing responses are cached under `/Users/sergejapetenok/credentials/astro-blank/bing/cache`; avoid repeated broad runs because Bing may throttle the API.

Rate-limit broad keyword research:

- Microsoft documents URL submission quotas, but does not publish a fixed official RPS limit for Bing keyword research endpoints.
- Use fast normal pacing and throttle-aware backoff instead of sleeping for several seconds on every request.
- `DELAY_MS` controls pauses between `GetRelatedKeywords` expansion requests. Default: `500`.
- `STATS_DELAY_MS` controls pauses between `GetKeywordStats` seed checks. Default: `500`.
- `SEED_LIMIT` limits how many planned seed phrases are checked in broad site-plan runs.
- `RETRY_COUNT`, `RETRY_DELAY_MS`, `THROTTLE_DELAY_MS`, and `REQUEST_TIMEOUT_MS` control API retry/backoff behavior. `Retry-After` response headers are respected when Bing sends them.
- If the API returns `ThrottleUser`, reduce `SEED_LIMIT`/`MAX_REQUESTS`/`PER_SEED`, wait for the throttle window, and reuse `/Users/sergejapetenok/credentials/astro-blank/bing/cache`; do not immediately rerun the same wide crawl.

For a new global/Bing-oriented site:

1. Run `make bing-plans` and review existing reports/seed-plans.
2. Reuse or expand the closest relevant stored plan when possible.
3. Use `make bing-site-plan` only after deciding whether the stored plan is enough or needs expansion.
4. Use the returned `mainKeyword` and `mainPage` for the homepage or primary money page. The main page slug is always `/`; never create a separate internal URL for `mainPage`.
5. Use every returned `cluster` as one page candidate. Keep all `secondaryKeywords` on that same page unless the intent is clearly different.
6. Combine the main keyword with domain ideation and Regway availability checks.
7. Use the local CLI after launch to list sites, submit URLs, and check quotas.
8. Use verified-site data later for rank/traffic and query analysis.

## Safety

Never print API keys. When checking credentials, print only key presence/length.
