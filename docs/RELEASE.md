# Release process

After the migration below, all feature, fix, documentation and dependency PRs
target `staging`. The default branch becomes `staging`; `main` remains production.

```text
feature branch → staging → main → Vercel production
```

## Feature development

Branch from the latest `staging`, open a PR against `staging`, and follow the
[contribution guide](../CONTRIBUTING.md). CI runs lint, tests and the production
build on PRs to both long-lived branches and on pushes to either branch. Feature
PRs can use squash merge with a conventional commit title.

The [deployment workflow](../.github/workflows/deploy-website.yml) deploys same-repository
PRs to Vercel Preview. Fork and Dependabot PRs run CI without a Vercel deployment.
PR deployments use the event's exact PR head SHA; CI checks the proposed merge result. The GitHub
environment links to the deployment. A push to `staging` updates its fixed hostname.
The [title check](../.github/workflows/pr-title.yml) validates conventional PR titles.
It and the main guard inspect metadata only, without executing PR code.

## Promote to production

The [promotion workflow](../.github/workflows/promote-staging.yml) creates or updates
one `staging` → `main` PR after a staging push. Identical file content is skipped,
including history-only back-merges. Its commit list is based on history and can
include previously released commits if history was squashed or cherry-picked.
The generated description replaces manual description edits on subsequent pushes;
record validation evidence in PR comments.

1. If the bot-created PR displays **Approve workflows to run**, a maintainer with
   write access must approve the workflows. Creating a PR with `GITHUB_TOKEN`
   does not guarantee unattended CI. Each new promotion PR may require approval.
   Later developer merges into staging normally trigger push and PR CI without
   this bot-event approval. Editing the generated description does not rerun CI.
2. Confirm CI passes and the latest staging deployment is ready. Smoke-test wallet
   connection, upload, download and deletion on staging. Staging is a deployment
   environment, not a blockchain network: the current UI defaults to Mainnet and
   has no network selector. Live transactions use real funds; use the mocked
   browser checks in the contribution guide for automated transaction coverage.
3. Merge the promotion PR using **Create a merge commit**, never squash or rebase.
   Preserve the `staging` branch. This keeps shared history for future promotions.
4. Confirm the Vercel production deployment succeeds and check the production site.
   A failed deployment can be retried by rerunning the deployment workflow or
   manually dispatching it on `main`.

Staging is a moving integration branch: if more changes land during validation,
validate the updated deployment before promoting. Promotion is always manual.

## Emergency fixes

The [main guard](../.github/workflows/guard-main.yml) warns on PRs targeting `main`
from anything other than this repository's `staging`. It is advisory, matching
the emergency-fix process: review and test the fix, merge to main, then promptly
back-merge main into staging with a merge commit. Do not squash the back-merge.

## Maintainer setup and migration

Complete these settings before enabling the new flow. Repository settings and
Vercel configuration are separate from the files in this PR.

1. Enable merge commits in GitHub repository settings (currently disabled when
   this change was prepared). Keep squash available for feature PRs. Configure a
   main ruleset allowing only the merge-commit method for PR merges; do not require
   linear history. Protect both main and staging from deletion and force pushes.
   Require PR review and the `test` check from CI on both branches. Also require
   `Validate Conventional Commit title` after verifying it runs for bot-created
   promotion PRs; metadata workflows have different event behavior from ordinary
   PR CI. Do not make `Deploy` or `filecoin-upload / upload` universally required,
   because fork and Dependabot PRs skip these jobs. Keep the guard advisory for
   emergency fixes. Retain staging after promotion (including manual deletion
   prompts); disable automatic deletion of head branches or protect staging.
   If main requires branches to be up to date before merging, back-merge main
   into staging with a merge commit whenever that requirement blocks promotion.
   A production merge commit lives on main, so this can be needed even without
   an emergency fix. Do not use rebase or squash to satisfy that requirement.
2. Configure GitHub secrets `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and `VERCEL_TOKEN`
   for the existing Vercel project. Give the token access to deploy that project.
   Set repository variable `STAGING_DOMAIN` to a fixed Vercel alias hostname,
   without `https://` or a path. Use an available Vercel hostname or configure a
   custom domain in Vercel and DNS first.
   At review time, only `WALLET_PRIVATE_KEY` was present in the repository secret
   list; the Vercel deployment secrets and hostname variables were not configured.
3. Configure GitHub `Production` and `Preview` environments. Limit Production
   deployments to main; Preview must allow staging and PR deployment refs. If
   secrets are environment-scoped, make them available in both environments.
4. Keep the Vercel production branch as main. Confirm the project uses Vite with
   the repository root as its root directory. The Vercel configuration explicitly
   sets `npm run build` and output directory `dist`. Preview and Production should
   contain the intended build-time environment variables. The
   [Vercel configuration](../vercel.json) disables Git integration deployments;
   Actions uploads source and Vercel builds remotely with the team token, avoiding
   dependence on individual commit authors' Vercel deployment roles. Configure
   secrets before merging this change to avoid interrupting deployments.
5. The staging branch has already been created from main, before this setup change.
   Open the setup PR against main as a bootstrap exception. After the deployment
   secrets are configured, verify its Actions preview, merge it, and confirm the
   Actions production deployment succeeds. Then open a main → staging PR to bring
   the setup into staging, using a merge commit rather than squash or rebase.
   Do not recreate or force-push staging. Verify its deployment and fixed alias,
   then set staging as the default branch and retarget existing feature/dependency
   PRs. New Dependabot PRs explicitly target staging through
   [its configuration](../.github/dependabot.yml).
6. Allow GitHub Actions to create PRs in the repository's Actions settings.
   Confirm organization policy also permits this. Push a change through a staging
   PR and verify the automatic promotion PR, approval prompt when applicable,
   required CI checks, staging alias and production promotion end to end.

Deployments run independently from CI, as in Pay Explorer. A deployment can be
ready while CI is still running or failing: Vercel readiness is not approval to
merge. Branch rules and staging validation are the release gate. The production
job runs after a main push, so verify its result separately after promotion.

If the initial Actions deployment fails, fix its secrets/settings and rerun the
workflow on main. If the integration must be restored, revert the deployment
migration (including the Git-deployment setting in the Vercel configuration) via
a reviewed main PR and confirm Vercel Git deployment resumes. The previous live
production deployment remains serving until a replacement is successfully promoted.

The fixed staging origin must be permitted by the configured Reown project for
WalletConnect. For stable PR previews like Pay Explorer, configure optional
repository variable `PREVIEW_DOMAIN` to a dedicated base hostname (no scheme/path),
for example `preview.example.com`. Configure DNS and Vercel for
`pr-<number>.<PREVIEW_DOMAIN>` aliases, and permit the matching origins in Reown
using its supported allowlist rules. The workflow aliases same-repository PRs
and links to the stable address. Without this variable, it links to the generated
Vercel URL; that origin still needs authorization for live WalletConnect testing.
Check Vercel deployment protection permits the team's intended preview access.
Browser sessions and local
file metadata are origin-scoped; staging and production do not share them.

The [Filecoin upload workflow](../.github/workflows/filecoin-pin-upload.yml) still
uploads CI build artifacts to Calibration using its existing upload wallet.
Fork and Dependabot runs skip this upload because they cannot access its secret.
It does not switch the production domain and is separate from Vercel deployment.
Never expose that upload key as a Vite build variable or application credential.

## Scope compared with Pay Explorer

This flow includes staging promotion, the advisory main guard, Vercel deployment,
optional stable PR domains and conventional PR titles. Pay's Release Please,
Goldsky/subgraph tags and notification-service deployments do not apply to this
single Vite application. Pay also runs browser E2E checks in Actions; this change
keeps this repository's existing unit-test/build CI. The browser checks described
in the contribution guide remain local, and live-wallet staging validation remains
manual. Adding those browser checks to CI is separate work.
