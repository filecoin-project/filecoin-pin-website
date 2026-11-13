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
- Content is encrypted by default (see [Encryption](#encryption)). File names, paths, content identifiers and sizes remain public.
- Browser uploads have a 200 MB limit. For folder uploads, both selected content and the packed CAR must fit this limit. File names and the **Upload location** value each have a separate 96-byte UTF-8 limit; uploaded folder names allow 95 bytes to reserve the directory marker; see the [naming example](docs/user-guide.md#names-and-upload-location).
- Keep the tab open while upload or deletion work is running. Recent files may take time to appear in another browser.
- Deletion is scheduled rather than immediate. IPFS caches may retain content, and removal does not immediately stop every storage charge.

## Encryption

Every upload is encrypted by default with [Keysmith](https://github.com/FilOzone/synapse-sdk/tree/master/packages/keysmith) keys and the Filecoin Encryption Envelope, the same conventions the filecoin-pin CLI uses — `filecoin-pin get` and the share viewer can read Drive's uploads, and Drive lands on the same group key a CLI user already set up. The content is packed into a CAR under the filecoin-pin payload profile, encrypted under a fresh per-upload key, and the ciphertext envelope is what storage providers hold and IPNI indexes.

**Key model.** Your group key is derived from a wallet signature over a fixed message — nothing is stored on a server, and no one else can derive it. During setup the group key is wrapped to this browser's session key as a grant kept in the session vault, so routine uploads, downloads and preparing viewer links never prompt the wallet. As the owner you always have access: with no session, an expired grant, or a brand-new browser, the first decrypt signs one message with your wallet (two when no commitment is reachable) and is remembered for the page session. Wallets that cannot produce deterministic ECDSA signatures (some smart accounts and embedded wallets) cannot derive encryption keys; uploads stay blocked for them.

**What stays public.** Content bytes and the plaintext content CID are encrypted. File names (`label`), folder paths (`path`), your wallet address, the group key id, the per-upload salt, ciphertext size, piece CIDs and data-set metadata remain publicly visible — Drive deliberately keeps names and paths public so the file browser works on every device without decrypting. This is content encryption, not metadata privacy. Files stored without encryption (uploads from before this feature) are flagged **Public** in the file list.

**CIDs are no longer deterministic.** Each upload uses a fresh salt, so uploading identical content twice produces different stored CIDs and piece CIDs. Drive deduplicates and locks on the plaintext content CID it records locally. The public CID of an encrypted file identifies the envelope, not the content; gateway links to it serve ciphertext, which is why Preview and Share open an external viewer using a Keysmith share link instead of a gateway URL. The viewer decrypts the content; Drive never renders decrypted files on its own origin. Preview links have the same permanent access as share links. For folder uploads, both actions grant access to the entire uploaded folder, including every file and subfolder.

**Sharing.** Share on an encrypted file wraps that one file's key to a fresh throwaway key and builds a viewer link carrying everything in the URL fragment, so nothing reaches a server. Anyone with the link can read that one file, forever: share links cannot be revoked. The same link opens with `filecoin-pin get --share`.

**Data sets and cost.** Encrypted uploads go to data sets created with the Keysmith metadata (`foc/enc`, `foc/ks`, `foc/kc`). Existing plain data sets cannot be upgraded (data-set metadata is immutable), so the first encrypted upload creates new data sets and older ones remain for files uploaded before encryption; wallets with legacy files pay for both generations until the legacy files are deleted. Legacy plaintext files keep downloading and sharing exactly as before.

**Compromise is permanent.** The group key is deterministic and grants are irrevocable. Anyone who extracts the session vault (grant plus session key) from this browser profile can read everything under the group key, and revoking the session key does not undo that. Recovery means a new group key and re-encrypting and re-uploading everything. See [SECURITY.md](SECURITY.md).

## Development

```sh
npm run lint
npm run test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for source layout, browser checks and contribution conventions. The [architecture notes](docs/architecture.md) describe storage integration, persistence, concurrency and recovery.

## Deployment

See the [release process](docs/RELEASE.md) for staging validation and promotion to production.

Build with `npm run build` and serve `dist` over HTTPS on a stable origin. Browser data and session credentials are scoped to that origin.

WalletConnect includes a public Reown project ID. To use your own, copy [`.env.example`](.env.example) to `.env.local`, set `VITE_WALLETCONNECT_PROJECT_ID`, and rebuild. Include the deployment origin in your project's allowlist. Never configure wallet private keys in deployment environment variables.
