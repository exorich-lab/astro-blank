---
name: domain-launch-ops
description: Coordinate Regway domain purchase/check flows with Cloudflare MCP/API domain setup and Hestia deployment for this starter. Use when buying a domain, checking domain availability, configuring Cloudflare DNS/SSL/cache/security, or preparing a newly purchased domain for the Hestia server.
---

# Domain Launch Ops

Use this skill when the user wants to find, buy, verify, or configure a domain for this starter.

## Tools In This Project

- Regway CLI: `scripts/regway-domain.mjs`
- Regway secret: `/Users/sergejapetenok/credentials/regway-domain.json`
- Cloudflare MCP server: `cloudflare-api`
- Cloudflare MCP URL: `https://mcp.cloudflare.com/mcp`
- Hestia deploy config: `/Users/sergejapetenok/credentials/deploy-hestia.json`
- Site config: `site.config.json`

## Context Rule

Do not keep Cloudflare API details in normal working context. Only use `cloudflare-api` MCP when the current task explicitly needs Cloudflare account state or changes.

The Cloudflare API MCP server is intentionally acceptable for this workflow because it exposes the full Cloudflare API through `search()` and `execute()` instead of loading thousands of native endpoint schemas.

## Standard Workflow

1. Check availability through Regway:
   ```bash
   make domain-check DOMAIN=example.com
   ```
2. Check registration price:
   ```bash
   make domain-price DOMAIN=example.com
   ```
3. If the user wants ideas, generate and check suggestions:
   ```bash
   make domain-suggest KEYWORD=brand TLD=com,net,org
   ```
4. Do sandbox purchase testing only:
   ```bash
   make domain-buy-test DOMAIN=example.com
   ```
5. After real purchase, use Cloudflare MCP only for Cloudflare account setup.
6. Point Cloudflare DNS to Hestia.
7. Deploy through the existing Hestia flow.

## Regway Safety

- Never perform live Regway registration without explicit user instruction.
- Before any live registration, show availability and price.
- Live registration requires all safeguards in `scripts/regway-domain.mjs`: `sandbox:false`, `--live`, and `--confirm-register <domain>`.
- `make domain-buy-test` is the only normal purchase test command.

## Cloudflare MCP Usage

Use `cloudflare-api` for account-aware operations after a domain exists:

- create or find the zone
- inspect nameservers and zone status
- create/update DNS records
- configure SSL/TLS mode
- enable Always Use HTTPS
- configure redirects from `www` to apex or apex to `www`
- configure caching rules only when useful for the site
- inspect DNS analytics or Cloudflare warnings

For repeatable deployment automation, prefer local scripts and config. Use MCP for setup, diagnosis, and one-off Cloudflare changes where account state matters.

## Cloudflare Defaults For This Starter

For a Hestia static site, prefer:

- `A` record for apex domain to Hestia server IP
- `CNAME` for `www` to apex domain, or explicit redirect if brand canonical URL requires it
- SSL/TLS mode: `Full` if origin SSL is not fully trusted, `Full (strict)` only when origin certificate is valid
- Always Use HTTPS: enabled
- Proxy: enabled for normal web traffic, disabled only when debugging origin DNS/SSL
- Do not create email DNS records unless the user explicitly asks for mail

## Cloudflare MCP Setup

Project config includes:

```json
{
  "mcpServers": {
    "cloudflare-api": {
      "url": "https://mcp.cloudflare.com/mcp"
    }
  }
}
```

When the MCP client connects, authorize via Cloudflare OAuth and grant only the permissions needed for the task. For automation/CI, use a Cloudflare API token with narrow permissions instead of OAuth.

## Handoff To Deploy

Choose one hosting target after DNS is ready.

### Hestia (default VPS path)

```bash
make deploy DOMAIN=example.com
```

If the Hestia domain is missing and the user wants automatic creation:

```bash
make deploy-create-domain DOMAIN=example.com
```

### Vercel (CDN / preview path)

Use skill `vercel-deploy` and credentials in `~/credentials/deploy-vercel.json`:

```bash
make vercel-whoami
make deploy-vercel
make vercel-domain-add DOMAIN=example.com
```

Then point DNS to the Vercel records shown by the CLI/dashboard (not the Hestia server IP).