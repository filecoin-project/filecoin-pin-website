# Filecoin Pin Demo

Single-page React + TypeScript app scaffolding the experience for Filecoin Pin. The goal is to provide a lightweight demo that ships with a hard-coded wallet, a file upload flow, and the base layout for later hi‑fi mock integration.

## Stack

- Vite for dev server and bundling
- React 19 with the modern JSX runtime
- TypeScript with strict settings
- Biome for formatting, linting, and import hygiene

## Prerequisites

- Node.js 18.0+ (Vite supports the active LTS releases)
- npm 9+ (bundled with Node)

## Getting Started

1. Install dependencies:
   ```sh
   npm install
   ```
2. Launch the dev server:
   ```sh
   npm run dev
   ```
3. Visit `http://localhost:5173` to view the SPA.

The Vite server supports hot-module reloading, so UI changes show up immediately.

## Scripts

- `npm run dev` – start Vite in development mode.
- `npm run build` – run a TypeScript type-check (`tsc --noEmit`) and create the production build in `dist/`.
- `npm run preview` – serve the production bundle locally for smoke testing.
- `npm run lint` – run Biome checks.
- `npm run lint:fix` – apply Biome fixes.

## Project Layout

- `src/app.tsx` – top-level layout shell for the demo.
- `src/main.tsx` – React entry point; Vite mounts the SPA here.
- `src/app.css` – global styles; tailor to match hi-fi mocks.
- `public/` – static assets copied as-is.
- `tsconfig.json` – TypeScript configuration shared by app and tooling.
- `biome.json` – Biome rules for linting/formatting.

## Next Steps

- Wire the hardcoded wallet logic into the Filecoin Pin client SDK.
- Build the file upload workflow, including progress states and success/error handling.
- Layer in design system components or styles that align with the upcoming high-fidelity mocks.
