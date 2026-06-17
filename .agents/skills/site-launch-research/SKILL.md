---
name: site-launch-research
description: End-to-end preparation workflow for creating a new website from a topic or niche: keyword research, page strategy, domain ideation, Regway availability/price checks, user domain selection, Cloudflare setup, Hestia deployment, and production launch safeguards.
---

# Site Launch Research

Use this skill when the user says they want to create a site on a topic, niche, offer, or keyword, for example: "I want to make a site about essay writing service".

## Goal

Turn a raw site idea into a launch-ready production plan and, after explicit user approval, execute domain and infrastructure setup through Regway, Cloudflare, and Hestia.

## Required Workflow

1. Clarify the target market only if it is missing and materially changes keyword/domain choices:
   - country or language
   - commercial intent
   - lead-gen, affiliate, local service, SaaS, content site, or ecommerce

2. Research keywords:
   - Before new API collection, inspect the stored research library in `/Users/sergejapetenok/credentials/astro-blank/bing/plans` with `make bing-plans`.
   - If an existing plan matches the niche, country, language, and business model, read it first and propose one of three paths: reuse it, expand a specific branch, or create a fresh plan.
   - Prefer expanding a relevant stored plan over starting from zero.
   - Use available keyword/data tools that match the target search market.
   - Do not use Yandex Wordstat/API unless the site is explicitly targeting Yandex, Russian-language search demand, Russia, or CIS markets.
   - For a brand-new site with no search data, use seed-keyword research sources first: Bing Webmaster Tools Keyword Research for Bing/global workflows, and Wordstat/API only for Yandex-relevant workflows.
   - Use Search Console/Bing site performance MCP for already verified sites with impressions, clicks, rank, sitemap, or cannibalization data.
   - Group keywords by intent: homepage, money pages, supporting pages, FAQ/articles.
   - Identify the primary homepage keyword.
   - After important keywords are selected, run SERP competitor research for the main keyword and priority money-page keywords: `make serp-competitors KEYWORD="..." SERP_MARKET=US LANGUAGE=en-US TOP=10` or `make serp-plan-competitors SEED_PLAN=plan.json KEYWORD_LIMIT=3 TOP=10`.
   - Use competitor output to inspect real page titles, H1s, meta descriptions, raw HTML, robots.txt, and sitemap URLs before writing our own metadata or page structure.

3. Build initial site strategy:
   - homepage positioning
   - homepage slug is always `/`, even when the primary keyword is long
   - main commercial pages
   - support content clusters
   - conversion action
   - trust/proof requirements

4. Generate domain candidates:
   - Prefer short, brandable, readable domains.
   - Include exact/partial keyword domains only when they still look trustworthy.
   - Avoid spammy hyphenated or over-optimized names unless the user explicitly wants them.

5. Check domains through Regway:
   ```bash
   make domain-check DOMAIN=example.com
   make domain-price DOMAIN=example.com
   ```

6. Present a short domain shortlist to the user:
   - domain
   - availability
   - estimated first-year price
   - why it fits the niche
   - risks, if any

7. Stop and ask the user to choose a domain before any paid action.

8. After explicit approval:
   - run Regway sandbox purchase test if needed
   - perform live Regway registration only when the user explicitly confirms the exact domain
   - configure Cloudflare zone/DNS/SSL/HTTPS/redirects/cache using `cloudflare-api` MCP
   - create/check Hestia domain
   - update `site.config.json` domain
   - deploy production site
   - add/verify the production domain in Bing Webmaster Tools and submit sitemap after the site is live

## Payment Safety

Never buy a domain automatically from a raw topic request. Domain purchase requires:

- availability check
- price check
- user choosing one exact domain
- user explicitly confirming purchase
- Regway live safeguards from `regway-domain-api`

## Cloudflare Context Rule

Do not load or use Cloudflare MCP until a domain has been selected or Cloudflare account state is explicitly needed. Keep keyword/domain research lightweight first.

## Bing Keyword Research Rule

Bing Webmaster Tools has a Keyword Research tool that can be useful before a new site has traffic. Treat it as a seed-keyword research source, not as site performance data.

When Bing keyword stats are requested with a target `COUNTRY` and `LANGUAGE`, treat the returned impressions as regional demand even if the keyword text does not contain the country name. For example, `online pokies` checked with `COUNTRY=au LANGUAGE=en-AU` is Australian demand and can be a better homepage keyword than `online pokies australia`. Do not downgrade or reject generic money keywords just because they lack a market suffix.

Stored Bing plans are part of the research workflow. The folder `/Users/sergejapetenok/credentials/astro-blank/bing/plans` contains prior seed-plan JSON files and HTML reports. When a user asks for a new site, check this folder first. If there is already a close report, summarize what it covers, whether its homepage cluster and money pages are usable, and what branch should be expanded next. Do not rerun broad Bing collection until the existing plan has been reviewed.

Current `search-console-mcp` Bing tools are mainly for verified-site workflows: sites, sitemaps, rank/traffic stats, and cannibalization. If keyword research is not exposed by the MCP toolset, use Bing Webmaster UI/manual export or another available keyword API, then continue the same clustering/page-map workflow.

After the site is deployed, verify the domain in Bing Webmaster Tools and submit `sitemap-index.xml` so future launches can use real query/rank data.

## SERP Competitor Research Rule

The local SERP microservice is configured in `/Users/sergejapetenok/credentials/astro-blank/serp/sites-api.json`.

Use `scripts/serp-competitors.mjs` through Makefile commands:

```bash
make serp-competitors KEYWORD="online pokies chooser" SERP_MARKET=US LANGUAGE=en-US TOP=10
make serp-plan-competitors SEED_PLAN=gambling-canada-affiliate-seed-plan.json KEYWORD_LIMIT=3 TOP=10
```

Outputs are stored outside the repository in `/Users/sergejapetenok/credentials/astro-blank/serp/competitors`.

For each keyword, the tool calls `POST /api/serp/sites`, fetches top competitor pages with browser-like headers, saves raw HTML, extracts title/H1/meta description, fetches robots.txt, and samples sitemap URLs. Use this data as competitive evidence for metadata, page structure, and semantic expansion.

For deeper expansion, run:

```bash
make serp-sitemaps RUN_DIR=/path/to/run
make serp-plan-validate-expansion RUN_DIR=/path/to/run SEED_PLAN=plan.json COUNTRY=au LANGUAGE=en-AU MARKET_LABEL=australia
make serp-plan-competitor-meta REPORT=bing-keyword-plan-topic.html SERP_MARKET=AU LANGUAGE=en-AU TOP=10
```

This parses competitor robots.txt and sitemap files into a raw URL corpus plus keyword/page-family ideas. Treat sitemap output as hypotheses, not final pages. Store the full sitemap idea pool by default (`IDEA_LIMIT=0`); do not truncate research data just to make the report shorter. `keyword-ideas.json` and `sitemap-expansion.json` are the reusable corpus, while `top-keyword-ideas.json` is only a preview. The validation step must select traffic checks from the full pool with scoring and type diversification, expand selected hypotheses into multiple search variants, check Bing exact/broad impressions, reject underqualified generic terms, and write validated clusters into a new seed-plan. `MAX_IDEAS` is the Bing validation budget, not a storage limit. Add a new page cluster only when at least two signals agree: keyword demand, SERP competitors, recurring sitemap pattern, or a clear commercial/trust role.

After the final HTML plan exists, collect competitor metadata for every primary cluster keyword. Use the injected competitor section to design page titles, H1s, meta descriptions, first-screen positioning, comparison sections, and proof/objection handling.

## Yandex/Wordstat Rule

Use `wordstat-api` only for projects where Yandex demand is relevant:

- Russian-language sites
- Russia/CIS target markets
- user explicitly asks for Yandex/Wordstat/Dzen

For English, US, EU, or global Google/Bing-oriented sites, do not use Yandex/Wordstat API by default. Use Bing Keyword Research, Google/SEO sources, and market-relevant SERP research instead.

## Output Shape Before Purchase

Use this structure:

```text
Primary keyword:
Recommended site angle:
Initial page map:
Domain shortlist:
Recommended option:
Next action:
```

## Production Setup After Purchase

For Cloudflare + Hestia:

- apex `A` record points to Hestia server IP
- `www` is CNAME or redirect based on canonical domain
- SSL/TLS mode is `Full`; use `Full (strict)` only if origin certificate is valid
- Always Use HTTPS is enabled
- deploy uses `make deploy DOMAIN=<domain>`
