# Filecoin Pin Demo

A simple, easy-to-understand demo showing how to use [`filecoin-pin`](https://github.com/filecoin-project/filecoin-pin) to upload files to Filecoin. This single-page React + TypeScript app demonstrates the core upload workflow with progress tracking and wallet integration.

## Key Files - Understanding the Demo

The main logic for using `filecoin-pin` is in just two files:

- **`src/hooks/use-filecoin-upload.ts`** - The heart of the demo. Shows how to:
  - Create a CAR file from user files
  - Check upload readiness
  - Execute uploads to Filecoin
  - Track progress through each step

- **`src/context/filecoin-pin-provider.tsx`** - Manages the Synapse client initialization and wallet state. All other hooks consume this context.

Everything else in the codebase is just UI components and glue code to wire up the demo experience.

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

Core logic:
- **`src/hooks/use-filecoin-upload.ts`** – Main upload logic demonstrating `filecoin-pin` usage
- **`src/context/filecoin-pin-provider.tsx`** – Synapse client and wallet state management
- `src/hooks/use-wallet.ts` – Simple selector hook for wallet data
- `src/hooks/use-ipni-check.ts` – Polls IPNI to verify CID announcements
- `src/lib/filecoin-pin/` – Configuration and Synapse client singleton

UI components (standard React):
- `src/components/upload/` – Drag-and-drop zone and progress display
- `src/components/layout/` – Header, sidebar, content layout
- `src/app.tsx` – Top-level layout shell
- `src/main.tsx` – React entry point

Config:
- `tsconfig.json` – TypeScript configuration
- `biome.json` – Biome rules for linting/formatting
- `vite.config.ts` – Vite dev server and build configuration

## Outstanding Work

### Multi-User Support with Shared Wallet

**Status:** Not yet implemented

This demo site is designed to be deployed with a shared session key for a private Calibration testnet wallet. Multiple users will be uploading files using the same wallet/data set, but each user should only see their own uploads when they return to the site.

**What's needed:**
- Track uploaded piece metadata in browser localStorage (piece CID, root CID, file name, upload timestamp)
- When displaying uploads, filter the data set pieces to only show those that match the user's localStorage records
- Use the `metadata` field on uploads (now supported) to store labels like filename for better UX

**Current state:**
- ✅ Metadata support is implemented in `filecoin-pin` and can be passed through `executeUpload()`
- ✅ Uploads work and store files to the shared data set
- ❌ No localStorage tracking - users can't see their previous uploads
- ❌ No UI to display a user's upload history
- ❌ No filtering - would show all pieces in the shared data set if we fetched them

**Technical approach:**
1. When upload completes, store `{ pieceCid, rootCid, label, timestamp }` to localStorage
2. Create a hook to fetch piece metadata for pieces in localStorage using `warmStorage.getPieceMetadata(dataSetId, pieceId)`
3. Display filtered list of user's uploads with download links

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the planned module structure and workflow guidelines.
