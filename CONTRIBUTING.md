# Contributing

Thanks for helping build the Filecoin Pin demo! This document captures the preferred project layout, upcoming integration points for the [`filecoin-pin`](https://github.com/filecoin-project/filecoin-pin), and day-to-day conventions.

## Local Setup

1. Install dependencies with `npm install`.
2. Run `npm run dev` and open `http://localhost:5173` to iterate locally.
3. Use `npm run lint` before opening a PR.
4. Provide a Vite-friendly `.env` file with:
   - `VITE_FILECOIN_PRIVATE_KEY` – required for Synapse wallet queries (use calibration test keys for local work).
   - `VITE_FILECOIN_RPC_URL` – optional override for the Filecoin RPC endpoint.
   - `VITE_WARM_STORAGE_ADDRESS` – optional warm storage contract override.

## Source Layout

This demo follows a simple structure that separates core logic from UI components.

### Core [`filecoin-pin`](https://github.com/filecoin-project/filecoin-pin) Integration

The main logic demonstrating `filecoin-pin` usage:

- **`src/hooks/use-filecoin-upload.ts`** – Core upload hook showing how to use `filecoin-pin` to upload files to Filecoin with progress tracking.
- **`src/context/filecoin-pin-provider.tsx`** – React context that initializes and exposes the Synapse client, manages wallet state.
- `src/lib/filecoin-pin/` – Configuration and Synapse client singleton.
  - `config.ts` – Reads environment variables for Synapse configuration.
  - `synapse.ts` – Singleton pattern for Synapse client initialization.
  - `wallet.ts` – Helper functions for fetching and formatting wallet data.

### Supporting Hooks

- `src/hooks/use-wallet.ts` – Selector hook for wallet data (address, balances) used in the header.
- `src/hooks/use-ipni-check.ts` – Polls IPNI to verify CID announcements after upload.

### UI Components

- `src/components/upload/` – Drag-and-drop zone and progress display UI.
- `src/components/layout/` – Header, sidebar, and content layout scaffolding.
- `src/components/common/` – Reusable UI components like buttons.
- `src/app.tsx` – Top-level shell.
- `src/main.tsx` – React entry point and provider registration.

Keep UI-only concerns inside `src/components/` and use the hooks above to consume Filecoin data.

## Coding Guidelines

- TypeScript, React, and Vite defaults apply. Prefer functional components and hooks.
- Use Biome (`npm run lint` / `npm run lint:fix`) for formatting and linting.
- Keep comments concise; favor self-documenting code when possible.
- When adding hooks or context, provide minimal unit tests or storybook-like examples once testing scaffolding is in place.

## Pull Requests

- Reference the GitHub issue in the PR description.
- Include screenshots or terminal output for user-facing changes or CLI flows.
- Ensure new directories and files adhere to the structure above so future contributors can quickly navigate Filecoin integration points.
