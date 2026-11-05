# Filecoin Drive

Filecoin Drive is an open-source reference app built on Filecoin with Synapse SDK and Filecoin Pin. Connect your wallet to upload, browse, share and download files, with file discovery through the public Filecoin index.

## Features

- File manager with folders, search, storage status and copy counts.
- File and folder uploads, original-file downloads and folder ZIP downloads.
- Public sharing links, QR codes and previews for supported file types.
- Browser wallet and WalletConnect support, with scoped browser sessions.
- Scheduled storage deletion and local cleanup of failed upload records.

## Run locally

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`, choose **Open Drive**, and connect an Ethereum-compatible wallet. HTTPS or localhost is required for browser cryptography and storage coordination.

Drive defaults to **Filecoin Mainnet**; the current interface does not offer a network selector. No deployment wallet or private key is required.

## Start using Drive

1. Connect a Filecoin Mainnet-compatible wallet.
2. In **Wallet and Storage**, review and authorize a browser session.
3. Deposit USDFC and approve storage payments when needed. These actions require owner-wallet confirmation.
4. Upload files or folders, then monitor their storage status and confirmed copies.

For wallet setup, downloads, deletion and recovery, see the [user guide](docs/user-guide.md).

## Important limits

- Mainnet operations spend real FIL and USDFC. Keep FIL available for gas.
- Content is not encrypted. File names, paths and content identifiers are public.
- Browser uploads have a 200 MB limit. For folder uploads, both selected content and the packed CAR must fit this limit. The selected file or folder name and the **Upload location** value each have a separate 96-byte UTF-8 limit; see the [naming example](docs/user-guide.md#names-and-upload-location).
- Keep the tab open while upload or deletion work is running. Recent files may take time to appear in another browser.
- Deletion is scheduled rather than immediate. IPFS caches may retain content, and removal does not immediately stop every storage charge.

## Development

```sh
npm run lint
npm run test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for source layout, browser checks and contribution conventions. The [architecture notes](docs/architecture.md) describe storage integration, persistence, concurrency and recovery.

## Deployment

Build with `npm run build` and serve `dist` over HTTPS on a stable origin. Browser data and session credentials are scoped to that origin.

WalletConnect includes a public Reown project ID. To use your own, copy [`.env.example`](.env.example) to `.env.local`, set `VITE_WALLETCONNECT_PROJECT_ID`, and rebuild. Include the deployment origin in your project's allowlist. Never configure wallet private keys in deployment environment variables.
