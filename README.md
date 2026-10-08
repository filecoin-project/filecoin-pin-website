# Filecoin Drive

A browser file manager for Filecoin, built on `filecoin-pin` and Synapse. Connect your own wallet, authorize a browser session, then upload, download and manage a local file directory.

## Run locally

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. Use an Ethereum-compatible browser wallet. HTTPS or localhost is required for browser cryptography.

For mobile wallets, choose **WalletConnect** to scan the QR code or open a mobile wallet. The app includes Beck’s public Reown project ID by default. To use another project, copy [`.env.example`](.env.example) to `.env.local`, set `VITE_WALLETCONNECT_PROJECT_ID`, and restart the dev server (or rebuild for production). Configure the project's allowed origins to include your production site. WalletConnect is loaded only when its button is used.

The default network is **Filecoin Mainnet**. **Calibration** is available for development and testing. Wallet sessions, datasets, files and folders are isolated by chain ID and wallet address. No shared deployment wallet or private key is required.

## Wallet setup

1. Connect your wallet and select a network.
2. Choose a session lifetime of 1, 7 or 30 days and review its permissions. The browser key can create datasets, upload pieces, schedule piece removals and terminate storage services. Authorize it with your wallet.
3. Deposit USDFC into Filecoin Pay and approve Warm Storage payments if needed. Payment approval uses unlimited rate and lockup allowances and requires explicit consent. These setup actions require owner-wallet confirmations.
4. Upload files with the session key. Before sending file bytes, the app checks chain permissions and obtains a read-only funding quote for the actual selected storage copies, including dataset creation, operation fees and lockups. If more funds are needed, it displays the additional USDFC amount; deposits and payment approvals remain separate owner-wallet actions. Reauthorize expired or revoked sessions in Wallet setup.

You can revoke this browser's key from Wallet setup, or manage authorizations in Filecoin Pay Console. Disconnecting the wallet does not revoke its key. Session credentials are stored in IndexedDB, encrypted using a non-exportable AES-GCM wrapping key. The application origin can still use those credentials; this does not provide protection against malicious scripts on the origin.

Disconnecting a WalletConnect wallet also ends its remote connection session. Wallets must support Filecoin's EVM network and transaction requests. Both networks are requested when pairing; if a wallet only approves one, switching to the other may require a new connection.

## Files and folders

- File table with search, dates, copy counts and storage status.
- Folder tree, nested virtual folders, breadcrumbs, display-name changes and file moves.
- File details with IPFS root CID, piece CID, providers, datasets and transaction links.
- Original-file download: retrieve and validate the CAR from a recorded provider, then extract the UnixFS file in the browser. An IPFS gateway link is available as a fallback. File details also offer a new-tab gateway preview for common browser-supported formats; media playback depends on the browser and encoding.
- Scheduling deletion across recorded copies, with persisted transaction checkpoints for partial failures and retries.

Folders and display names are browser directory metadata. Moving or renaming a record does not change the stored content or its CID. Repeated uploads of identical content keep separate directory records. Deleting their shared piece affects all matching records; the deletion UI explains this before scheduling removals.

Deletion resolves every matching piece instance across all pages. Providers accept batches of at most 35 removals per dataset, with a queue that drains at the next proving period. Larger removals retain their progress and show **Continue deletion**; retry when the queue has space. Directory backups preserve unfinished batches. Scheduled deletion records remain in the directory; confirmation means the removal was scheduled, not that the provider has already removed the bytes.

Deletion is scheduled for provider processing, rather than immediate erasure. IPFS caches may retain content. Piece removal does not terminate the whole dataset or immediately end every storage charge.

## Persistence and limitations

The file directory is stored in localStorage for the current wallet and network. Export a **directory backup** before clearing browser data or changing browsers. Import accepts backups only for the selected wallet and network and merges records without overwriting existing entries. Backups exclude session credentials.

Chain reads cannot reconstruct the original file names, virtual folders or IPFS root CIDs. Files uploaded elsewhere do not automatically appear in this directory. Refreshing chain state preserves known browser metadata.

Uploads require the page to remain open; a session key does not make them background server jobs. The current upload/download path buffers data in browser memory, and uploads are limited to 200 MB. Each confirmed storage copy is saved immediately, even if subsequent replication or IPFS indexing fails. Reloading before a confirmation is received can still leave content without a directory record. Files are not encrypted and can be retrieved by their content identifiers.


## Development

```sh
npm run lint
npm run test
npm run build
```

For browser regression checks, run `npm run dev` in another terminal, install Chromium with `npx playwright install chromium`, then run `npm run test:drive`. If Chrome is installed, use `PLAYWRIGHT_CHANNEL=chrome npm run test:drive`. `PLAYWRIGHT_CHANNEL=chrome npm run test:drive:theme` checks both themes, shared component contrast, focus/hover states, and rendered console details. `DRIVE_TEST_URL` can select another local dev-server URL. Wallet requests and external RPCs are mocked.

See [CONTRIBUTING.md](CONTRIBUTING.md) for source layout and contribution conventions. Core code lives in [the wallet provider](src/context/browser-wallet-provider.tsx), [the upload hook](src/hooks/use-filecoin-upload.ts), and [the drive components](src/components/drive/).

Pending IPFS root CIDs receive at most five additional background indexing checks, two minutes apart. The browser saves the attempt count and cooldown per wallet/network and CID, so reloads and reconnects do not restart the budget. Checks pause while the page is hidden. When the budget is exhausted, the file remains stored and downloadable; its status becomes `Stored · IPFS indexing unconfirmed`. File details offer `Retry indexing checks` to explicitly start another bounded round. This checks root-CID discoverability in IPNI, not full-file retrieval or replica health.

## Deployment

Build with `npm run build` and serve `dist` over HTTPS on a stable origin. Browser directory data and session credentials are scoped to that origin. Configure the public origin in the Reown project's allowlist. Set `VITE_WALLETCONNECT_PROJECT_ID` before building to override the built-in public project ID. Never configure wallet private keys in deployment environment variables.
