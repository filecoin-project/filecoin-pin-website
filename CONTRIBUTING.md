# Contributing

Thanks for helping build the Filecoin Pin demo! This document captures the preferred project layout, integration points for [`filecoin-pin`](https://github.com/filecoin-project/filecoin-pin), and day-to-day conventions.

## Local Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Browser Wallet Authentication

The app uses the connected browser wallet and defaults to Filecoin Mainnet. Calibration is available in the network selector. It does not use deployment private keys or a shared session key.

Connect an Ethereum-compatible browser wallet. In Wallet setup, authorize a browser session with an explicit lifetime. The session is granted all four Warm Storage permissions: create data sets, add pieces, schedule piece removals, and terminate services. Deposit USDFC and approve storage payments separately with the owner wallet.

WalletConnect defaults to Beck’s registered public project ID. To override it, copy [`.env.example`](.env.example) to `.env.local`, set `VITE_WALLETCONNECT_PROJECT_ID`, then restart Vite. The remote provider and QR modal are loaded lazily by [`wallet-connect.ts`](src/lib/filecoin-pin/wallet-connect.ts). Injected and remote wallets share the same session authorization and wallet/network isolation.

Session credentials are encrypted in IndexedDB using a non-exportable AES-GCM wrapping key. Directory backups contain file metadata only. Scripts running on the same origin can still use stored credentials; encryption does not protect against a compromised application origin.

### 3. Get Test Tokens (if using your own wallet)

For development, select Calibration and use test tokens. Mainnet operations spend real FIL and USDFC. Both networks require:

- **Test FIL** - For transaction gas fees
  - Get from: [Filecoin Calibration Faucet](https://faucet.calibnet.chainsafe-fil.io/funds.html)

- **Test USDFC** - For storage payments (USD stablecoin backed by FIL)
  - Get from: [USDFC Faucet](https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc)

### 4. Run the Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` to see the app.

### 5. Code Quality

Before opening a PR, run:

```bash
npm run lint       # Check for issues
npm run lint:fix   # Auto-fix formatting and linting
npm run test       # Unit and regression tests
npm run build      # Type check and production build
```

## Source Layout

This demo follows a simple structure that separates core logic from UI components.

### Core [`filecoin-pin`](https://github.com/filecoin-project/filecoin-pin) Integration

The main logic demonstrating `filecoin-pin` usage:

- **[`src/hooks/use-filecoin-upload.ts`](src/hooks/use-filecoin-upload.ts)** - Core upload hook showing how to use `filecoin-pin` to upload files to Filecoin with progress tracking.
- **[`src/context/filecoin-pin-provider.tsx`](src/context/filecoin-pin-provider.tsx)** - React context that initializes and exposes the Synapse client, manages wallet state.
- **[`src/lib/filecoin-pin/`](src/lib/filecoin-pin/)** - Connected-wallet configuration and Synapse clients.
  - [`config.ts`](src/lib/filecoin-pin/config.ts) - Default network and session lifetime.
  - [`synapse.ts`](src/lib/filecoin-pin/synapse.ts) - Integration types and application source.
  - [`wallet.ts`](src/lib/filecoin-pin/wallet.ts) - Helper functions for fetching and formatting wallet data.
- **[`src/lib/local-storage/`](src/lib/local-storage/)** - Browser localStorage utilities.
  - [`data-set.ts`](src/lib/local-storage/data-set.ts) - Stores and retrieves data set IDs scoped by wallet address.

### Browser Drive

- [`src/context/browser-wallet-provider.tsx`](src/context/browser-wallet-provider.tsx) — wallet discovery, account selection, network switching, session authorization and revocation.
- [`src/lib/filecoin-pin/browser-wallet.ts`](src/lib/filecoin-pin/browser-wallet.ts) — owner and session clients with chain permission validation.
- [`src/lib/local-storage/session-vault.ts`](src/lib/local-storage/session-vault.ts) — encrypted browser session persistence.
- [`src/lib/local-storage/drive-directory.ts`](src/lib/local-storage/drive-directory.ts) — virtual folders and validated directory backups.
- [`src/components/drive/`](src/components/drive/) — wallet setup, file table, folder navigation and file details.
- [`src/lib/filecoin-pin/download.ts`](src/lib/filecoin-pin/download.ts) and [`delete.ts`](src/lib/filecoin-pin/delete.ts) — original-file retrieval and resumable scheduling of removals.
- [`src/lib/filecoin-pin/upload-funding.ts`](src/lib/filecoin-pin/upload-funding.ts) — read-only funding quotes for the exact storage contexts used by an upload.

To run the mocked browser checks, start `npm run dev`, install Chromium with `npx playwright install chromium`, then run `npm run test:drive`. On a machine with Chrome installed, use `PLAYWRIGHT_CHANNEL=chrome npm run test:drive`. The checks mock wallet requests and external RPCs and do not submit transactions to a live network.

To exercise the WalletConnect UI without a live relay, use the running dev server and run `DRIVE_TEST_WALLETCONNECT=1 npm run test:drive`. This replaces the remote SDK with a mock and checks lazy loading, pairing parameters, authorization, network/account isolation and disconnect. Use `DRIVE_TEST_URL` if the dev server is on another port. A real project ID and a Filecoin-compatible mobile wallet are required for live QR pairing validation.

Theme colors for foreground, surface, accent, links and status tones live in [`src/index.css`](src/index.css). Use semantic colors for text and icons; white text is reserved for filled buttons whose contrast is checked. With `npm run dev` running, `PLAYWRIGHT_CHANNEL=chrome npm run test:drive:theme` renders shared components and the actual landing page, console and details in both themes. It checks normal, focused and hovered text at 4.5:1 (3:1 for large text) and icons at 3:1; disabled controls are exempt.

### Supporting Hooks

- [`src/hooks/use-data-set-manager.ts`](src/hooks/use-data-set-manager.ts) - Manages data set lifecycle (creation, localStorage persistence, storage context).
- [`src/hooks/use-wallet.ts`](src/hooks/use-wallet.ts) - Selector hook for wallet data (address, balances) used in the header.
- [`src/hooks/use-dataset-pieces.ts`](src/hooks/use-dataset-pieces.ts) - Fetches and displays uploaded pieces from a data set.

### UI Components

- [`src/components/upload/`](src/components/upload/) - Drag-and-drop zone and progress display UI.
- [`src/components/layout/`](src/components/layout/) - Header, sidebar, and content layout scaffolding.
- [`src/components/file-picker/`](src/components/file-picker/) - File selection UI with drag-and-drop support.
- [`src/components/ui/`](src/components/ui/) - Reusable UI components (buttons, cards, badges, etc.).
- [`src/app.tsx`](src/app.tsx) - Top-level shell.
- [`src/main.tsx`](src/main.tsx) - React entry point and provider registration.

Keep UI-only concerns inside [`src/components/`](src/components/) and use the hooks above to consume Filecoin data.

## Coding Guidelines

- TypeScript, React, and Vite defaults apply. Prefer functional components and hooks.
- Use Biome (`npm run lint` / `npm run lint:fix`) for formatting and linting.
- Keep comments concise; favor self-documenting code when possible.
- When adding hooks or context, provide minimal unit tests or storybook-like examples once testing scaffolding is in place.

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages and PR titles.

**Format:** `<type>: <description>`

**Common types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring (no behavior change)
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks, dependency updates

**Examples:**
```
feat: add drag-and-drop file upload support
fix: correct IPNI indexing verification logic
docs: update README with deployment instructions
refactor: simplify wallet initialization flow
```

## Pull Requests

- Use conventional commit format for your PR title (see above).
- Reference the GitHub issue in the PR description.
- Include screenshots or terminal output for user-facing changes or CLI flows.
- Ensure new directories and files adhere to the structure above so future contributors can quickly navigate Filecoin integration points.
