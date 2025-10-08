# Contributing

Thanks for helping build the Filecoin Pin demo! This document captures the preferred project layout, upcoming integration points for the [`filecoin-pin`](https://github.com/filecoin-project/filecoin-pin), and day-to-day conventions.

## Local Setup

1. Install dependencies with `npm install`.
2. Run `npm run dev` and open `http://localhost:5173` to iterate locally.
3. Use `npm run lint` before opening a PR.

## Source Layout

The project follows a feature-first structure that separates layout components from Filecoin integration code. Existing directories:

- `src/components/layout/` – header, sidebar, and content scaffolding.
- `src/app.tsx` – top-level shell.
- `src/main.tsx` – React entry point and provider registration.

### Planned [`filecoin-pin`](https://github.com/filecoin-project/filecoin-pin) Integration

The following modules are expected to house reusable logic. Create the directories if they do not exist yet and wire them in as the functionality lands.

- `src/lib/filecoin-pin/` – thin wrappers for `filecoin-pin`/Synapse helpers (e.g., wallet status formatters, upload orchestration utilities).
- `src/context/FilecoinPinProvider.tsx` – React context that initializes Synapse, stores wallet state, and exposes upload actions.
- `src/hooks/`
  - `useFilecoinPin.ts` – base hook returning the full context value.
  - `useWallet.ts` – selector hook for showing tFIL, tUSDFC, and address data in the header.
  - `useUpload.ts` – selector hook powering the drag-and-drop upload experience.
- `src/components/upload/` – UI components for the drag-and-drop zone, progress states, and result display (IPFS CID, piece CID, transaction hash).

Keep UI-only concerns inside `src/components/<namespace>/` and use the hooks above to consume Filecoin data.

## Coding Guidelines

- TypeScript, React, and Vite defaults apply. Prefer functional components and hooks.
- Use Biome (`npm run lint` / `npm run lint:fix`) for formatting and linting.
- Keep comments concise; favor self-documenting code when possible.
- When adding hooks or context, provide minimal unit tests or storybook-like examples once testing scaffolding is in place.

## Pull Requests

- Reference the GitHub issue in the PR description.
- Include screenshots or terminal output for user-facing changes or CLI flows.
- Ensure new directories and files adhere to the structure above so future contributors can quickly navigate Filecoin integration points.
