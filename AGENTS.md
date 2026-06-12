# AGENTS.md

> [!CAUTION]
> **CRITICAL RULE: MANDATORY HUMANIZATION OF ALL WEBSITE TEXT.**
> Any time you generate, edit, or propose text content that will be displayed on the website (e.g., headings, paragraphs, descriptions, metadata, button labels, UI text, articles), you **MUST** automatically apply the `humanizer` skill to that text before presenting it. The generated copy must not sound like generic AI. NEVER provide un-humanized, "corporate", or "AI-sounding" text for user-facing content.

> [!CAUTION]
> **CRITICAL RULE: MANDATORY UI/UX PRO MAX DESIGN SYSTEM.**
> When developing or styling the website frontend, you **MUST** strictly adhere to the `ui-ux-pro-max` design system rules. Always check the corresponding skill in the `.agents/skills` folder. Do not use generic styling; ensure a high-end, premium aesthetic as defined by the UI/UX Pro Max standards.
>
> **COMPONENT PRIORITY FOR PERFECT UI.**
> For any website interface, design system work, section, page, or reusable component, you **MUST** prioritize Magic UI and shadcn/ui components before writing custom markup. Use shadcn/ui for accessible base primitives and product controls (Button, Card, Dialog, Sheet, Tabs, forms, menus, navigation). Use Magic UI for premium animated surfaces and high-end visual polish (beams, border effects, marquees, reveal text, hero motion, special cards). Compose these libraries first, then add custom code only where the design cannot be built cleanly from existing Magic UI or shadcn/ui components. The final interface must feel intentional, polished, responsive, accessible, and non-generic.

> [!CAUTION]
> **CRITICAL RULE: PUBLIC WEBSITE COPY MUST NEVER SOUND INTERNAL OR TECHNICAL.**
> When creating a website, landing page, product page, service page, portfolio, or any visitor-facing screen, you **MUST** work as a conversion-focused website architect, not as a prototyper, developer, SEO operator, or internal planner. Build the page as a finished public product with a clear offer, positioning, trust, proof, objection handling, and a strong path to the target action. Never show visitors internal labels, planning terms, SEO structure labels, or implementation terms such as "starter", "boilerplate", "template", "component", "shadcn", "Magic UI", "Astro", "React", "Tailwind", "API", "MCP", "design system", "frontend", "backend", "layout", "section", "placeholder", "TODO", "mock data", "lorem ipsum", "silo", "hub", "intent", "SEO keywords", "semantic core", "cluster", "funnel stage", "wireframe", "prototype", "conversion block", or instructions about how the site was built, unless the actual business sells developer or marketing tools and those terms are part of the customer-facing offer. Treat any internal brief words as hidden planning input only, then translate them into polished public copy that a normal visitor immediately understands. All visible copy must speak to the customer's needs, benefits, trust, proof, objections, and next action in clear human language.

## SEO config (обязательная)

В стартере используется единый файл `site.config.json` как источник истины для SEO-метаданных инфраструктуры:

- `site.config.json` содержит базовые настройки: `brandName`, `domain`, `description`, блоки `robots`, `ads` и `indexNow`.
- `astro.config.mjs` берёт `domain` из `site.config.json` и подключает `@astrojs/sitemap`.
- `src/pages/robots.txt.ts` автоматически собирает `robots.txt` из `robots.disallow` и всегда добавляет ссылку на `sitemap.xml` через `sitemapPath` из `robots` (по умолчанию `sitemap-index.xml` для `@astrojs/sitemap`).
- `src/pages/ads.txt.ts` собирает `ads.txt` по шаблону `ads.provider, ads.publisherId, ads.relationship, ads.certificationId`; если `ads.enabled = false` или `publisherId` пустой — файл отдает пустой ответ до появления реальных данных.

### IndexNow (обязательная)

- Для работы с `astro-indexnow` используется блок `indexNow` в `site.config.json`.
- `indexNow.enabled` управляет тем, подключена ли отправка обновлений Sitemap в build.
- Ключ берется из `site.config.json.indexNow.key` или переменной `INDEXNOW_KEY`.
- Перед сборкой выполняется `scripts/indexnow.mjs`, который создаёт файл `/public/<key>.txt` для валидации ключа.
- Для ручной генерации этого файла в локали можно запускать `npm run indexnow:prepare`.
- После успешного `npm run build` интеграция `astro-indexnow` отправляет обновленные URL через API IndexNow (в CI/production окружении это штатный путь авто-уведомления).
- Если ключ не задан, интеграция корректно пропускается — сборка и проект продолжают работать.

Логика при смене домена или бренда:

- Меняете только `site.config.json`.
- Не меняете `robots.txt.ts` и `ads.txt.ts` вручную.
- После правки конфигурации запускаете стандартный `npm run build` и проверяете доступность `/robots.txt`, `/ads.txt`, и путь из `robots.sitemapPath` (обычно `/sitemap-index.xml`).

## Авто-установка AI-скиллов

Стартер для установки запускает автопоиск и обновление скиллов командой:

```bash
npx autoskills --yes --agent codex
```

Это выполняется в `install.sh` после `npm install`, чтобы проект после разворачивания имел актуальные скиллы из registry, а не только те, которые были в шаблоне.

Для проверки без внесения изменений:

```bash
npx autoskills --dry-run --yes --agent codex
```

В `install.sh` есть отдельный шаг, который при инсталляции подхватывает свежие версии MCP-серверов через `npx` с `@latest`:

- `@magicuidesign/mcp@latest`
- `search-console-mcp@latest`

## Search Console MCP

В проект добавлен MCP-сервер для Google Search Console:

- `search-console-mcp` (пакет `search-console-mcp` через `npx`)

Конфигурации добавлены в:

- `.mcp.json`
- `.vscode/mcp.json`
- `.codex/config.toml`

Рабочая модель:

1. Настройте переменную `GOOGLE_APPLICATION_CREDENTIALS` на путь к JSON-ключу сервисного аккаунта Google:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"
   ```
2. (Опционально) выполните `npx search-console-mcp setup` для проверки/инициации привязки аккаунта.
3. Перезапустите MCP-клиент проекта (Codex/Antigravity/VS Code) после изменения переменной.
4. В Codex проверьте наличие сервера командой `/mcp` (`search-console-mcp` должен быть в списке).

Быстрый локальный тест:

```bash
npx search-console-mcp@latest
```

## Analytics Rules

Обычный путь аналитики в стартере должен быть простым. Не предлагать пользователю service account, Firebase IAM, GA4 Admin API, accessBindings или gcloud OAuth как стандартный путь.

Стандартный сценарий:

- `analytics.gtmId` / `PUBLIC_GTM_ID` для Google Tag Manager.
- или `analytics.ga4MeasurementId` / `PUBLIC_GA4_MEASUREMENT_ID` для прямого GA4.
- `make analytics-check` проверяет наличие `GTM-...` или `G-...`.
- `make deploy-ga` только проверяет тег и запускает обычный деплой.

Advanced provisioning через Google API не предлагать в обычном сценарии. Если пользователь явно просит автоматическое создание/изменение GA4/GTM ресурсов, сначала предупредить, что это отдельный сложный путь с правами Google, и только потом использовать соответствующие internal scripts.

## Деплой и Hestia CP

Секретные данные для деплоя должны храниться в отдельном файле вне репозитория:

`~/credentials/deploy-hestia.json`

Скрипты проекта (`deploy.sh`, `scripts/ensure-hestia-domain.mjs`) читают его автоматически:

- `defaultProfile` — профиль по умолчанию.
- `profiles.<name>.remote` — SSH-контур (`host`, `user`, `port`, `pathTemplate`, `sshKey`, `sshOptions`).
- `profiles.<name>.hestia` — только `sshUser` для доменных операций (`v-add-web-domain`).

Поддерживаются переменные окружения внутри значений JSON (формат `${VAR_NAME}`):

- `DEPLOY_HESTIA_HOST`
- `DEPLOY_HESTIA_USER`
- `DEPLOY_HESTIA_SSH_KEY_PATH`
- `DEPLOY_HESTIA_SSH_PORT`
- `DEPLOY_HESTIA_SSH_USER`

Примеры запуска:

```bash
./deploy.sh --profile production
./deploy.sh --profile production --domain your-domain.com --no-build
./deploy.sh --config ~/credentials/deploy-hestia.json --profile production --no-build
./deploy.sh --skip-domain-check # временно пропустить проверку домена
./deploy.sh --create-domain # автоматически создать домен, если его нет в Hestia
```

`deploy.sh` в SSH-режиме:

- Загружает конфиг из `~/credentials/deploy-hestia.json`.
- Проверяет SSH-доступ к хосту.
- Проверяет наличие домена через SSH и предлагает создать его в Hestia при отсутствии (`v-list-web-domains`, `v-add-web-domain`).
- Загружает `dist/` через `rsync` в `REMOTE_PATH`.

Для диагностики SSH используйте:

- `Connection refused`, `timed out`, `No route to host` — проверка хоста/порта/фаервола и SSH-ключа.
- `sudo -n -i bash -lc "v-list-web-domains json"`
- `v-list-web-domains json`

<!-- autoskills:start -->

Summary generated by `autoskills`. Check the full files inside `.agents/skills`.

## Accessibility (a11y)

Audit and improve web accessibility following WCAG 2.2 guidelines. Use when asked to "improve accessibility", "a11y audit", "WCAG compliance", "screen reader support", "keyboard navigation", or "make accessible".

- `.agents/skills/accessibility/SKILL.md`
- `.agents/skills/accessibility/references/A11Y-PATTERNS.md`: Practical, copy-paste-ready patterns for common accessibility requirements. Each pattern is self-contained and linked from the main [SKILL.md](../SKILL.md).
- `.agents/skills/accessibility/references/WCAG.md`

## Astro Usage Guide

Skill for building with the Astro web framework. Helps create Astro components and pages, configure SSR adapters, set up content collections, deploy static sites, and manage project structure and CLI commands. Use when the user needs to work with Astro, mentions .astro files, asks about static si...

- `.agents/skills/astro/SKILL.md`

## Astro 6.3 Notes

Project baseline is Astro 6.3.x. When upgrading from Astro 6.1.x to 6.3.x, keep these framework changes in mind:

- Use `npx @astrojs/upgrade` for framework upgrades, then run `npm run build` and `npm audit`.
- Astro 6.2 added `experimental.svgOptimizer` with `svgoOptimizer()` and removed the older `experimental.svgo` flag. Do not add `experimental.svgo`; use `svgOptimizer` only when SVG component optimization is needed.
- Astro 6.2 added `experimental.logger` and `--experimentalJson` for structured logs. This is useful for CI and agent debugging, but keep it out of visitor-facing code and copy.
- Astro 6.2 added `compressHTML: "jsx"` for JSX-style whitespace handling. Use it only when the output has been visually checked, because whitespace differences can affect inline text.
- Astro 6.2 added `experimental_getFontFileURL()` from `astro:assets` for build-time font access, especially generated Open Graph images.
- Astro 6.3 added `experimental.advancedRouting` with `src/app.ts`, `astro/fetch`, and `astro/hono`. Treat it as experimental and use it only for real SSR routing needs such as auth, rate limits, custom logging, or middleware ordering.
- Astro 6.3 added `AstroCookies.consume()` as the instance API. The old static `AstroCookies.consume(cookies)` is deprecated.
- Astro 6.3 improves island hydration resilience by retrying failed hydration imports. Still keep client islands small and add `client:*` directives only where interaction is required.
- Astro 6.3 changed SVG image processing for security: the default image service no longer rasterizes SVG inputs by default. Only set `image.dangerouslyProcessSVG: true` when SVG sources are trusted and this behavior is required.
- Astro 6.3 remote image optimization follows redirects, but redirected hosts must still match `image.domains` or `image.remotePatterns`.
- Astro 6.3.1 fixes local images returning 404 on non-prerendered pages when using the generic image endpoint. Prefer 6.3.1+ over 6.3.0.

## Design Thinking

Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beaut...

- `.agents/skills/frontend-design/SKILL.md`

## Node.js Backend Patterns

Build production-ready Node.js backend services with Express/Fastify, implementing middleware patterns, error handling, authentication, database integration, and API design best practices. Use when creating Node.js servers, REST APIs, GraphQL backends, or microservices architectures.

- `.agents/skills/nodejs-backend-patterns/SKILL.md`
- `.agents/skills/nodejs-backend-patterns/references/advanced-patterns.md`: Advanced patterns for dependency injection, database integration, authentication, caching, and API response formatting.

## Node.js Best Practices

Node.js development principles and decision-making. Framework selection, async patterns, security, and architecture. Teaches thinking, not copying.

- `.agents/skills/nodejs-best-practices/SKILL.md`

## SEO optimization

Optimize for search engine visibility and ranking. Use when asked to "improve SEO", "optimize for search", "fix meta tags", "add structured data", "sitemap optimization", or "search engine optimization".

- `.agents/skills/seo/SKILL.md`

## shadcn/ui

Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI. Provides project context, component docs, and usage examples. Applies when working with shadcn/ui, component registries, presets, --preset codes, or any project with a components.json file. A...

- `.agents/skills/shadcn/SKILL.md`
- `.agents/skills/shadcn/cli.md`: Configuration is read from `components.json`.
- `.agents/skills/shadcn/customization.md`: Components reference semantic CSS variable tokens. Change the variables to change every component.
- `.agents/skills/shadcn/mcp.md`: The CLI includes an MCP server that lets AI assistants search, browse, view, and install components from registries.
- `.agents/skills/shadcn/rules/base-vs-radix.md`: API differences between `base` and `radix`. Check the `base` field from `npx shadcn@latest info`.
- `.agents/skills/shadcn/rules/composition.md`: Never render items directly inside the content container.
- `.agents/skills/shadcn/rules/forms.md`: Always use `FieldGroup` + `Field` — never raw `div` with `space-y-*`:
- `.agents/skills/shadcn/rules/icons.md`: **Always use the project's configured `iconLibrary` for imports.** Check the `iconLibrary` field from project context: `lucide` → `lucide-react`, `tabler` → `@tabler/icons-react`, etc. Never assume `lucide-react`.
- `.agents/skills/shadcn/rules/styling.md`: See [customization.md](../customization.md) for theming, CSS variables, and adding custom colors.

## Magic UI Generator

Generate and integrate premium UI component variations using Magic UI, shadcn/ui, Aceternity-style patterns, Tailwind CSS, React, motion, and the Magic UI MCP server. Use when asked for Magic UI, 21st.dev-style UI, premium component variants, animated shadcn-style components, avant-garde landing sections, or side-by-side UI directions.

- `.agents/skills/magic-ui-generator/SKILL.md`
- MCP configs included:
  - Codex: `.codex/config.toml`
  - Antigravity / VS Code MCP format: `.vscode/mcp.json`
  - Generic MCP clients: `.mcp.json`

## Tailwind CSS Development Patterns

Provides comprehensive Tailwind CSS utility-first styling patterns including responsive design, layout utilities, flexbox, grid, spacing, typography, colors, and modern CSS best practices. Use when styling React/Vue/Svelte components, building responsive layouts, implementing design systems, or o...

- `.agents/skills/tailwind-css-patterns/SKILL.md`
- `.agents/skills/tailwind-css-patterns/references/accessibility.md`
- `.agents/skills/tailwind-css-patterns/references/animations.md`: Usage:
- `.agents/skills/tailwind-css-patterns/references/component-patterns.md`
- `.agents/skills/tailwind-css-patterns/references/configuration.md`: Use the `@theme` directive for CSS-based configuration:
- `.agents/skills/tailwind-css-patterns/references/layout-patterns.md`: Basic flex container:
- `.agents/skills/tailwind-css-patterns/references/performance.md`: Configure content sources for optimal purging:
- `.agents/skills/tailwind-css-patterns/references/reference.md`: Tailwind CSS is a utility-first CSS framework that generates styles by scanning HTML, JavaScript, and template files for class names. It provides a comprehensive design system through CSS utility classes, enabling rapid UI development without writing custom CSS. The framework operates at build-ti...
- `.agents/skills/tailwind-css-patterns/references/responsive-design.md`: Enable dark mode in tailwind.config.js:

## Tailwind v4 + shadcn/ui Production Stack

|

- `.agents/skills/tailwind-v4-shadcn/SKILL.md`
- `.agents/skills/tailwind-v4-shadcn/references/advanced-usage.md`: **Purpose**: Advanced customization and component patterns for experienced Tailwind v4 + shadcn/ui developers **When to Load**: User asks for custom colors beyond defaults, advanced component patterns, composition best practices, or component customization
- `.agents/skills/tailwind-v4-shadcn/references/common-gotchas.md`: ❌ **WRONG:**
- `.agents/skills/tailwind-v4-shadcn/references/dark-mode.md`: Tailwind v4 + shadcn/ui dark mode requires: 1. `ThemeProvider` component to manage state 2. `.dark` class toggling on `<html>` element 3. localStorage persistence 4. System theme detection
- `.agents/skills/tailwind-v4-shadcn/references/migration-guide.md`: This guide helps you migrate from hardcoded Tailwind colors (`bg-blue-600`) to semantic CSS variables (`bg-primary`).
- `.agents/skills/tailwind-v4-shadcn/references/plugins-reference.md`: **Purpose**: Complete guide to Tailwind v4 official plugins (Typography, Forms) **When to Load**: User mentions prose class, Typography plugin, Forms plugin, @plugin directive, or plugin installation errors

## TypeScript Advanced Types

Master TypeScript's advanced type system including generics, conditional types, mapped types, template literals, and utility types for building type-safe applications. Use when implementing complex type logic, creating reusable type utilities, or ensuring compile-time type safety in TypeScript pr...

- `.agents/skills/typescript-advanced-types/SKILL.md`

## React Composition Patterns

Composition patterns for building flexible, maintainable React components. Avoid boolean prop proliferation by using compound components, lifting state, and composing internals. These patterns make codebases easier for both humans and AI agents to work with as they scale.

- `.agents/skills/vercel-composition-patterns/SKILL.md`
- `.agents/skills/vercel-composition-patterns/AGENTS.md`: **Version 1.0.0** Engineering January 2026
- `.agents/skills/vercel-composition-patterns/README.md`: A structured repository for React composition patterns that scale. These patterns help avoid boolean prop proliferation by using compound components, lifting state, and composing internals.
- `.agents/skills/vercel-composition-patterns/rules/_sections.md`: This file defines all sections, their ordering, impact levels, and descriptions. The section ID (in parentheses) is the filename prefix used to group rules.
- `.agents/skills/vercel-composition-patterns/rules/_template.md`: Brief explanation of the rule and why it matters.
- `.agents/skills/vercel-composition-patterns/rules/architecture-avoid-boolean-props.md`: Don't add boolean props like `isThread`, `isEditing`, `isDMThread` to customize component behavior. Each boolean doubles possible states and creates unmaintainable conditional logic. Use composition instead.
- `.agents/skills/vercel-composition-patterns/rules/architecture-compound-components.md`: Structure complex components as compound components with a shared context. Each subcomponent accesses shared state via context, not props. Consumers compose the pieces they need.
- `.agents/skills/vercel-composition-patterns/rules/patterns-children-over-render-props.md`: Use `children` for composition instead of `renderX` props. Children are more readable, compose naturally, and don't require understanding callback signatures.
- `.agents/skills/vercel-composition-patterns/rules/patterns-explicit-variants.md`: Instead of one component with many boolean props, create explicit variant components. Each variant composes the pieces it needs. The code documents itself.
- `.agents/skills/vercel-composition-patterns/rules/react19-no-forwardref.md`: In React 19, `ref` is now a regular prop (no `forwardRef` wrapper needed), and `use()` replaces `useContext()`.
- `.agents/skills/vercel-composition-patterns/rules/state-context-interface.md`: Define a **generic interface** for your component context with three parts: can implement—enabling the same UI components to work with completely different state implementations.
- `.agents/skills/vercel-composition-patterns/rules/state-decouple-implementation.md`: The provider component should be the only place that knows how state is managed. UI components consume the context interface—they don't know if state comes from useState, Zustand, or a server sync.
- `.agents/skills/vercel-composition-patterns/rules/state-lift-state.md`: Move state management into dedicated provider components. This allows sibling components outside the main UI to access and modify state without prop drilling or awkward refs.

## Vercel React Best Practices

React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimizati...

- `.agents/skills/vercel-react-best-practices/SKILL.md`
- `.agents/skills/vercel-react-best-practices/AGENTS.md`: **Version 1.0.0** Vercel Engineering January 2026
- `.agents/skills/vercel-react-best-practices/README.md`: A structured repository for creating and maintaining React Best Practices optimized for agents and LLMs.
- `.agents/skills/vercel-react-best-practices/rules/_sections.md`: This file defines all sections, their ordering, impact levels, and descriptions. The section ID (in parentheses) is the filename prefix used to group rules.
- `.agents/skills/vercel-react-best-practices/rules/_template.md`: **Impact: MEDIUM (optional impact description)**
- `.agents/skills/vercel-react-best-practices/rules/advanced-effect-event-deps.md`: Effect Event functions do not have a stable identity. Their identity intentionally changes on every render. Do not include the function returned by `useEffectEvent` in a `useEffect` dependency array. Keep the actual reactive values as dependencies and call the Effect Event from inside the effect...
- `.agents/skills/vercel-react-best-practices/rules/advanced-event-handler-refs.md`: Store callbacks in refs when used in effects that shouldn't re-subscribe on callback changes.
- `.agents/skills/vercel-react-best-practices/rules/advanced-init-once.md`: Do not put app-wide initialization that must run once per app load inside `useEffect([])` of a component. Components can remount and effects will re-run. Use a module-level guard or top-level init in the entry module instead.
- `.agents/skills/vercel-react-best-practices/rules/advanced-use-latest.md`: Access latest values in callbacks without adding them to dependency arrays. Prevents effect re-runs while avoiding stale closures.
- `.agents/skills/vercel-react-best-practices/rules/async-api-routes.md`: In API routes and Server Actions, start independent operations immediately, even if you don't await them yet.
- `.agents/skills/vercel-react-best-practices/rules/async-cheap-condition-before-await.md`: When a branch uses `await` for a flag or remote value and also requires a **cheap synchronous** condition (local props, request metadata, already-loaded state), evaluate the cheap condition **first**. Otherwise you pay for the async call even when the compound condition can never be true.
- `.agents/skills/vercel-react-best-practices/rules/async-defer-await.md`: Move `await` operations into the branches where they're actually used to avoid blocking code paths that don't need them.
- `.agents/skills/vercel-react-best-practices/rules/async-dependencies.md`: For operations with partial dependencies, use `better-all` to maximize parallelism. It automatically starts each task at the earliest possible moment.
- `.agents/skills/vercel-react-best-practices/rules/async-parallel.md`: When async operations have no interdependencies, execute them concurrently using `Promise.all()`.
- `.agents/skills/vercel-react-best-practices/rules/async-suspense-boundaries.md`: Instead of awaiting data in async components before returning JSX, use Suspense boundaries to show the wrapper UI faster while data loads.
- `.agents/skills/vercel-react-best-practices/rules/bundle-barrel-imports.md`: Import directly from source files instead of barrel files to avoid loading thousands of unused modules. **Barrel files** are entry points that re-export multiple modules (e.g., `index.js` that does `export * from './module'`).
- `.agents/skills/vercel-react-best-practices/rules/bundle-conditional.md`: Load large data or modules only when a feature is activated.
- `.agents/skills/vercel-react-best-practices/rules/bundle-defer-third-party.md`: Analytics, logging, and error tracking don't block user interaction. Load them after hydration.
- `.agents/skills/vercel-react-best-practices/rules/bundle-dynamic-imports.md`: Use `next/dynamic` to lazy-load large components not needed on initial render.
- `.agents/skills/vercel-react-best-practices/rules/bundle-preload.md`: Preload heavy bundles before they're needed to reduce perceived latency.
- `.agents/skills/vercel-react-best-practices/rules/client-event-listeners.md`: Use `useSWRSubscription()` to share global event listeners across component instances.
- `.agents/skills/vercel-react-best-practices/rules/client-localstorage-schema.md`: Add version prefix to keys and store only needed fields. Prevents schema conflicts and accidental storage of sensitive data.
- `.agents/skills/vercel-react-best-practices/rules/client-passive-event-listeners.md`: Add `{ passive: true }` to touch and wheel event listeners to enable immediate scrolling. Browsers normally wait for listeners to finish to check if `preventDefault()` is called, causing scroll delay.
- `.agents/skills/vercel-react-best-practices/rules/client-swr-dedup.md`: SWR enables request deduplication, caching, and revalidation across component instances.
- `.agents/skills/vercel-react-best-practices/rules/js-batch-dom-css.md`: Avoid interleaving style writes with layout reads. When you read a layout property (like `offsetWidth`, `getBoundingClientRect()`, or `getComputedStyle()`) between style changes, the browser is forced to trigger a synchronous reflow.
- `.agents/skills/vercel-react-best-practices/rules/js-cache-function-results.md`: Use a module-level Map to cache function results when the same function is called repeatedly with the same inputs during render.
- `.agents/skills/vercel-react-best-practices/rules/js-cache-property-access.md`: Cache object property lookups in hot paths.
- `.agents/skills/vercel-react-best-practices/rules/js-cache-storage.md`: **Incorrect (reads storage on every call):**
- `.agents/skills/vercel-react-best-practices/rules/js-combine-iterations.md`: Multiple `.filter()` or `.map()` calls iterate the array multiple times. Combine into one loop.
- `.agents/skills/vercel-react-best-practices/rules/js-early-exit.md`: Return early when result is determined to skip unnecessary processing.
- `.agents/skills/vercel-react-best-practices/rules/js-flatmap-filter.md`: **Impact: LOW-MEDIUM (eliminates intermediate array)**
- `.agents/skills/vercel-react-best-practices/rules/js-hoist-regexp.md`: Don't create RegExp inside render. Hoist to module scope or memoize with `useMemo()`.
- `.agents/skills/vercel-react-best-practices/rules/js-index-maps.md`: Multiple `.find()` calls by the same key should use a Map.
- `.agents/skills/vercel-react-best-practices/rules/js-length-check-first.md`: When comparing arrays with expensive operations (sorting, deep equality, serialization), check lengths first. If lengths differ, the arrays cannot be equal.
- `.agents/skills/vercel-react-best-practices/rules/js-min-max-loop.md`: Finding the smallest or largest element only requires a single pass through the array. Sorting is wasteful and slower.
- `.agents/skills/vercel-react-best-practices/rules/js-request-idle-callback.md`: **Impact: MEDIUM (keeps UI responsive during background tasks)**
- `.agents/skills/vercel-react-best-practices/rules/js-set-map-lookups.md`: Convert arrays to Set/Map for repeated membership checks.
- `.agents/skills/vercel-react-best-practices/rules/js-tosorted-immutable.md`: **Incorrect (mutates original array):**
- `.agents/skills/vercel-react-best-practices/rules/rendering-activity.md`: Use React's `<Activity>` to preserve state/DOM for expensive components that frequently toggle visibility.
- `.agents/skills/vercel-react-best-practices/rules/rendering-animate-svg-wrapper.md`: Many browsers don't have hardware acceleration for CSS3 animations on SVG elements. Wrap SVG in a `<div>` and animate the wrapper instead.
- `.agents/skills/vercel-react-best-practices/rules/rendering-conditional-render.md`: Use explicit ternary operators (`? :`) instead of `&&` for conditional rendering when the condition can be `0`, `NaN`, or other falsy values that render.
- `.agents/skills/vercel-react-best-practices/rules/rendering-content-visibility.md`: Apply `content-visibility: auto` to defer off-screen rendering.
- `.agents/skills/vercel-react-best-practices/rules/rendering-hoist-jsx.md`: Extract static JSX outside components to avoid re-creation.
- `.agents/skills/vercel-react-best-practices/rules/rendering-hydration-no-flicker.md`: When rendering content that depends on client-side storage (localStorage, cookies), avoid both SSR breakage and post-hydration flickering by injecting a synchronous script that updates the DOM before React hydrates.
- `.agents/skills/vercel-react-best-practices/rules/rendering-hydration-suppress-warning.md`: In SSR frameworks (e.g., Next.js), some values are intentionally different on server vs client (random IDs, dates, locale/timezone formatting). For these *expected* mismatches, wrap the dynamic text in an element with `suppressHydrationWarning` to prevent noisy warnings. Do not use this to hide r...
- `.agents/skills/vercel-react-best-practices/rules/rendering-resource-hints.md`: **Impact: HIGH (reduces load time for critical resources)**
- `.agents/skills/vercel-react-best-practices/rules/rendering-script-defer-async.md`: **Impact: HIGH (eliminates render-blocking)**
- `.agents/skills/vercel-react-best-practices/rules/rendering-svg-precision.md`: Reduce SVG coordinate precision to decrease file size. The optimal precision depends on the viewBox size, but in general reducing precision should be considered.
- `.agents/skills/vercel-react-best-practices/rules/rendering-usetransition-loading.md`: Use `useTransition` instead of manual `useState` for loading states. This provides built-in `isPending` state and automatically manages transitions.
- `.agents/skills/vercel-react-best-practices/rules/rerender-defer-reads.md`: Don't subscribe to dynamic state (searchParams, localStorage) if you only read it inside callbacks.
- `.agents/skills/vercel-react-best-practices/rules/rerender-dependencies.md`: Specify primitive dependencies instead of objects to minimize effect re-runs.
- `.agents/skills/vercel-react-best-practices/rules/rerender-derived-state-no-effect.md`: If a value can be computed from current props/state, do not store it in state or update it in an effect. Derive it during render to avoid extra renders and state drift. Do not set state in effects solely in response to prop changes; prefer derived values or keyed resets instead.
- `.agents/skills/vercel-react-best-practices/rules/rerender-derived-state.md`: Subscribe to derived boolean state instead of continuous values to reduce re-render frequency.
- `.agents/skills/vercel-react-best-practices/rules/rerender-functional-setstate.md`: When updating state based on the current state value, use the functional update form of setState instead of directly referencing the state variable. This prevents stale closures, eliminates unnecessary dependencies, and creates stable callback references.
- `.agents/skills/vercel-react-best-practices/rules/rerender-lazy-state-init.md`: Pass a function to `useState` for expensive initial values. Without the function form, the initializer runs on every render even though the value is only used once.
- `.agents/skills/vercel-react-best-practices/rules/rerender-memo-with-default-value.md`: When memoized component has a default value for some non-primitive optional parameter, such as an array, function, or object, calling the component without that parameter results in broken memoization. This is because new value instances are created on every rerender, and they do not pass strict...
- `.agents/skills/vercel-react-best-practices/rules/rerender-memo.md`: Extract expensive work into memoized components to enable early returns before computation.
- `.agents/skills/vercel-react-best-practices/rules/rerender-move-effect-to-event.md`: If a side effect is triggered by a specific user action (submit, click, drag), run it in that event handler. Do not model the action as state + effect; it makes effects re-run on unrelated changes and can duplicate the action.
- `.agents/skills/vercel-react-best-practices/rules/rerender-no-inline-components.md`: **Impact: HIGH (prevents remount on every render)**
- `.agents/skills/vercel-react-best-practices/rules/rerender-simple-expression-in-memo.md`: When an expression is simple (few logical or arithmetical operators) and has a primitive result type (boolean, number, string), do not wrap it in `useMemo`. Calling `useMemo` and comparing hook dependencies may consume more resources than the expression itself.
- `.agents/skills/vercel-react-best-practices/rules/rerender-split-combined-hooks.md`: When a hook contains multiple independent tasks with different dependencies, split them into separate hooks. A combined hook reruns all tasks when any dependency changes, even if some tasks don't use the changed value.
- `.agents/skills/vercel-react-best-practices/rules/rerender-transitions.md`: Mark frequent, non-urgent state updates as transitions to maintain UI responsiveness.
- `.agents/skills/vercel-react-best-practices/rules/rerender-use-deferred-value.md`: When user input triggers expensive computations or renders, use `useDeferredValue` to keep the input responsive. The deferred value lags behind, allowing React to prioritize the input update and render the expensive result when idle.
- `.agents/skills/vercel-react-best-practices/rules/rerender-use-ref-transient-values.md`: When a value changes frequently and you don't want a re-render on every update (e.g., mouse trackers, intervals, transient flags), store it in `useRef` instead of `useState`. Keep component state for UI; use refs for temporary DOM-adjacent values. Updating a ref does not trigger a re-render.
- `.agents/skills/vercel-react-best-practices/rules/server-after-nonblocking.md`: Use Next.js's `after()` to schedule work that should execute after a response is sent. This prevents logging, analytics, and other side effects from blocking the response.
- `.agents/skills/vercel-react-best-practices/rules/server-auth-actions.md`: **Impact: CRITICAL (prevents unauthorized access to server mutations)**
- `.agents/skills/vercel-react-best-practices/rules/server-cache-lru.md`: **Implementation:**
- `.agents/skills/vercel-react-best-practices/rules/server-cache-react.md`: Use `React.cache()` for server-side request deduplication. Authentication and database queries benefit most.
- `.agents/skills/vercel-react-best-practices/rules/server-dedup-props.md`: **Impact: LOW (reduces network payload by avoiding duplicate serialization)**
- `.agents/skills/vercel-react-best-practices/rules/server-hoist-static-io.md`: **Impact: HIGH (avoids repeated file/network I/O per request)**
- `.agents/skills/vercel-react-best-practices/rules/server-no-shared-module-state.md`: For React Server Components and client components rendered during SSR, avoid using mutable module-level variables to share request-scoped data. Server renders can run concurrently in the same process. If one render writes to shared module state and another render reads it, you can get race condit...
- `.agents/skills/vercel-react-best-practices/rules/server-parallel-fetching.md`: React Server Components execute sequentially within a tree. Restructure with composition to parallelize data fetching.
- `.agents/skills/vercel-react-best-practices/rules/server-parallel-nested-fetching.md`: When fetching nested data in parallel, chain dependent fetches within each item's promise so a slow item doesn't block the rest.
- `.agents/skills/vercel-react-best-practices/rules/server-serialization.md`: The React Server/Client boundary serializes all object properties into strings and embeds them in the HTML response and subsequent RSC requests. This serialized data directly impacts page weight and load time, so **size matters a lot**. Only pass fields that the client actually uses.

## Humanizer

Remove signs of AI-generated writing from text. Use when editing or reviewing text to make it sound more natural and human-written. Based on Wikipedia's comprehensive "Signs of AI writing" guide. Detects and fixes patterns including: inflated symbolism, promotional language, superficial -ing analyses, vague attributions, em dash overuse, rule of three, AI vocabulary words, passive voice, negative parallelisms, and filler phrases.

- `.agents/skills/humanizer/SKILL.md`

<!-- autoskills:end -->
