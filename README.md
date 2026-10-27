# Filecoin Drive

A browser file manager for Filecoin, built on `filecoin-pin` and Synapse. Connect your own wallet, authorize a browser session, then upload, download and manage a local file directory.

## Run locally

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. Use an Ethereum-compatible browser wallet. HTTPS or localhost is required for browser cryptography.

For mobile wallets, choose **WalletConnect** to scan the QR code or open a mobile wallet. The app includes Beck’s public Reown project ID by default. To use another project, copy [`.env.example`](.env.example) to `.env.local`, set `VITE_WALLETCONNECT_PROJECT_ID`, and restart the dev server (or rebuild for production). Configure the project's allowed origins to include your production site. WalletConnect is loaded when explicitly chosen or when restoring a previously selected WalletConnect session.

First-time visitors default to **Filecoin Mainnet**. **Calibration** is available for development and testing. A successful manual network selection is remembered in this browser across reloads and disconnects; reconnecting requests that selected network from the wallet. A rejected wallet switch leaves the previous selection unchanged. Wallet sessions, datasets, files and folders are isolated by chain ID and wallet address. No shared deployment wallet or private key is required.

## Wallet setup

1. Connect your wallet and select a network.
2. Choose a session lifetime of 1, 7 or 30 days and review its permissions. New browser authorizations can create datasets, upload pieces and schedule piece removals. Service termination is not requested. Authorize it with your wallet.
3. Deposit USDFC into Filecoin Pay and approve Warm Storage payments if needed. Payment approval uses unlimited rate and lockup allowances and requires explicit consent. These setup actions require owner-wallet confirmations.
4. Upload files with the session key. Before sending file bytes, the app checks chain permissions and obtains a read-only funding quote for the actual selected storage copies, including dataset creation, operation fees and lockups. If more funds are needed, it displays the additional USDFC amount; deposits and payment approvals remain separate owner-wallet actions. Reauthorize expired or revoked sessions in Wallet setup.

The Wallet and storage panel shows **Runway**, the estimated time before a top-up is needed at the account’s current recurring payment rate. It uses filecoin-pin’s SDK-based account summary, excludes locked reserves, and covers the wallet’s USDFC Filecoin Pay account, including other services billed there. Display labels follow Filecoin Pay Console. Accounts with no recurring spend show **No recurring charges**. This is an estimate, not a file retention guarantee. The panel fetches runway separately when mounted; a failed runway read does not block funding or uploads. **Refresh balances** also refreshes the visible estimate.

You can revoke this browser's key from Wallet setup, or manage authorizations in Filecoin Pay Console. Disconnecting the wallet does not revoke its key. Session credentials are stored in IndexedDB, encrypted using a non-exportable AES-GCM wrapping key. The application origin can still use those credentials; this does not provide protection against malicious scripts on the origin.

After a successful connection, the app remembers the chosen wallet type (and the injected wallet's stable discovery ID when available). On reload it silently restores an already authorized injected account, or reuses a valid WalletConnect session approved for the selected network. It does not automatically request account access, switch wallet networks, or start QR pairing. Locked wallets, expired sessions, or unavailable providers return to explicit Connect. Disconnect clears this reconnect preference; it does not clear the directory or revoke the storage session key.

Disconnecting a WalletConnect wallet also ends its remote connection session. Wallets must support Filecoin's EVM network and transaction requests. Both networks are requested when pairing; if a wallet only approves one, switching to the other may require a new connection.

## Files and folders

- File table with search across file names and folder paths, dates, copy counts and storage status. File contents are not searched.
- Folder tree, nested virtual folders, breadcrumbs, display-name changes and file moves.
- File details with IPFS root CID, piece CID, providers, datasets and transaction links.
- Original-file download: retrieve and validate the CAR from a recorded provider, then extract the UnixFS file in the browser. An IPFS gateway link is available as a fallback. File details also offer a new-tab gateway preview for common browser-supported formats; media playback depends on the browser and encoding.

- Scheduling deletion across recorded copies, with persisted transaction checkpoints for partial failures and retries.

Gateway links use the external `inbrowser.link` browser gateway. Gateway availability is separate from IPNI indexing: an indexed CID does not guarantee successful gateway retrieval. Use **Download** to retrieve the original file directly from a recorded Filecoin storage provider.

Original-file downloads can run alongside an upload. Additional downloads are queued and run one at a time; repeated requests for the same file are deduplicated. Queued files show **Queued · Cancel** in the list and details. Expand the queue above the file list to manage pending downloads across folders. Pending downloads can be cancelled; an active download cannot be cancelled. A failed download reports its file name and the queue continues. The queue is kept only in the current page and is cleared on reload or a wallet/network change; an already running download may still finish. Closing file details keeps downloads running.

Each ordinary upload targets two storage copies on different providers. Existing datasets are reused, and missing copies are selected before the funding quote. A previous one-copy upload does not reduce the target for later uploads or trigger replication of existing files. An upload can still finish with fewer copies if another provider is unavailable or fails; the next upload tries for two again. Confirmed copies are saved, including when only a secondary provider succeeds, and the directory's copy count reflects the successful copies.

Folders and display names are browser directory metadata. Moving or renaming a record does not change the stored content or its CID. Repeated uploads of identical content keep separate directory records. Deleting their shared piece affects all matching records; the deletion UI explains this before scheduling removals.

Deletion resolves every matching piece instance across all pages. Providers accept batches of at most 35 removals per dataset, with a queue that drains at the next proving period. Larger removals retain their progress and show **Continue deletion**; retry when the queue has space. Directory backups preserve unfinished batches. Once every recorded copy has a confirmed removal-scheduling transaction and no remaining batch, the file is hidden from the normal list, search and count. Its metadata and transaction receipts remain in browser storage and directory backups. Partial removals stay available to continue. Archived receipts are preserved and are not reused to settle a later upload of identical content; pending transactions are checked before submitting another deletion.

Deletion is scheduled for provider processing, rather than immediate erasure. IPFS caches may retain content. Piece removal does not terminate the whole dataset or immediately end every storage charge.

Only one tab can delete the same content for a wallet and network at a time. Another tab reports that deletion is already in progress; after it finishes or fails, **Continue deletion** reads the latest saved checkpoints. This operation lock is separate from the short directory-save lock. Receipts update only their dataset and do not overwrite a newer transaction when a failed save is retried.

Wallet discovery, connector account events and chain switching use wagmi. Both connection buttons connect directly when one browser wallet is available, or open the same wallet-selection interface when several are available. Announced wallet icons are used when valid; the unnamed legacy Browser wallet entry is not displayed. The existing lazy WalletConnect provider is adapted to a wagmi injected connector to preserve mobile namespace account resolution and explicit pairing. Injected-wallet connection attempts stop waiting after 45 seconds and restore page controls. An unresolved request blocks another connection attempt to that wallet until it settles; other wallets remain available. Reload after restarting an unresponsive extension. A late response does not sign the user in automatically. WalletConnect pairing keeps its existing interactive wait. Synapse React resolves the owner signing client; when a late response changes wagmi’s current connection, the selected connector is passed explicitly to wagmi instead. TanStack Query scopes and deduplicates storage configuration, wallet snapshots and pending receipt reads. Session-key persistence, permission lifecycle, bounded transaction recovery, dataset reuse and CAR/IPNI orchestration remain application logic.

## Persistence and limitations

The file directory is stored in localStorage for the current wallet and network. Export a **directory backup** before clearing browser data or changing browsers. Import accepts backups only for the selected wallet and network and merges records without overwriting existing entries. Backups exclude session credentials.

Directory changes use Web Locks to merge against the latest saved records across tabs on the same origin in the same browser profile. Files and folders synchronize between tabs and are read again when a page becomes visible, regains focus, resumes from a frozen state or is restored from the browser's page cache. These resume reads do not query the chain. Different browsers, devices and deployment origins still require directory export/import. Reload existing Drive tabs after deploying this update so every writer uses the same locking protocol.

Directory writes require a browser with Web Locks over HTTPS or localhost. Unsupported browsers report an error; uploads stop before packing or making storage requests, and deletions stop before submitting transactions. If a directory save fails, keep the page open and export a backup. Unsaved upload and deletion checkpoints remain in that page's memory and are merged with the latest stored directory on the next save attempt. Upload details offer **Retry saving** to save confirmed file metadata without uploading again. Once the final checkpoint is saved, either through this button or another directory edit, the upload panel finishes and another upload can start. Failed display-name and folder-move edits remain in the open file-details form for an explicit **Save changes** retry; they are not automatically replayed by later saves or included in directory backups, so they cannot overwrite another tab's newer edits.

When the local directory is absent but saved dataset IDs are still available, the existing dataset fallback also reads FWSS `PieceAdded` events to recover original upload names (`label` or `name`) and IPFS root CIDs where available. Event recovery checks at most 64 pages of 360 epochs (about eight recent days), stops starting requests after 20 seconds, and stops if historical logs are unavailable. Older or missing metadata remains unknown; directory backups remain necessary for complete recovery. Clearing all browser storage also removes the known dataset IDs; this fallback does not enumerate the entire wallet to discover them again. Normal loads with a saved directory do not scan events. Chain refreshes preserve local names, paths and CIDs. Virtual folders, later renames and separate directory records for repeated uploads cannot be reconstructed from events.

Uploads require the page to remain open; a session key does not make them background server jobs. The current upload/download path buffers data in browser memory, and uploads are limited to 200 MB. Each confirmed storage copy is saved immediately, even if subsequent replication or IPFS indexing fails. The upload network is fixed when the operation starts and does not change during balance refreshes or retries of balance reads. Reloading before a confirmation is received can still leave content without a directory record. Files are not encrypted and can be retrieved by their content identifiers. Original file names, when submitted as upload metadata, and IPFS root CIDs are publicly visible in on-chain events. Folder paths and later display-name changes remain local.


### Existing CAR archives

Uploads inspect file contents to detect CAR archives regardless of the filename extension. Ordinary files retain the existing UnixFS packing. A detected CAR is stored byte-for-byte without wrapping it in a new file DAG, preserving its root CIDs. Drive uses the first root as the primary CID when an archive has multiple roots. Rootless archives and archives missing a declared root block are rejected before storage requests; the browser directory and content locks require a real primary root.

Imported archives appear as one file record and download as the original CAR bytes from a storage provider. Drive does not expand their internal folders into the browser directory. Single-file previews and IPFS gateway file downloads are omitted for these records: traversing one root cannot reproduce an archive’s other roots or extra blocks. Directory backups preserve the CAR import flag, including after a display-name change. Best-effort chain metadata recovery cannot restore that local download-mode flag; retain a directory backup for imported archives.

## Development

```sh
npm run lint
npm run test
npm run build
```

For browser regression checks, run `npm run dev` in another terminal, install Chromium with `npx playwright install chromium`, then run `npm run test:drive`. If Chrome is installed, use `PLAYWRIGHT_CHANNEL=chrome npm run test:drive`. `PLAYWRIGHT_CHANNEL=chrome npm run test:drive:theme` checks both themes, shared component contrast, focus/hover states, and rendered console details. `DRIVE_TEST_URL` can select another local dev-server URL. Wallet requests and external RPCs are mocked.

See [CONTRIBUTING.md](CONTRIBUTING.md) for source layout and contribution conventions. Core code lives in [the wallet provider](src/context/browser-wallet-provider.tsx), [the upload hook](src/hooks/use-filecoin-upload.ts), and [the drive components](src/components/drive/).

Pending IPFS root CIDs receive at most five additional background indexing checks, two minutes apart. The browser saves the attempt count and cooldown per wallet/network and CID, so reloads and reconnects do not restart the budget. Checks pause while the page is hidden. When the budget is exhausted, the file remains stored and downloadable; its status becomes `Stored · IPFS indexing unconfirmed`. File details offer `Retry indexing checks` to explicitly start another bounded round. This checks root-CID discoverability in IPNI, not full-file retrieval or replica health.

The folder sidebar shows **Files** as the root, with indented descendants grouped beneath their parent. Open a folder and select **Delete folder** to remove an empty local folder after confirmation. Folders containing files or subfolders must be emptied first; the root cannot be deleted. Removal rechecks the latest file and folder records under the shared directory lock and returns to the parent folder. It does not submit Filecoin transactions or delete stored content.

Wallet authorization, revocation, deposits and storage-payment approvals retain their submitted transaction hash per wallet/network until the outcome is known. A confirmation timeout leaves the operation pending and blocks duplicate wallet setup submissions. After the initial wait, visible pages check every 30 seconds for up to ten minutes from submission. Returning to the foreground or selecting **Refresh status** performs another read, including after that automatic window ends. Reloading restores pending work. Revoking a session also clears the termination permission granted by older versions; renewing it with fewer permissions does not revoke an existing grant. Session authorization also checks the actual permissions and requested expiry; revocation checks that all storage permissions are inactive. This can recover session changes when a wallet replacement changes the transaction hash. Missing receipts and RPC failures are never treated as proof of failure. Payments require a successful receipt; an unrecognized replacement remains unresolved rather than being inferred from a balance change.

## Deployment

Build with `npm run build` and serve `dist` over HTTPS on a stable origin. Browser directory data and session credentials are scoped to that origin. Configure the public origin in the Reown project's allowlist. Set `VITE_WALLETCONNECT_PROJECT_ID` before building to override the built-in public project ID. Never configure wallet private keys in deployment environment variables.

Uploads and deletions of identical content are mutually exclusive across tabs on the same browser origin, wallet and network. Uploads acquire a Web Lock after local CAR packing reveals the IPFS root CID, before sending data, and retain it until confirmed file metadata is saved. Conflicting operations fail immediately and require an explicit retry; different content can proceed independently. Deleting an older record without a root CID conservatively excludes uploads for that wallet/network. An unfinished recorded deletion must be continued before uploading the same content again. These browser locks do not coordinate other devices, browser profiles or CLI clients.
