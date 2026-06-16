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

Stored Bing plans are part of the research workflow. The folder `/Users/sergejapetenok/credentials/astro-blank/bing/plans` contains prior seed-plan JSON files and HTML reports. When a user asks for a new site, check this folder first. If there is already a close report, summarize what it covers, whether its homepage cluster and money pages are usable, and what branch should be expanded next. Do not rerun broad Bing collection until the existing plan has been reviewed.

Current `search-console-mcp` Bing tools are mainly for verified-site workflows: sites, sitemaps, rank/traffic stats, and cannibalization. If keyword research is not exposed by the MCP toolset, use Bing Webmaster UI/manual export or another available keyword API, then continue the same clustering/page-map workflow.

After the site is deployed, verify the domain in Bing Webmaster Tools and submit `sitemap-index.xml` so future launches can use real query/rank data.

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
