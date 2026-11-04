import assert from 'node:assert/strict'
import { prepareBrowserPage } from './drive-browser-fixtures.mjs'

export async function checkSessionTabs(page) {
  const sibling = await page.context().newPage()
  const scope = '314:0x3333333333333333333333333333333333333333'
  try {
    await prepareBrowserPage(sibling, { seedDirectory: false })
    await sibling.goto(page.url())
    await sibling.evaluate(async (scope) => {
      const { subscribeBrowserSession, loadBrowserSession } = await import('/src/lib/local-storage/session-vault.ts')
      window.__stopSessionChecks = subscribeBrowserSession(scope, async () => {
        window.__observedSessionRevision = (await loadBrowserSession(scope))?.revision
      })
    }, scope)
    const keys = await Promise.all(
      [page, sibling].map((tab, index) =>
        tab.evaluate(
          async ({ scope, index }) => {
            const { updateBrowserSession } = await import('/src/lib/local-storage/session-vault.ts')
            const session = await updateBrowserSession(
              scope,
              (current) =>
                current ?? {
                  privateKey: `0x${String(index + 3).repeat(64)}`,
                  expiresAt: 1800000000,
                  revision: `tab-${index}`,
                }
            )
            return session.privateKey
          },
          { scope, index }
        )
      )
    )
    assert.equal(keys[0], keys[1], 'Concurrent tabs must reuse one persisted key')
    await page.evaluate(async (scope) => {
      const { updateBrowserSession } = await import('/src/lib/local-storage/session-vault.ts')
      await updateBrowserSession(scope, (current) => ({ ...current, revision: 'updated-in-other-tab' }))
    }, scope)
    await sibling.waitForFunction(() => window.__observedSessionRevision === 'updated-in-other-tab')
  } finally {
    await sibling.evaluate(() => window.__stopSessionChecks?.()).catch(() => undefined)
    await page.evaluate(async (scope) => {
      const { saveBrowserSession } = await import('/src/lib/local-storage/session-vault.ts')
      await saveBrowserSession(scope, null)
    }, scope)
    await sibling.close()
  }
}
