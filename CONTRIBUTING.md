# Contributing

Thanks for helping build the Filecoin Pin demo! This document captures the preferred project layout, integration points for [`filecoin-pin`](https://github.com/filecoin-project/filecoin-pin), and day-to-day conventions.

## Local Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Authentication

Create a `.env` file in the project root with authentication credentials. Choose one method:

**Option 1: Private Key (local development only)**

Use this for quick local development and testing. **Never commit private keys to version control.**

```env
VITE_FILECOIN_PRIVATE_KEY=0x...  # Your wallet's private key (use calibration test keys)
```

**Option 2: Session Key (recommended for deployments)**

Session keys allow multiple users to share a wallet safely without exposing the private key. This is the recommended approach when users don't bring their own wallet.

```env
VITE_WALLET_ADDRESS=0x...        # The wallet address that created the session key
VITE_SESSION_KEY=0x...           # A session key authorized for this wallet
```

**Optional environment variables:**

```env
VITE_FILECOIN_RPC_URL=wss://...           # Override Filecoin RPC endpoint (default: Calibration testnet)
VITE_WARM_STORAGE_ADDRESS=0x...           # Override warm storage contract address
```

### 3. Get Test Tokens (if using your own wallet)

The demo runs on Filecoin Calibration testnet and requires two types of tokens:

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
```

## Source Layout

This demo follows a simple structure that separates core logic from UI components.

### Core [`filecoin-pin`](https://github.com/filecoin-project/filecoin-pin) Integration

The main logic demonstrating `filecoin-pin` usage:

- **[`src/hooks/use-filecoin-upload.ts`](src/hooks/use-filecoin-upload.ts)** - Core upload hook showing how to use `filecoin-pin` to upload files to Filecoin with progress tracking.
- **[`src/context/filecoin-pin-provider.tsx`](src/context/filecoin-pin-provider.tsx)** - React context that initializes and exposes the Synapse client, manages wallet state.
- **[`src/lib/filecoin-pin/`](src/lib/filecoin-pin/)** - Configuration and Synapse client singleton.
  - [`config.ts`](src/lib/filecoin-pin/config.ts) - Reads environment variables for Synapse configuration (supports both private key and session key auth).
  - [`synapse.ts`](src/lib/filecoin-pin/synapse.ts) - Singleton pattern for Synapse client initialization.
  - [`wallet.ts`](src/lib/filecoin-pin/wallet.ts) - Helper functions for fetching and formatting wallet data.
- **[`src/lib/local-storage/`](src/lib/local-storage/)** - Browser localStorage utilities.
  - [`data-set.ts`](src/lib/local-storage/data-set.ts) - Stores and retrieves data set IDs scoped by wallet address.

### Supporting Hooks

- [`src/hooks/use-data-set-manager.ts`](src/hooks/use-data-set-manager.ts) - Manages data set lifecycle (creation, localStorage persistence, storage context).
- [`src/hooks/use-wallet.ts`](src/hooks/use-wallet.ts) - Selector hook for wallet data (address, balances) used in the header.
- [`src/hooks/use-ipni-check.ts`](src/hooks/use-ipni-check.ts) - Polls IPNI to verify CID announcements after upload.
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
