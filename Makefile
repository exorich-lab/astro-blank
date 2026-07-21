.DEFAULT_GOAL := help

SHELL := /bin/bash

PROFILE ?= production
CONFIG_FILE ?=
SITE_CONFIG ?= ./site.config.json
DOMAIN ?=
DIST ?= ./dist/
KEYWORD ?=
SEEDS ?=
TLD ?= com,net,org
COUNTRY ?= us
LANGUAGE ?= en-US
SERP_MARKET ?= US
START_DATE ?=
END_DATE ?=
DEPTH ?= 2
PER_SEED ?= 15
LIMIT ?= 100
DELAY_MS ?= 500
STATS_DELAY_MS ?= 500
RETRY_COUNT ?= 3
RETRY_DELAY_MS ?= 10000
THROTTLE_DELAY_MS ?= 60000
REQUEST_TIMEOUT_MS ?= 30000
MIN_CLUSTER_SIZE ?= 2
CLUSTER_LIMIT ?= 50
DAYS ?= 30
OUTPUT ?=
MAX_REQUESTS ?= 80
SEED_LIMIT ?= 80
SEED_PLAN ?=
EXPAND_THRESHOLD ?= 1000
EXPAND_MAX_KEYWORDS ?= 3
TOP ?= 10
KEYWORD_LIMIT ?= 1
KEYWORD_OFFSET ?= 0
SITEMAP_LIMIT ?= 3
SITEMAP_URL_LIMIT ?= 100
RUN_DIR ?=
REPORT ?=
FETCH_LIMIT ?= 1000
FETCH_SOURCE ?= domains
SITEMAP_DOMAIN_LIMIT ?= 1000
MAX_SITEMAPS_PER_DOMAIN ?= 30
MAX_URLS_PER_DOMAIN ?= 5000
IDEA_LIMIT ?= 0
MIN_COUNT ?= 2
PER_TYPE_LIMIT ?= 20
MARKET_LABEL ?= australia
VARIANTS_PER_IDEA ?= 8
MIN_IMPRESSIONS ?= 1
MIN_BROAD_IMPRESSIONS ?= 10
MAX_IDEAS ?= 120

# Optional overrides:
#   make deploy PROFILE=my-prod CONFIG_FILE=/path/to/file DOMAIN=example.com DIST=./dist/

define DEPLOY_FLAGS
$(if $(strip $(PROFILE)),--profile $(PROFILE),) \
$(if $(strip $(CONFIG_FILE)),--config $(CONFIG_FILE),) \
$(if $(strip $(SITE_CONFIG)),--site-config $(SITE_CONFIG),) \
$(if $(strip $(DOMAIN)),--domain $(DOMAIN),) \
$(if $(strip $(DIST)),--dist $(DIST),)
endef

.PHONY: help install dev dev-astro build preview analytics-check analytics-gtm-setup analytics-gtm-setup-dry analytics-gtm-setup-force domain-check domain-price domain-suggest domain-buy-test bing-sites bing-quota bing-submit-url bing-keyword bing-related-keywords bing-research bing-clusters bing-site-plan bing-plans bing-query-stats bing-page-stats serp-collect serp-plan-collect serp-fetch serp-sitemaps serp-plan-expand serp-plan-validate-expansion serp-plan-competitor-meta serp-competitors serp-plan-competitors deploy deploy-ga deploy-no-build deploy-create-domain deploy-skip-check deploy-vercel deploy-vercel-preview deploy-vercel-no-build vercel-whoami vercel-link vercel-inspect vercel-domains vercel-domain-add clean

help:
	@echo "Available commands:"
	@echo ""
	@echo "  make install               - install npm dependencies"
	@echo "  make dev                   - run local development server only (no GA4 bootstrap)"
	@echo "  make dev-astro             - run plain Astro dev command"
	@echo "  make build                 - run production build"
	@echo "  make preview               - preview build output"
	@echo "  make analytics-check       - verify GTM/GA4 tag is configured"
	@echo "  make deploy-ga             - verify analytics tag, then deploy"
	@echo "  make indexnow-prepare      - prepare IndexNow verification file"
	@echo "  make analytics-gtm-setup    - write PUBLIC_GTM_ID from site.config.json or --gtm-id"
	@echo "  make analytics-gtm-setup-dry - dry-run GTM setup"
	@echo "  make analytics-gtm-setup-force - force overwrite GTM env values"
	@echo "  make domain-check DOMAIN=example.com - check Regway domain availability"
	@echo "  make domain-price DOMAIN=example.com - get Regway customer price"
	@echo "  make domain-suggest KEYWORD=brand TLD=com,net - suggest and check domains"
	@echo "  make domain-buy-test DOMAIN=example.com - sandbox Regway registration test"
	@echo "  make bing-sites            - list Bing Webmaster sites"
	@echo "  make bing-quota DOMAIN=https://example.com - show Bing URL submission quota"
	@echo "  make bing-submit-url DOMAIN=https://example.com URL=https://example.com/page"
	@echo "  make bing-keyword KEYWORD=\"essay writing service\" - show Bing keyword stats"
	@echo "  make bing-related-keywords KEYWORD=\"essay writing service\" - collect related Bing keywords"
	@echo "  make bing-research KEYWORD=\"essay writing service\" - multi-pass Bing keyword research"
	@echo "  make bing-clusters KEYWORD=\"essay writing service\" - collect and cluster keywords into pages"
	@echo "  make bing-site-plan KEYWORD=\"essay writing service\" - create HTML keyword cluster report"
	@echo "  make bing-plans            - list stored seed plans and HTML reports"
	@echo "  Bing storage: plans/reports in ~/credentials/astro-blank/bing/plans, cache in ~/credentials/astro-blank/bing/cache"
	@echo "  Bing rate limits: override SEED_LIMIT, MAX_REQUESTS, DELAY_MS, STATS_DELAY_MS, RETRY_COUNT, RETRY_DELAY_MS, THROTTLE_DELAY_MS"
	@echo "  make bing-query-stats DOMAIN=https://example.com - show real Bing queries for verified site"
	@echo "  make bing-page-stats DOMAIN=https://example.com - show Bing page stats for verified site"
	@echo "  make serp-collect KEYWORD=\"online pokies chooser\" - collect SERP top URLs only"
	@echo "  make serp-plan-collect SEED_PLAN=plan.json KEYWORD_LIMIT=3 - collect SERP URLs from stored plan"
	@echo "  make serp-fetch RUN_DIR=/path/to/run - fetch unique competitor pages from collected SERP URLs"
	@echo "  make serp-sitemaps RUN_DIR=/path/to/run - parse competitor robots/sitemaps into keyword ideas"
	@echo "  make serp-plan-expand RUN_DIR=/path/to/run SEED_PLAN=plan.json - create expanded draft seed-plan from sitemap ideas"
	@echo "  make serp-plan-validate-expansion RUN_DIR=/path/to/run SEED_PLAN=plan.json - validate sitemap hypotheses with Bing stats and write clusters"
	@echo "  make serp-plan-competitor-meta REPORT=plan.html - collect SERP meta titles/H1/descriptions for every primary cluster keyword"
	@echo "  make serp-competitors KEYWORD=\"online pokies chooser\" - collect SERP then fetch unique pages"
	@echo ""
	@echo "  make deploy                - build and deploy via deploy.sh (Hestia, default profile: $(PROFILE))"
	@echo "  make deploy-no-build        - upload current dist only (Hestia)"
	@echo "  make deploy-create-domain   - create Hestia domain if it is missing"
	@echo "  make deploy-skip-check      - deploy without Hestia domain check"
	@echo "  make deploy-vercel          - build and deploy production to Vercel"
	@echo "  make deploy-vercel-preview  - build and deploy preview to Vercel"
	@echo "  make deploy-vercel-no-build - deploy current build to Vercel (no rebuild)"
	@echo "  make vercel-whoami          - show Vercel auth user"
	@echo "  make vercel-link            - link folder to a Vercel project"
	@echo "  make vercel-inspect         - show Vercel credential/link status (no secrets)"
	@echo "  make vercel-domains         - list Vercel domains"
	@echo "  make vercel-domain-add DOMAIN=example.com - attach domain on Vercel"
	@echo ""
	@echo "  Optional args:"
	@echo "  make deploy PROFILE=my-prod CONFIG_FILE=/path/to/deploy-hestia.json DOMAIN=example.com"
	@echo "  Vercel secrets: ~/credentials/deploy-vercel.json or VERCEL_TOKEN"

install:
	npm install

dev:
	node scripts/dev.mjs

dev-astro:
	npm run dev:astro

build:
	npm run build

preview:
	npm run preview

analytics-check:
	npm run analytics:check

analytics-gtm-setup:
	npm run analytics:gtm:setup

analytics-gtm-setup-dry:
	npm run analytics:gtm:setup:dry

analytics-gtm-setup-force:
	npm run analytics:gtm:setup:force

indexnow-prepare:
	npm run indexnow:prepare

domain-check:
	npm run domain:check -- --domain "$(DOMAIN)"

domain-price:
	npm run domain:price -- --domain "$(DOMAIN)"

domain-suggest:
	npm run domain:suggest -- --keyword "$(KEYWORD)" --tlds "$(TLD)" --check

domain-buy-test:
	npm run domain:buy-test -- --domain "$(DOMAIN)"

bing-sites:
	npm run bing:sites

bing-quota:
	npm run bing:quota -- --site "$(DOMAIN)"

bing-submit-url:
	npm run bing:submit-url -- --site "$(DOMAIN)" --url "$(URL)"

bing-keyword:
	npm run bing:keyword-stats -- --keyword "$(KEYWORD)" --country "$(COUNTRY)" --language "$(LANGUAGE)"

bing-related-keywords:
	npm run bing:related-keywords -- --keyword "$(KEYWORD)" --country "$(COUNTRY)" --language "$(LANGUAGE)" $(if $(strip $(START_DATE)),--start-date "$(START_DATE)",) $(if $(strip $(END_DATE)),--end-date "$(END_DATE)",)

bing-research:
	npm run bing:keyword-research -- --seeds "$(if $(strip $(SEEDS)),$(SEEDS),$(KEYWORD))" --country "$(COUNTRY)" --language "$(LANGUAGE)" --depth "$(DEPTH)" --per-seed "$(PER_SEED)" --limit "$(LIMIT)" --delay-ms "$(DELAY_MS)" --stats-delay-ms "$(STATS_DELAY_MS)" --retry-count "$(RETRY_COUNT)" --retry-delay-ms "$(RETRY_DELAY_MS)" --throttle-delay-ms "$(THROTTLE_DELAY_MS)" --request-timeout-ms "$(REQUEST_TIMEOUT_MS)" --max-requests "$(MAX_REQUESTS)" --seed-limit "$(SEED_LIMIT)" $(if $(strip $(START_DATE)),--start-date "$(START_DATE)",) $(if $(strip $(END_DATE)),--end-date "$(END_DATE)",)

bing-clusters:
	npm run bing:keyword-clusters -- --seeds "$(if $(strip $(SEEDS)),$(SEEDS),$(KEYWORD))" --country "$(COUNTRY)" --language "$(LANGUAGE)" --depth "$(DEPTH)" --per-seed "$(PER_SEED)" --limit "$(LIMIT)" --delay-ms "$(DELAY_MS)" --stats-delay-ms "$(STATS_DELAY_MS)" --retry-count "$(RETRY_COUNT)" --retry-delay-ms "$(RETRY_DELAY_MS)" --throttle-delay-ms "$(THROTTLE_DELAY_MS)" --request-timeout-ms "$(REQUEST_TIMEOUT_MS)" --max-requests "$(MAX_REQUESTS)" --seed-limit "$(SEED_LIMIT)" --min-cluster-size "$(MIN_CLUSTER_SIZE)" --cluster-limit "$(CLUSTER_LIMIT)" $(if $(strip $(START_DATE)),--start-date "$(START_DATE)",) $(if $(strip $(END_DATE)),--end-date "$(END_DATE)",)

bing-site-plan:
	npm run bing:keyword-site-plan -- --seeds "$(if $(strip $(SEEDS)),$(SEEDS),$(KEYWORD))" --country "$(COUNTRY)" --language "$(LANGUAGE)" --days "$(DAYS)" --depth "$(DEPTH)" --per-seed "$(PER_SEED)" --limit "$(LIMIT)" --delay-ms "$(DELAY_MS)" --stats-delay-ms "$(STATS_DELAY_MS)" --retry-count "$(RETRY_COUNT)" --retry-delay-ms "$(RETRY_DELAY_MS)" --throttle-delay-ms "$(THROTTLE_DELAY_MS)" --request-timeout-ms "$(REQUEST_TIMEOUT_MS)" --max-requests "$(MAX_REQUESTS)" --seed-limit "$(SEED_LIMIT)" --min-cluster-size "$(MIN_CLUSTER_SIZE)" --cluster-limit "$(CLUSTER_LIMIT)" --expand-threshold "$(EXPAND_THRESHOLD)" --expand-max-keywords "$(EXPAND_MAX_KEYWORDS)" $(if $(strip $(SEED_PLAN)),--seed-plan-file "$(SEED_PLAN)",) $(if $(strip $(OUTPUT)),--output "$(OUTPUT)",) $(if $(strip $(START_DATE)),--start-date "$(START_DATE)",) $(if $(strip $(END_DATE)),--end-date "$(END_DATE)",)

bing-plans:
	npm run bing:plans

bing-query-stats:
	npm run bing:query-stats -- --site "$(DOMAIN)"

bing-page-stats:
	npm run bing:page-stats -- --site "$(DOMAIN)"

serp-competitors:
	npm run serp:competitors -- --keyword "$(KEYWORD)" --market "$(SERP_MARKET)" --language "$(LANGUAGE)" --top "$(TOP)" --sitemap-limit "$(SITEMAP_LIMIT)" --sitemap-url-limit "$(SITEMAP_URL_LIMIT)"

serp-plan-competitors:
	npm run serp:competitors -- --plan "$(SEED_PLAN)" --market "$(SERP_MARKET)" --language "$(LANGUAGE)" --keyword-offset "$(KEYWORD_OFFSET)" --keyword-limit "$(KEYWORD_LIMIT)" --top "$(TOP)" --sitemap-limit "$(SITEMAP_LIMIT)" --sitemap-url-limit "$(SITEMAP_URL_LIMIT)"

serp-collect:
	npm run serp:collect -- --keyword "$(KEYWORD)" --market "$(SERP_MARKET)" --language "$(LANGUAGE)" --top "$(TOP)"

serp-plan-collect:
	npm run serp:collect -- --plan "$(SEED_PLAN)" --market "$(SERP_MARKET)" --language "$(LANGUAGE)" --keyword-offset "$(KEYWORD_OFFSET)" --keyword-limit "$(KEYWORD_LIMIT)" --top "$(TOP)"

serp-fetch:
	npm run serp:fetch -- $(if $(strip $(RUN_DIR)),--run-dir "$(RUN_DIR)",) --source "$(FETCH_SOURCE)" --limit "$(FETCH_LIMIT)" --sitemap-limit "$(SITEMAP_LIMIT)" --sitemap-url-limit "$(SITEMAP_URL_LIMIT)"

serp-sitemaps:
	npm run serp:sitemaps -- $(if $(strip $(RUN_DIR)),--run-dir "$(RUN_DIR)",) --source "$(FETCH_SOURCE)" --limit "$(SITEMAP_DOMAIN_LIMIT)" --max-sitemaps-per-domain "$(MAX_SITEMAPS_PER_DOMAIN)" --max-urls-per-domain "$(MAX_URLS_PER_DOMAIN)" --idea-limit "$(IDEA_LIMIT)"

serp-plan-expand:
	npm run serp:plan-expand -- $(if $(strip $(RUN_DIR)),--run-dir "$(RUN_DIR)",) --plan "$(SEED_PLAN)" --market-label "$(MARKET_LABEL)" --min-count "$(MIN_COUNT)" --per-type-limit "$(PER_TYPE_LIMIT)"

serp-plan-validate-expansion:
	npm run serp:plan-validate-expansion -- $(if $(strip $(RUN_DIR)),--run-dir "$(RUN_DIR)",) --plan "$(SEED_PLAN)" --market-label "$(MARKET_LABEL)" --country "$(COUNTRY)" --language "$(LANGUAGE)" --min-count "$(MIN_COUNT)" --per-type-limit "$(PER_TYPE_LIMIT)" --max-ideas "$(MAX_IDEAS)" --variants-per-idea "$(VARIANTS_PER_IDEA)" --min-impressions "$(MIN_IMPRESSIONS)" --min-broad-impressions "$(MIN_BROAD_IMPRESSIONS)" --stats-delay-ms "$(STATS_DELAY_MS)" --retry-count "$(RETRY_COUNT)" --request-timeout-ms "$(REQUEST_TIMEOUT_MS)" $(if $(strip $(OUTPUT)),--output "$(OUTPUT)",)

serp-plan-competitor-meta:
	npm run serp:plan-competitor-meta -- --report "$(REPORT)" --market "$(SERP_MARKET)" --language "$(LANGUAGE)" --top "$(TOP)" --cluster-limit "$(CLUSTER_LIMIT)" --keyword-offset "$(KEYWORD_OFFSET)" --timeout-ms "$(REQUEST_TIMEOUT_MS)" --serp-delay-ms "$(DELAY_MS)" --fetch-delay-ms "$(STATS_DELAY_MS)"

deploy:
	./deploy.sh $(DEPLOY_FLAGS)

deploy-ga:
	node scripts/analytics-bootstrap-all.mjs
	npm run analytics:check
	$(MAKE) deploy

deploy-no-build:
	./deploy.sh $(DEPLOY_FLAGS) --no-build

deploy-create-domain:
	./deploy.sh $(DEPLOY_FLAGS) --create-domain

deploy-skip-check:
	./deploy.sh $(DEPLOY_FLAGS) --skip-domain-check

deploy-vercel:
	npm run deploy:vercel -- $(if $(strip $(DOMAIN)),--domain "$(DOMAIN)",) $(if $(strip $(NAME)),--name "$(NAME)",)

deploy-vercel-preview:
	npm run deploy:vercel:preview -- $(if $(strip $(DOMAIN)),--domain "$(DOMAIN)",) $(if $(strip $(NAME)),--name "$(NAME)",)

deploy-vercel-no-build:
	npm run deploy:vercel -- --no-build $(if $(strip $(DOMAIN)),--domain "$(DOMAIN)",) $(if $(strip $(NAME)),--name "$(NAME)",)

vercel-whoami:
	npm run vercel:whoami

vercel-link:
	npm run vercel:link -- $(if $(strip $(NAME)),--name "$(NAME)",)

vercel-inspect:
	npm run vercel:inspect

vercel-domains:
	npm run vercel:domains -- list

vercel-domain-add:
	npm run vercel:domains -- add "$(DOMAIN)"

clean:
	rm -rf dist .astro node_modules
