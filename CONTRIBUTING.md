# Contributing

Thanks for helping build the Filecoin Pin demo! This document captures the preferred project layout, upcoming integration points for the [`filecoin-pin`](https://github.com/filecoin-project/filecoin-pin), and day-to-day conventions.

## Local Setup

1. Install dependencies with `npm install`.
2. Run `npm run dev` and open `http://localhost:5173` to iterate locally.
3. Use `npm run lint` before opening a PR.
4. Provide a Vite-friendly `.env` file with authentication (choose one method):

   **Option 1: Private Key (local development only)**
   - `VITE_FILECOIN_PRIVATE_KEY` – Your wallet's private key (use calibration test keys for local work).

   **Option 2: Session Key (recommended for deployments)**
   - `VITE_WALLET_ADDRESS` – The wallet address that created the session key.
   - `VITE_SESSION_KEY` – A session key authorized for this wallet.

   **Optional environment variables:**
   - `VITE_FILECOIN_RPC_URL` – Optional override for the Filecoin RPC endpoint.
   - `VITE_WARM_STORAGE_ADDRESS` – Optional warm storage contract override.

## Source Layout

This demo follows a simple structure that separates core logic from UI components.

### Core [`filecoin-pin`](https://github.com/filecoin-project/filecoin-pin) Integration

The main logic demonstrating `filecoin-pin` usage:

- **`src/hooks/use-filecoin-upload.ts`** – Core upload hook showing how to use `filecoin-pin` to upload files to Filecoin with progress tracking.
- **`src/context/filecoin-pin-provider.tsx`** – React context that initializes and exposes the Synapse client, manages wallet state.
- `src/lib/filecoin-pin/` – Configuration and Synapse client singleton.
  - `config.ts` – Reads environment variables for Synapse configuration (supports both private key and session key auth).
  - `synapse.ts` – Singleton pattern for Synapse client initialization.
  - `wallet.ts` – Helper functions for fetching and formatting wallet data.
- `src/lib/local-storage/` – Browser localStorage utilities.
  - `data-set.ts` – Stores and retrieves data set IDs scoped by wallet address.

### Supporting Hooks

- `src/hooks/use-data-set-manager.ts` – Manages data set lifecycle (creation, localStorage persistence, storage context).
- `src/hooks/use-wallet.ts` – Selector hook for wallet data (address, balances) used in the header.
- `src/hooks/use-ipni-check.ts` – Polls IPNI to verify CID announcements after upload.
- `src/hooks/use-dataset-pieces.ts` – Fetches and displays uploaded pieces from a data set.

### UI Components

- `src/components/upload/` – Drag-and-drop zone and progress display UI.
- `src/components/layout/` – Header, sidebar, and content layout scaffolding.
- `src/components/file-picker/` – File selection UI with drag-and-drop support.
- `src/components/ui/` – Reusable UI components (buttons, cards, badges, etc.).
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
