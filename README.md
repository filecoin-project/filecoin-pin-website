# Filecoin Pin Demo

A simple, easy-to-understand demo showing how to use [`filecoin-pin`](https://github.com/filecoin-project/filecoin-pin) to upload files to Filecoin. This single-page React + TypeScript app demonstrates the core upload workflow with progress tracking and wallet integration.

## What This Demo Shows

This app demonstrates the complete `filecoin-pin` upload workflow:
- Create CAR files from user files
- Check upload readiness
- Execute uploads to Filecoin
- Track progress through each step
- Verify CID indexing via IPNI

The core integration logic is in `src/hooks/use-filecoin-upload.ts` and `src/context/filecoin-pin-provider.tsx`. Everything else is UI components. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for detailed file structure.

## Stack

- Vite for dev server and bundling
- React 19 with the modern JSX runtime
- TypeScript with strict settings
- Biome for formatting, linting, and import hygiene

## Prerequisites

- Node.js 18.0+ (Vite supports the active LTS releases)
- npm 9+ (bundled with Node)

## Getting Started

```sh
npm install
npm run dev
```

Visit `http://localhost:5173` to see the demo.

**Available Scripts:**
- `npm run dev` – Start development server
- `npm run build` – Build for production
- `npm run lint` – Check code quality
- `npm run lint:fix` – Fix linting issues

For environment setup and detailed project structure, see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Multi-User Support with Session Keys

This demo supports deployment with a shared session key, allowing multiple users to safely upload files using the same wallet.

**How it works:**
- **Session key authentication** – Uses `VITE_WALLET_ADDRESS` + `VITE_SESSION_KEY` instead of exposing the wallet's private key
- **Per-user data sets** – Each user gets their own data set ID, stored in browser localStorage
- **Data set persistence** – Returning users automatically reconnect to their existing data set
- **Upload history** – Users can view their uploaded files (fetched from their data set on-chain)

**User isolation:**
- All users share the same wallet (via session key)
- Each user's browser stores their unique data set ID
- Users only see pieces from their own data set

**Important:** This approach relies on browser localStorage for user identity, which is fine for demos but not suitable for production. For production applications, use a backend database to track user → data set mappings with proper authentication.

## Development

For detailed information on:
- Environment configuration (authentication options)
- Project structure and file organization
- Coding guidelines and conventions
- Pull request workflow

See [`CONTRIBUTING.md`](CONTRIBUTING.md).
