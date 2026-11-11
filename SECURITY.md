# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the Filecoin Pin website,
please report it responsibly. **Do not open a public issue.**

### Preferred: GitHub private vulnerability reporting

Use the **Security** tab in this repository to submit a private
vulnerability report. This reaches the maintainers directly.

### For vulnerabilities in Filecoin Pin (CLI or GitHub Action)

If your finding is in the Filecoin Pin CLI or GitHub Action rather than
the website, report it on the
[filecoin-pin](https://github.com/filecoin-project/filecoin-pin)
repository instead.

### For vulnerabilities in the Filecoin protocol

If your finding affects the core Filecoin protocol (Lotus,
builtin-actors, FVM, F3, and other
[in-scope repositories](https://immunefi.com/bug-bounty/filecoin/)),
report it through the **Filecoin Bug Bounty Program** on Immunefi:

> **https://immunefi.com/bug-bounty/filecoin/**

The program is administered by Filecoin Foundation and offers bounties
for qualifying vulnerabilities. See the
[Coordinated Disclosure Policy](https://fil.org/security/coordinated-disclosure-policy)
for the full process, timelines, and Safe Harbor provisions.

## Encryption threat model

Uploads are encrypted by default with Keysmith-derived keys (see the
README's Encryption section). Two properties deserve a security
reviewer's attention:

- **The session vault is the boundary.** The browser session key and
  the group-key grant wrapped to it live together in IndexedDB. The
  vault record is AES-GCM encrypted, but its wrapping key is stored in
  the same IndexedDB record: this is at-rest obfuscation, not a
  hardware boundary. Any code running on the origin, or a local
  attacker reading the browser profile, recovers both — which yields
  write access (until session expiry) and, new with encryption, read
  access to every file under the group key.
- **Key compromise is permanent.** The group key derives
  deterministically from an owner-wallet signature over a fixed
  message; grants and share links cannot be revoked and do not expire.
  Revoking the session key does not retract decryption ability already
  extracted. Recovery from a compromise means creating a new group key
  and re-encrypting and re-uploading all content.

## What to include in a report

- Description of the vulnerability and its potential impact
- Steps to reproduce or a proof of concept
- Affected version(s) or commit(s)
- Any suggested mitigation or fix

## What to expect

- Acknowledgement within 3 business days
- An initial assessment within 10 business days
- We will coordinate with you on disclosure timing

## Security contacts

For questions about this policy or the broader Filecoin security
program, see [fil.org/security](https://fil.org/security).
