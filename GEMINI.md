# Gemini Project Overview: astro-master

This document provides a summary of the `astro-master` project for the Gemini assistant.

## Project Description

This is a starter project built with Astro. It integrates React for UI components, Tailwind CSS for styling, and shadcn/ui for a pre-built component library. The project is set up with TypeScript and includes support for animations with Framer Motion and icons from Lucide React.

## Key Technologies

| Technology      | Version      | Notes                               |
| --------------- | ------------ | ----------------------------------- |
| Astro           | `^5.13.2`    | Core framework                      |
| React           | `^19.1.1`    | For interactive UI components       |
| Tailwind CSS    | `^4.1.3`     | Utility-first CSS framework         |
| TypeScript      | `~`          | Used for type safety                |
| shadcn/ui       | `~`          | Component library (via npx)         |
| Framer Motion   | `^12.23.12`  | For animations                      |
| Lucide React    | `^0.539.0`   | For icons                           |

## Project Structure

- `astro.config.mjs`: Astro configuration file.
- `src/`: Main source code directory.
  - `components/`: Reusable components (Astro and React).
    - `ui/`: Components from shadcn/ui.
  - `layouts/`: Base page layouts.
  - `pages/`: Astro pages and API routes.
  - `styles/`: Global styles.
  - `lib/`: Utility functions.
- `public/`: Static assets.
- `package.json`: Project dependencies and scripts.

## Development Workflow

### Running the project

- **Development:** `npm run dev`
- **Build:** `npm run build`
- **Preview:** `npm run preview`

### Adding Components

New shadcn/ui components can be added using the following command:
```bash
npx shadcn@canary add [component-name]
```

This will add the component source files to `src/components/ui`.
