---
name: vercel-deploy
description: Deploy this Astro starter to Vercel using a local CLI wrapper, external token credentials, production/preview deploys, project linking, and custom domains. Use when the user asks to deploy to Vercel, publish on Vercel, set up Vercel hosting, attach a domain on Vercel, or switch deploy target from Hestia to Vercel.
---

# Vercel Deploy

Use this skill when the task is **hosting/deploy on Vercel**, not React patterns.

Do not confuse with:

- `vercel-react-best-practices` — React performance rules
- `vercel-composition-patterns` — React composition rules

## Source Of Truth

- CLI: `scripts/deploy-vercel.mjs`
- Project config: `vercel.json` (Astro framework hint)
- Site config: `site.config.json` (`domain` used as domain hint)
- Secrets (outside repo only): `~/credentials/deploy-vercel.json`
  - Windows: `%USERPROFILE%\credentials\deploy-vercel.json`
  - macOS/Linux: `~/credentials/deploy-vercel.json`

## Safety Rules

- Never commit `token`, `.env`, or raw Vercel secrets.
- Prefer external credentials file or env vars.
- Production deploy is the default when `prod` is not `false` in credentials.
- Use `--preview` when the user wants a draft URL, not production.
- Do not run live domain purchase as part of Vercel deploy. Domain buy stays in Regway skill.
- Confirm with the user before attaching a **custom production domain** if DNS already points elsewhere (Hestia/Cloudflare/other).

## Credentials

Create token: https://vercel.com/account/tokens

Example `~/credentials/deploy-vercel.json`:

```json
{
  "token": "vercel_xxx",
  "orgId": "team_xxx",
  "projectId": "prj_xxx",
  "projectName": "my-site",
  "scope": "my-team",
  "prod": true
}
```

Env overrides:

- `VERCEL_TOKEN` (required if not in JSON)
- `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` (recommended for non-interactive deploys)
- `VERCEL_SCOPE` / `VERCEL_PROJECT_NAME`
- `DEPLOY_VERCEL_CONFIG` (custom path to JSON)

`orgId` + `projectId` enable CI-style non-interactive deploys. Without them, first deploy may need `make vercel-link` once.

## Commands

```bash
make vercel-inspect
make vercel-whoami
make vercel-link
make deploy-vercel
make deploy-vercel-preview
make deploy-vercel-no-build
make vercel-domains
make vercel-domain-add DOMAIN=example.com
```

Direct npm:

```bash
npm run vercel:inspect
npm run vercel:whoami
npm run vercel:link
npm run deploy:vercel
npm run deploy:vercel:preview
npm run deploy:vercel -- --no-build
npm run vercel:domains
npm run vercel:domains -- add example.com
```

## Standard Workflow

1. Ensure site brand/domain are set in `site.config.json`.
2. Create Vercel token and write `~/credentials/deploy-vercel.json`.
3. Check auth:
   ```bash
   make vercel-whoami
   ```
4. Optional first-time link:
   ```bash
   make vercel-link
   ```
5. Deploy production:
   ```bash
   make deploy-vercel
   ```
6. Or preview only:
   ```bash
   make deploy-vercel-preview
   ```
7. Optional custom domain on the Vercel project:
   ```bash
   make vercel-domain-add DOMAIN=example.com
   ```
8. Point DNS (Cloudflare or registrar) to Vercel targets shown in the Vercel dashboard / CLI output.

## Astro Notes For This Starter

- Default output is static (`astro build` → `dist/`).
- Vercel auto-detects Astro; `vercel.json` sets `framework: "astro"`.
- Do **not** force `@astrojs/vercel` SSR adapter unless the user explicitly needs SSR/edge/API routes.
- Keep IndexNow / analytics env vars available at build time if enabled.

## When To Prefer Vercel vs Hestia

| Target | Use when |
| --- | --- |
| **Vercel** | Fast global CDN, preview URLs, Git-linked deploys, low ops |
| **Hestia** (`deploy.sh`) | Own VPS, full server control, existing Hestia stack |

Both can coexist. Do not remove Hestia flow when adding Vercel.

## Agent Behavior

1. If token/config is missing, run `make vercel-inspect` and explain how to create credentials — do not invent tokens.
2. Before first production deploy on a new project, prefer `vercel-whoami` then `deploy-vercel`.
3. After deploy, report the deployment URL from CLI output.
4. For custom domains, remind the user to update DNS; use Cloudflare MCP only when the task explicitly includes Cloudflare DNS changes.
5. Never put visitor-facing copy about "Vercel", "deploy scripts", or internal tooling on public pages unless the product itself is a developer tool.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Missing Vercel token` | Add token to credentials JSON or `VERCEL_TOKEN` |
| Interactive prompts in CI | Set `orgId` + `projectId`, use `--yes` (script already passes `--yes`) |
| Wrong team | Set `scope` / `VERCEL_SCOPE` |
| Build fails on Vercel only | Reproduce with `npm run build` locally; fix Astro/config first |
| Domain already on another project | Remove or transfer domain in Vercel dashboard, then re-add |
| Windows `spawn npx ENOENT` | Use this script (`npm run deploy:vercel`), not bare `spawn('npx')` without shell |
