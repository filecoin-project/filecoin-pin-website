# User guide

Filecoin Drive connects your wallet to browser-based file storage. See the [README](../README.md) for local setup and the [architecture notes](architecture.md) for implementation details.

## Connect a wallet

Open **Drive** from the landing page, then choose **Connect wallet** or **WalletConnect**.

Drive defaults to **Filecoin Mainnet**. The current interface does not offer a network selector. Wallet sessions, datasets, files and folders remain scoped by chain ID and wallet address internally. No shared deployment wallet or private key is required.

Disconnecting a WalletConnect wallet also ends its remote connection session. Your wallet must support Filecoin Mainnet's EVM network and transaction requests.

After a successful connection, the app remembers the chosen wallet type (and the injected wallet's stable discovery ID when available). On reload it silently restores an already authorized injected account, or reuses a valid WalletConnect session approved for the selected network. It does not automatically request account access, switch wallet networks, or start QR pairing. Locked wallets, expired WalletConnect sessions, or unavailable providers return to explicit Connect. An expired storage authorization requires renewal in Wallet setup, independently of the wallet connection. Disconnect clears this reconnect preference; it does not clear the directory or revoke the storage session key.

## Authorize and fund storage

1. Connect a wallet compatible with Filecoin Mainnet.
2. Choose a session lifetime of 1, 7 or 30 days and review its permissions. New browser authorizations can create datasets, upload pieces and schedule piece removals. Service termination is not requested. Authorize it with your wallet.
3. Deposit USDFC into Filecoin Pay and approve Warm Storage payments if needed. Payment approval uses unlimited rate and lockup allowances and requires explicit consent. These setup actions require owner-wallet confirmations.
4. Upload files with the session key. Before sending file bytes, the app checks chain permissions and obtains a read-only funding quote for the actual selected storage copies, including dataset creation, operation fees and lockups. If more funds are needed, it displays the additional USDFC amount; deposits and payment approvals remain separate owner-wallet actions. Reauthorize expired or revoked sessions in Wallet setup.

The Wallet and Storage panel shows **Runway**, the estimated time before a top-up is needed at the account’s current recurring payment rate. It excludes locked reserves and covers the wallet’s USDFC Filecoin Pay account, including other services billed there. Accounts with no recurring spend show **No recurring charges**. This is an estimate, not a file retention guarantee. A failed runway read does not block funding or uploads. **Refresh balances** also refreshes the visible estimate.

You can revoke this browser’s storage key in Wallet setup or manage authorizations in Filecoin Pay Console. Disconnecting does not revoke the storage key. New sessions do not request service termination permission; revocation also clears that permission from older sessions. Renewing a session does not remove older grants.

## Upload files

Selecting several files creates independent uploads. Transfers run one at a time; after a provider receipt is saved, the next file can transfer while earlier files await confirmation. You can add files during a transfer and cancel waiting uploads. Reloading loses the in-memory source files for uploads that have not started.

Choose **Upload**, select files and an upload location, then start the upload. Each ordinary upload targets two copies on different providers, but may finish with fewer copies if a provider fails. Check the confirmed copy count in the file list.

Keep the tab open while uploads are running. **Stored** means at least one copy is confirmed; other copies may still be processing. Share and Preview become available as soon as one copy is confirmed and announced to the IPFS indexer, even while further copies are still processing.

### Names and upload location

Drive checks two values separately before starting an upload:

- **Upload name**: the name of the selected file, including its extension, or the name of the selected folder. Maximum: **96 UTF-8 bytes**.
- **Upload location**: the destination path entered in the upload panel, including `/` separators. Maximum: **96 UTF-8 bytes** after path normalization. Leave it empty to upload directly under **Files**.

For example, upload the folder `photos` into **Upload location** `trips/2026`. Drive checks `photos` and `trips/2026` separately. The resulting location is `Files → trips → 2026 → photos`, but that combined path is not the value checked against either limit. A file such as `photos/day-1/beach.jpg` inside the selected folder is part of its contents; its child path is not subject to these two metadata limits.

`trips/2026` organizes separate uploads in Drive. The uploaded `photos` folder is stored as one unit, with its internal files and folders preserved. See [Folders and search](#folders-and-search) for how these behave.

UTF-8 bytes are not the same as characters: English letters and digits normally take one byte each, while a Chinese character commonly takes three. Rename the selected file or folder, or shorten **Upload location**, if its value is too long. Names, paths and content identifiers are public. Content is not encrypted.

## Folders and search

The folder sidebar shows **Files** as the root, with nested paths derived from visible files. Choose a folder path in the upload panel; deleting all files under a path removes that path from the tree.

Choose **Folder** in the upload panel to store an entire folder as one UnixFS directory. Nested folders retain their paths. Browse the uploaded folder in Drive, download individual files, or download a folder as a ZIP. Preview and sharing use each entry’s IPFS CID when available. The browser picker omits empty folders; selected content and the packed CAR must each fit the 200 MB browser limit. Folder ZIP downloads are also limited to 200 MB of extracted content and 10,000 entries, counting files and directories, including the root.

An organizing folder groups independent uploads. An uploaded folder stores its contents together: its children share the folder’s upload time and cannot be added, renamed or deleted individually. Delete the uploaded folder from its details to remove its storage copies. Icons and folder information distinguish these two kinds of folder. Known name collisions are rejected before a folder upload starts.

The search field stays in the Files toolbar beside Load from Filecoin and Upload. **Search file list** matches names and paths in the wallet’s file records, without searching inside uploaded folders. Inside an uploaded folder, **Search this folder** matches names across all pages of the current directory (not file contents or nested directories), up to 10,000 entries. Opening Upload from an uploaded folder leaves Upload location empty and starts at Files root because uploaded folders cannot be appended to. Opening Upload from an organizing folder pre-fills its current path.

## Downloads, previews and sharing

Use **Download** to retrieve the original file from a recorded storage provider. File details offer gateway previews for every downloadable file; whether the browser displays or saves it depends on the format, browser and encoding.

Gateway links use the external `inbrowser.link` browser gateway. Gateway availability is separate from IPNI indexing: an indexed CID does not guarantee successful gateway retrieval.

Original-file downloads can run alongside an upload. Additional downloads are queued and run one at a time; repeated requests for the same file record are deduplicated. Queued files show **Queued · Cancel** in the list and details. Expand the queue above the file list to manage pending downloads across folders. Pending downloads can be cancelled; an active download cannot be cancelled. A failed download reports its file name and the queue continues. The queue is kept only in the current page and is cleared on reload or a wallet/network change; an already running download may still finish. Closing file details keeps downloads running.

**Share** displays a public link and its QR code. **Copy link** copies the link and shows confirmation only after copying succeeds. Ordinary files open on inbrowser.link without forcing a download; the gateway and browser determine whether to display or download them. Imported CARs share the provider’s Piece URL to preserve the original archive. CAR records do not offer an IPFS gateway export.

Imported CAR archives appear as one record and download as the original archive. Drive does not expand their internal directories or offer a gateway preview.

## Delete stored files or clear failed records

Select stored files and choose **Delete stored files (N)** to review the affected records and schedule removal of their storage copies. Identical content can share storage, so deletion may affect additional matching records shown in the confirmation. Uploaded folders are deleted as a whole.

Select eligible failed or interrupted uploads and choose **Remove failed records (N)** to remove only their local records. This does not delete stored content or cancel transactions. Records with pending transaction receipts or confirmed copies are protected. With a mixed selection, each action handles only its own category.

Larger deletions may require **Continue deletion** after the provider’s removal queue has space. Records disappear from the normal list once removal has been scheduled for every copy. Running deletion tasks show **Deleting**. After the local task stops, unresolved submitted removals show **Deletion pending** when every unfinished copy has a pending checkpoint and no remaining batch; otherwise, unfinished deletion work shows **Deletion incomplete**. Drive checks saved deletion receipts automatically but does not submit remaining removals after reload. Keep the browser tab open while deletion is running; closing file details does not stop it.

Deletion is scheduled for provider processing, rather than immediate erasure. IPFS caches may retain content. Piece removal does not terminate the whole dataset or immediately end every storage charge.

## Refresh and recover

Connect the same wallet on another browser to discover indexed Drive files. Recent uploads may take time to appear; use **Load from Filecoin** to retry. Older datasets without Drive metadata may only remain available in the browser that cached them.

If saving fails, keep the page open, free browser storage and use **Retry saving**. Clearing site data loses unindexed checkpoints and local-only metadata.

After reload, Drive checks saved provider operations without uploading files again. **Check status** can refresh existing confirmations, but cannot resume unfinished transfers or submission steps. You may need to select the original file again. A timeout alone does not establish that an upload or wallet transaction failed.

Wallet setup transactions that time out remain pending to prevent duplicate submissions. Use **Refresh status** to check again. If IPFS indexing checks stop, the stored file remains downloadable; **Retry indexing checks** starts another bounded round. Indexing is not a guarantee of gateway availability or replica health.


### Planning storage funds

In **Wallet and Storage**, **Storage funds** estimates a top-up for an expected capacity and usage budget (defaults: 1 GiB and 30 days). The read-only SDK quote includes the selected storage copies, dataset setup, required reserves and additional runway. Existing matching datasets are reused. The card shows the SDK’s monthly storage rate, available funds and suggested top-up. Locked reserves are in **How estimates work**. It does not derive a budget total from the deposit shortfall. Many small uploads can incur more operation fees than the single-piece planning estimate. A required top-up automatically fills the deposit input; when no top-up is needed it starts empty. Manual edits are preserved when quotes refresh; **Deposit USDFC** still requires an explicit owner-wallet action. Payment approval remains separate.

Before each transfer, an SDK quote checks the actual packed size against the actual selected storage contexts. Insufficient funding produces **Waiting for funding**, pauses the transfer queue and leaves wallet funding actions available. File details link to **Wallet and Storage**, which also shows the last checked upload minimum. After funding or approval, use **Check funding and continue** to recheck and resume. Original file bytes remain available in the current page; after a reload, select the original file or folder again. Other queued files wait until the blocked upload is continued or removed. Ordinary transfer failures retain the existing failure behavior.

Run `node scripts/test-drive-funding.mjs` against `npm run dev` for mocked budget states, waiting-upload navigation and desktop/mobile screenshots. These checks submit no live transactions.

Queued **Waiting** uploads and **Waiting for funding** uploads can be selected together with failed local records and removed using **Remove local records**. The selected tasks are canceled as one batch before the queue advances; original file bytes are released. Active transfers and submitted storage operations are excluded. Removing these records does not submit a chain transaction or delete stored files.

[Back to README](../README.md)
