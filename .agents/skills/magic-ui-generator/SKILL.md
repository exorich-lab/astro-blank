---
name: magic-ui-generator
description: Utilizes Magic by 21st.dev to generate, compare, and integrate multiple production-ready UI component variations.
risk: safe
source: community
date_added: "2026-03-07"
---

# Magic UI Generator

Use Magic by 21st.dev and Magic UI patterns to build modern, responsive UI components with an AI-native workflow that prioritizes choice and design quality.

## Context

This skill is for building modern, responsive UI components. Instead of generating one standard solution, it provides multiple design variations to choose from, drawing inspiration from real-world component libraries and premium design patterns such as shadcn/ui, Magic UI, and Aceternity.

## When to Use

Trigger this skill whenever:

- A new UI component is requested, for example pricing tables, contact forms, hero sections, dashboards, cards, navigation, or feature sections.
- An existing UI element needs better styling, animations, or advanced interaction.
- The user wants different design directions for one feature.
- Professional logos or icons are needed.
- The request mentions Magic UI, 21st.dev, Aceternity, premium UI, animated shadcn-style components, or side-by-side component variants.

## Project Setup

This starter ships with Magic UI MCP configuration for local project use:

- Codex: `.codex/config.toml`
- Antigravity / VS Code MCP format: `.vscode/mcp.json`
- Generic MCP clients: `.mcp.json`

The MCP server is:

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

For Antigravity project-level config, use `.vscode/mcp.json` with `servers`, not `mcpServers`.

## Execution Workflow

1. Review `components.json` and follow its aliases, style, icon library, and Tailwind CSS file.
2. Run `npx shadcn@latest info` to confirm installed components and project paths.
3. If the request is broad, define two or three distinct visual directions before editing code.
4. Use the Magic UI MCP server when available.
5. Prefer registry installation over manual copying:

```bash
npx shadcn@latest add @magicui/magic-card
npx shadcn@latest add @magicui/border-beam
npx shadcn@latest add @magicui/animated-beam
```

6. Review every generated file. Fix aliases, missing dependencies, icon imports, composition, and Astro client directives.
7. Run `npm run build` after changes.

## Strict Rules

- Use this skill only when the task clearly needs premium UI, Magic UI, animated surfaces, visual variants, or shadcn-style component generation.
- Offer multiple design variations before final implementation when the user is choosing a visual direction.
- Keep code accessible, responsive, typed, and aligned with Astro + React islands.
- Treat Magic UI as a layer on top of shadcn/ui, not a replacement for base primitives.
- Keep base controls from shadcn/ui: buttons, inputs, dialogs, sheets, tabs, menus, and form structure.
- Use Magic UI for expressive surfaces: beams, bordered cards, marquees, particles, reveal text, premium hero motion, and visual polish.
- Keep theme tokens in `src/styles/global.css`. Do not create another global theme file.
- Use semantic Tailwind tokens, for example `bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, and `border-border`.
- Do not hardcode generic purple gradients or one-note dark palettes.
- User-facing website copy must pass through the `humanizer` skill before finalizing.

## Astro Notes

- Static React components can be rendered from `.astro` files.
- Components with browser state, events, effects, animation runtime, or DOM APIs need an Astro client directive such as `client:load` or `client:visible`.
- App-specific composed components belong in `src/components`.
- Registry UI primitives belong in `src/components/ui`.

## Dependency Notes

Common Magic UI components may require `motion`, `framer-motion`, `lucide-react`, or extra shadcn primitives. Install only what the selected component needs.

This starter already includes React, Tailwind CSS v4, shadcn config, `lucide-react`, and `framer-motion`.

## Verification

Run:

```bash
npx shadcn@latest info
npm run build
```

For visual changes, start the dev server and inspect the page in a browser.
