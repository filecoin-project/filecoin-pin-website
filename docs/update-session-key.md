# Runbook: Update session key for pin.filecoin.cloud

This runbook describes how to create or refresh the session key used by [pin.filecoin.cloud](https://pin.filecoin.cloud), and how to avoid expiry-related outages. See also [Refresh session key (issue #146)](https://github.com/filecoin-project/filecoin-pin-website/issues/146).

## Context

- The site uses **session key** auth (not the main wallet private key) so the app can create datasets and add pieces without exposing the owner key.
- The session key is valid for a fixed period (e.g. 180 days). When it expires, users see: *"Session key expired or expiring soon"*.
- **Owner wallet:** `0x44f08D1beFe61255b3C3A349C392C560FA333759`
- The **private key** for this wallet is stored in the team’s secure secret store. Use it only to run the script below; never commit it or paste it into docs.
- The session key lives in **two** places, and a rotation is not finished until both are updated:
  - `VITE_SESSION_KEY` on Vercel, used by [pin.filecoin.cloud](https://pin.filecoin.cloud).
  - `DEFAULT_SESSION_KEY` in [`src/lib/filecoin-pin/config.ts`](../src/lib/filecoin-pin/config.ts), used by the build served from Filecoin through an IPFS gateway. There is no backend there to supply env vars, so that deployment runs on the value compiled into the source.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed (`cast` is used by the script).
- Access to the **private key** for `0x44f08D1beFe61255b3C3A349C392C560FA333759` (from the team secret store).
- Access to update environment variables for the project on Vercel (see [Vercel env vars](#3-update-environment-variables-on-vercel)).
- Ability to open a PR against this repo (step 4 changes a committed value).
- Optional: access to the **Filoz team calendar** to create reminder events (or someone who can create them).

## 1. Create a new session key

From the **repository root**:

```bash
# Recommended: 180 days validity to reduce how often you need to rotate
PRIVATE_KEY=<private_key_for_0x44f08D1beFe61255b3C3A349C392C560FA333759> ./scripts/create-session-key.sh 180
```

- Replace `<private_key_for_0x44f08D1beFe61255b3C3A349C392C560FA333759>` with the actual key (from your secret store). It must be the key for the owner wallet above.
- The script will:
  - Generate a new session key.
  - Resolve the current session key registry from Warm Storage (same as the app).
  - Authorize the session key on-chain with CreateDataSet and AddPieces permissions.
  - Print **VITE_WALLET_ADDRESS** and **VITE_SESSION_KEY** to add to your env.

**Note the expiry date** printed by the script (e.g. *"Validity: 180 days (expires: YYYY-MM-DD HH:MM:SS)"*). You will use this for calendar reminders and the next rotation.

The script prints that date in **your local timezone**. The calendar link below and the comment in `config.ts` both want **UTC**, so convert it before you copy it anywhere. Step 6 reads the expiry back off-chain as a unix timestamp, which is the unambiguous source:

```bash
date -u -r <expiry_timestamp> '+%Y-%m-%d %H:%M:%S UTC'
```

## 2. Create calendar reminder (before expiry)

To avoid the session key expiring unnoticed, create **one recurring event** on the **Filoz team calendar**:

### Option A: Google Calendar link (quick)

Use a pre-filled Google Calendar link, then adjust dates and set repeat:

1. **Open a pre-filled event** using one of these:
   - **Example (copy and edit):** [Open in Google Calendar (expires 2026-08-15)](https://calendar.google.com/calendar/render?action=TEMPLATE&text=Filecoin-pin-website+session+key+expiring+soon%3A+expires%3A+2026-08-15+09%3A24%3A22&dates=20260715T092400Z/20260715T095400Z&details=Rotate+using+runbook%3A+https%3A%2F%2Fgithub.com%2Ffilecoin-project%2Ffilecoin-pin-website%2Fblob%2Fmain%2Fdocs%2Fupdate-session-key.md&add=infra%40filoz.org%2Cbiglep%40filoz.org%2Corjan%40filoz.org%2Csgtpooki%40filoz.org) — then change the title (expires date) and the event start/end to **your** expiry and **1 month before** that (same time).  
   - **Or build your own:** use `https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=START/END&details=...&add=...` with title `Filecoin-pin-website session key expiring soon: expires: YYYY-MM-DD HH:MM:SS`, `dates` in UTC as `YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ` (first occurrence = 1 month before expiry), and `add=infra@filoz.org,biglep@filoz.org,orjan@filoz.org,sgtpooki@filoz.org` (URL-encode the whole query).

2. After the event form opens, set **Repeat** → **Weekly** → **End after 4 occurrences**, then save. Guests (infra@filoz.org, biglep@filoz.org, orjan@filoz.org, sgtpooki@filoz.org) are pre-filled.

**Date format for `dates=`:** use UTC in the form `YYYYMMDDTHHMMSSZ` for start and end (e.g. `20260715T092400Z` = 2026-07-15 09:24:00 UTC). End can be 30–60 minutes after start.

### Option B: Create the event manually

1. **Title:** `Filecoin-pin-website session key expiring soon: expires: YYYY-MM-DD HH:MM:SS` (use the **expires** value from the script).
2. **When:** First occurrence **1 month before** the expiry date.
3. **Repeat:** Custom repeat **ending after 4 occurrences** (e.g. weekly → 1 month, 3 weeks, 2 weeks, 1 week before expiry).
4. **Invite:** infra@filoz.org, biglep@filoz.org, orjan@filoz.org, sgtpooki@filoz.org.

## 3. Update environment variables on Vercel

After running the script, update the production environment so the site uses the new session key:

1. Open **[Vercel → filecoin-pin-website → Settings → Environment Variables](https://vercel.com/filoz/filecoin-pin-website/settings/environment-variables)**.
2. Update (or add) for **Production** (and Preview if you use session auth there):
   - **VITE_WALLET_ADDRESS** = `0x44f08D1beFe61255b3C3A349C392C560FA333759` (owner address; only changes if the owner wallet changes).
   - **VITE_SESSION_KEY** = the **new** session key private key printed by the script (starts with `0x...`).
3. Save. Trigger a new deployment if Vercel doesn’t auto-redeploy so the new values are used.

Never commit the **owner** private key. The session key is a different thing: it is compiled into the public client bundle by Vite like every `VITE_`-prefixed var, so it is already readable by anyone who loads the site. Step 4 commits it on purpose.

## 4. Update the session key in code

Set `DEFAULT_SESSION_KEY` in [`src/lib/filecoin-pin/config.ts`](../src/lib/filecoin-pin/config.ts) to the new session key, and update the `expires:` comment above it to the new expiry **in UTC**. Open a PR for this in the same sitting as the Vercel change.

Skipping this leaves the gateway-served build on the old key. It keeps working until that key lapses, and pin.filecoin.cloud keeps working either way, so the breakage is easy to miss until someone loads the site over an IPFS gateway and cannot upload.

## 5. Revoke the old session key

The previous session key stays authorized until its own expiry, and its private key is in git history. Revoke it by calling `login()` with an `expiry` of `0` for the old signer address, using the same registry and permission typehashes the script uses.

## 6. Verify

- Visit [pin.filecoin.cloud](https://pin.filecoin.cloud) and try an action that uses the session key (e.g. create a dataset or add content). If it works without “Session key expired or expiring soon”, Vercel is correct.
- Load the gateway-served build and do the same. This is the only check that covers `DEFAULT_SESSION_KEY`; the Vercel env var overrides it on pin.filecoin.cloud, so that site passes even when the committed default is stale.
- Confirm the expiry on-chain. Query contract **state** rather than event logs: calibration RPC log indexes have gaps for this registry, and `eth_getLogs` can report zero `login()` events for a period in which authorizations demonstrably changed.

  ```bash
  RPC=https://api.calibration.node.glif.io/rpc/v1
  REGISTRY=$(cast call 0x02925630df557F957f70E112bA06e50965417CA0 "sessionKeyRegistry()(address)" --rpc-url $RPC)
  # AddPieces typehash; repeat with the CreateDataSet typehash from scripts/create-session-key.sh
  cast call $REGISTRY "authorizationExpiry(address,address,bytes32)(uint256)" \
    <OWNER_ADDRESS> <SESSION_KEY_ADDRESS> \
    0x954bdc254591a7eab1b73f03842464d9283a08352772737094d710a4428fd183 --rpc-url $RPC
  ```

  A non-zero result is the expiry as a unix timestamp. `0` means the key is not authorized.

## Summary checklist

- [ ] Retrieved private key for `0x44f08D1beFe61255b3C3A349C392C560FA333759` from the team secret store.
- [ ] Ran `./scripts/create-session-key.sh 180` and noted the expiry date.
- [ ] Created one recurring calendar event (title: "Filecoin-pin-website session key expiring soon: expires: &lt;date from script&gt;", first occurrence 1 month before expiry, custom repeat ending after 4 occurrences), tagging infra@filoz.org, biglep@filoz.org, orjan@filoz.org, sgtpooki@filoz.org.
- [ ] Updated **VITE_SESSION_KEY** on [Vercel environment variables](https://vercel.com/filoz/filecoin-pin-website/settings/environment-variables).
- [ ] Redeployed or confirmed deployment uses the new env vars.
- [ ] Updated `DEFAULT_SESSION_KEY` and the `expires:` comment (UTC) in `src/lib/filecoin-pin/config.ts`, and merged that PR.
- [ ] Revoked the previous session key.
- [ ] Verified the site works without session key expiry errors, on both pin.filecoin.cloud and the gateway-served build.
- [ ] Confirmed the new expiry on-chain with `authorizationExpiry`.

## References

- [Refresh session key (issue #146)](https://github.com/filecoin-project/filecoin-pin-website/issues/146)
- Script: [scripts/create-session-key.sh](../scripts/create-session-key.sh)
- Vercel env vars: [filoz/filecoin-pin-website → Settings → Environment Variables](https://vercel.com/filoz/filecoin-pin-website/settings/environment-variables)
