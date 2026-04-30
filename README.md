# Astro + shadcn/ui Project

Starter for Astro, React islands, Tailwind CSS v4, and shadcn/ui.

## Components
- `Button`: `src/components/ui/button.tsx`

Check the current shadcn state:

```bash
npx shadcn@latest info
```

## Tech Stack
- Astro v6
- React v19.2.5
- Tailwind CSS v4.1.18
- TypeScript

> For a complete list of technologies and versions, check the package.json file.

## Working with shadcn/ui

Use `latest`, not `canary`, unless you are testing a specific upstream issue:

```bash
npx shadcn@latest add button
npx shadcn@latest add card dialog input label select textarea
```

Before adding or updating components, inspect what the CLI will change:

```bash
npx shadcn@latest add card --dry-run
npx shadcn@latest add card --diff src/components/ui/card.tsx
```

Priority for this starter:

1. Keep `components.json` as the source of truth for aliases, style, icon library, and the global CSS file.
2. Add only components that are actually used by the project. Do not run `add --all` for a starter.
3. Keep shadcn components in `src/components/ui` and app-specific components in `src/components`.
4. Use semantic classes from the theme, for example `bg-background`, `text-foreground`, `bg-primary`, and `text-muted-foreground`.
5. Add registry blocks only when the registry is explicit, for example `@shadcn`, `@magicui`, or another named registry.

Recommended starter components:

- Core actions: `button`
- Layout/content: `card`, `separator`, `badge`
- Forms: `input`, `label`, `textarea`, `select`, `checkbox`, `radio-group`, `switch`
- Feedback: `alert`, `sonner`, `skeleton`
- Navigation: `tabs`, `dropdown-menu`, `breadcrumb`
- Overlays when needed: `dialog`, `sheet`, `popover`, `tooltip`

Astro usage notes:

- Plain shadcn React components can be rendered from `.astro` files for static markup.
- Components that use browser state, events, or effects need an Astro client directive, for example `client:load` or `client:visible`.
- Global shadcn theme tokens live in `src/styles/global.css`; do not create a second theme file.
- Import UI components through the configured alias, for example `@/components/ui/button`.

## Magic UI MCP

This starter includes Magic UI MCP config for local project use:

- Codex: `.codex/config.toml`
- Antigravity and VS Code MCP format: `.vscode/mcp.json`
- Generic MCP clients: `.mcp.json`

The server config is:

```json
{
  "mcpServers": {
    "magicuidesign-mcp": {
      "command": "npx",
      "args": ["-y", "@magicuidesign/mcp@latest"]
    }
  }
}
```

After installing the starter, restart Codex or Antigravity so the MCP client reloads its project config. In Codex, use `/mcp` to confirm `magicuidesign-mcp` is active.

For Magic UI components, prefer the shadcn registry path:

```bash
npx shadcn@latest add @magicui/magic-card
npx shadcn@latest add @magicui/border-beam
npx shadcn@latest add @magicui/animated-beam
```

Use Magic UI for expressive animated sections and keep base controls in shadcn/ui.

## Scripts
- `npm run dev` - Development server
- `npm run build` - Production build
- `npm run preview` - Preview build

## Using as a Template

You can create a new project based on this template using our automated setup script.

**Example 1: Install into the current folder (`.`)**
```bash
curl -fsSL https://raw.githubusercontent.com/exorich-lab/astro-blank/main/install.sh | bash -s -- .
```
*Start the development server:*
```bash
npm run dev
```

**Example 2: Install into a new folder named `frontend`**
```bash
curl -fsSL https://raw.githubusercontent.com/exorich-lab/astro-blank/main/install.sh | bash -s -- frontend
```
*Start the development server:*
```bash
cd frontend
npm run dev
```

The script downloads the template, initializes a Git repository, installs dependencies, and keeps the project-level MCP configs in place.

## Built-in AI Skills

This boilerplate comes pre-configured with 14 specialized development skills for AI agents (located in the `.agents/skills` directory and mapped via `AGENTS.md`). These keep coding assistants aligned with the starter's framework, UI, accessibility, and content rules.

1. **Accessibility (a11y)**: WCAG 2.2 guidelines and patterns.
2. **Astro Usage Guide**: Structure, adapters, and SSR patterns.
3. **Design Thinking**: Premium, glassmorphism UI/UX patterns.
4. **Node.js Backend Patterns**: Complex architectures and API design.
5. **Node.js Best Practices**: Architectural and async decision-making.
6. **SEO Optimization**: Engine visibility and ranking methodologies.
7. **shadcn/ui**: Component management and composition rules.
8. **Magic UI Generator**: Premium animated shadcn-style component variants and Magic UI MCP workflow.
9. **Tailwind CSS Patterns**: Utility layout and styling systems.
10. **Tailwind v4 + shadcn/ui Stack**: Modern CSS variable architecture.
11. **TypeScript Advanced Types**: Complex type logic and generic safety.
12. **React Composition Patterns**: Standard Vercel compound component composition.
13. **Vercel React Best Practices**: Performance optimizations.
14. **Humanizer**: Detection and removal of AI writing patterns.
