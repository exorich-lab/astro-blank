---
name: regway-domain-api
description: Work with Regway reseller HTTP API for domain availability checks, suggestions, pricing, sandbox registration tests, and guarded live domain registration from this starter.
---

# Regway Domain API

Use this skill when the user asks to check, find, price, buy, or register domains through the Regway reseller account.

## Source Of Truth

- CLI script: `scripts/regway-domain.mjs`
- Secret config: `/Users/sergejapetenok/credentials/regway-domain.json`
- Regway docs: `https://cp.regway.com/kb/answer/744`

## Safety Rules

- Never perform live registration unless the user explicitly asks for it.
- Default to sandbox/test calls.
- `buy-test` must use `https://test.httpapi.com/`.
- Live registration requires all three safeguards:
  - `sandbox: false` in `/Users/sergejapetenok/credentials/regway-domain.json`
  - `--live`
  - `--confirm-register <exact-domain>`
- Always run availability and price before live registration.

## Commands

```bash
make domain-check DOMAIN=example.com
make domain-price DOMAIN=example.com
make domain-suggest KEYWORD=brand TLD=com,net,org
make domain-buy-test DOMAIN=example.com
```

Direct npm commands:

```bash
npm run domain:check -- --domain example.com
npm run domain:price -- --domain example.com
npm run domain:suggest -- --keyword brand --tlds com,net,org --check
npm run domain:buy-test -- --domain example.com
```

Live registration is intentionally not exposed through Makefile. Use direct CLI only after explicit confirmation:

```bash
npm run domain:register -- --domain example.com --live --confirm-register example.com
```

## Regway API Notes

- Base API: `https://httpapi.com/`
- Test API: `https://test.httpapi.com/`
- Availability API from docs: `https://domaincheck.httpapi.com/api/domains/available.json`
- Auth params: `auth-userid`, `api-key`
- Availability endpoint: `GET /api/domains/available.json`
- Customer pricing endpoint: `GET /api/products/customer-price.json`
- Register endpoint: `POST /api/domains/register.json` in live mode, test GET is allowed on `test.httpapi.com` for command-line checks.
- API access requires the current caller IP to be whitelisted in the Regway reseller panel.
