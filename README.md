# Filecoin Pin Demo

A simple, easy-to-understand demo showing how to use [`filecoin-pin`](https://github.com/filecoin-project/filecoin-pin) to upload files to Filecoin. This single-page React + TypeScript app demonstrates the core upload workflow with progress tracking and wallet integration.

## Status

**⚠️ Not ready yet for production** - At least as of 2025-10-15, this Filecoin Pin demo dApp runs on Filecoin Calibration testnet only.  It's not ready for production use yet.  See:
- [filecoin-pin#45](https://github.com/filecoin-project/filecoin-pin/issues/45) for tracking when this will be publicly deployed to pin.filecoin.cloud.
- [filecoin-pin-website#77](https://github.com/filecoin-project/filecoin-pin-website/issues/77) for tracking "bring your own wallet" support.

## What This Demo Shows

This app demonstrates the complete `filecoin-pin` upload workflow:
- Create CAR files from user files
- Execute uploads to Filecoin SP
- Verify the CID indexing and advertising from the Filecoin SP to IPNI 
- Verify the commitment onchain from the Filecoin SP to perform proof of data possession (PDP)
- Track progress through each step

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

This demo currently doesn't support users bringing their own wallet, which is tracked in [issue #77](https://github.com/filecoin-project/filecoin-pin-website/issues/77).  Instead it relies on deployment with a shared session key, allowing multiple users to safely upload files using the same wallet.

**How it works:**
- **Session key authentication** – Uses `VITE_WALLET_ADDRESS` + `VITE_SESSION_KEY` instead of exposing the wallet's private key
- **Per-user data sets** – Each user gets their own data set ID, stored in browser localStorage
- **Data set persistence** – Returning users automatically reconnect to their existing data set
- **Upload history** – Users can view their uploaded files (fetched from their data set on-chain)

**User isolation:**
- All users share the same wallet (via session key)
- Each user's browser stores their unique data set ID
- Users only see pieces from their own data set

**Important:** This approach relies on browser localStorage for user identity, which is fine for demos but not suitable for production.

## Storage Provider Selection

During the launch window we hardcode a small allowlist of “known good” storage providers and randomly pick from it when a provider is not specified via the `providerId` debug parameter. This is an expedient, temporary measure to smooth out early network volatility while we gather feedback and improve automated provider discovery. Expect this allowlist to grow then disappear entirely once Calibration stabilizes; outside the launch period you should remove the hardcoded IDs and rely on normal provider selection logic (inside filecoin-pin and underlying synapse-sdk) instead.

## Development

For detailed information on:
- Environment configuration (authentication options)
- Project structure and file organization
- Coding guidelines and conventions
- Pull request workflow

See [`CONTRIBUTING.md`](CONTRIBUTING.md).
