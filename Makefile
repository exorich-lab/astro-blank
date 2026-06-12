.DEFAULT_GOAL := help

SHELL := /bin/bash

PROFILE ?= production
CONFIG_FILE ?= $(HOME)/credentials/deploy-hestia.json
SITE_CONFIG ?= ./site.config.json
DOMAIN ?=
DIST ?= ./dist/

# Optional overrides:
#   make deploy PROFILE=my-prod CONFIG_FILE=/path/to/file DOMAIN=example.com DIST=./dist/

define DEPLOY_FLAGS
$(if $(strip $(PROFILE)),--profile $(PROFILE),) \
$(if $(strip $(CONFIG_FILE)),--config $(CONFIG_FILE),) \
$(if $(strip $(SITE_CONFIG)),--site-config $(SITE_CONFIG),) \
$(if $(strip $(DOMAIN)),--domain $(DOMAIN),) \
$(if $(strip $(DIST)),--dist $(DIST),)
endef

.PHONY: help install dev dev-astro build preview analytics-check analytics-gtm-setup analytics-gtm-setup-dry analytics-gtm-setup-force deploy deploy-ga deploy-no-build deploy-create-domain deploy-skip-check clean

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
	@echo ""
	@echo "  make deploy                - build and deploy via deploy.sh (default profile: $(PROFILE))"
	@echo "  make deploy-no-build        - upload current dist only"
	@echo "  make deploy-create-domain   - create Hestia domain if it is missing"
	@echo "  make deploy-skip-check      - deploy without Hestia domain check"
	@echo ""
	@echo "  Optional args:"
	@echo "  make deploy PROFILE=my-prod CONFIG_FILE=/path/to/deploy-hestia.json DOMAIN=example.com"

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

clean:
	rm -rf dist .astro node_modules
