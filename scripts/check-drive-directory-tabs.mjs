import assert from 'node:assert/strict'
import { prepareBrowserPage } from './drive-browser-fixtures.mjs'

// Two real pages sharing browser storage and native Web Locks, with wallet/RPC boundaries mocked.
export async function checkDirectoryTabs(page, errors) {
  const sibling = await page.context().newPage()
  sibling.on('pageerror', (error) => errors.push(error.message))
  const scope = '314:0x1111111111111111111111111111111111111111'
  try {
    await prepareBrowserPage(sibling, { seedDirectory: false })
    await sibling.goto(page.url())
    await sibling.getByRole('button', { name: 'report.pdf', exact: true }).waitFor()

    // Hold the native lock so both pages must queue their read/modify/write operations.
    await page.evaluate(async (scope) => {
      let acquired
      const ready = new Promise((resolve) => {
        acquired = resolve
      })
      window.__directoryLock = navigator.locks.request(`filecoin-drive-directory-${scope}`, async () => {
        acquired()
        await new Promise((resolve) => {
          window.__releaseDirectoryLock = resolve
        })
      })
      await ready
    }, scope)
    await sibling.evaluate(async (scope) => {
      const { addCachedPiece, getCachedPieces } = await import('/src/lib/local-storage/piece-cache.ts')
      const original = getCachedPieces(scope)[0]
      window.__tabAddition = addCachedPiece(scope, { ...original, id: 'tab-b', fileName: 'tab-b.txt' }).then(() => {
        window.__tabAdditionSaved = true
      })
    }, scope)
    await page.getByRole('button', { name: 'Details', exact: true }).click()
    await page.getByLabel('Display name', { exact: true }).fill('Renamed in tab A.pdf')
    await page.getByRole('button', { name: 'Save directory changes', exact: true }).click()
    assert.equal(await sibling.evaluate(() => window.__tabAdditionSaved === true), false)
    await page.evaluate(async () => {
      window.__releaseDirectoryLock()
      await window.__directoryLock
    })
    await sibling.evaluate(() => window.__tabAddition)
    await page.getByRole('button', { name: 'Close details', exact: true }).click()
    for (const tab of [page, sibling]) {
      await tab.getByRole('button', { name: 'Renamed in tab A.pdf', exact: true }).waitFor()
      await tab.getByRole('button', { name: 'tab-b.txt', exact: true }).waitFor()
    }

    // A deletion operation excludes the same content in another tab while allowing directory writes.
    await page.evaluate(async (scope) => {
      const { withFileDeletionLock } = await import('/src/lib/filecoin-pin/delete.ts')
      let acquired
      const ready = new Promise((resolve) => {
        acquired = resolve
      })
      window.__deletionLock = withFileDeletionLock(scope, 'test-piece', async () => {
        acquired()
        await new Promise((resolve) => {
          window.__releaseDeletionLock = resolve
        })
      })
      await ready
    }, scope)
    const concurrentDeletion = await sibling.evaluate(async (scope) => {
      const { withFileDeletionLock } = await import('/src/lib/filecoin-pin/delete.ts')
      try {
        return await withFileDeletionLock(scope, 'test-piece', async () => 'started')
      } catch (error) {
        return error.message
      }
    }, scope)
    assert.match(concurrentDeletion, /being deleted in another tab/)

    // Independent folder writes must also merge instead of replacing another tab's folders.
    await Promise.all(
      [page, sibling].map((tab, index) =>
        tab.evaluate(
          async ({ scope, index }) => {
            const { saveFolders } = await import('/src/lib/local-storage/drive-directory.ts')
            await saveFolders(scope, [`tab-${index + 1}`])
          },
          { scope, index }
        )
      )
    )
    for (const tab of [page, sibling])
      for (const name of ['tab-1', 'tab-2'])
        await tab.getByRole('navigation', { name: 'File folders' }).getByRole('button', { name, exact: true }).waitFor()

    await page.evaluate(async () => {
      window.__releaseDeletionLock()
      await window.__deletionLock
    })
    assert.equal(
      await sibling.evaluate(async (scope) => {
        const { withFileDeletionLock } = await import('/src/lib/filecoin-pin/delete.ts')
        return withFileDeletionLock(scope, 'test-piece', async () => 'available')
      }, scope),
      'available'
    )

    // Freeze a real tab and suppress storage events so resume must recover missed updates.
    await page.evaluate(() => {
      window.__ignoreStorage = (event) => event.stopImmediatePropagation()
      window.addEventListener('storage', window.__ignoreStorage, true)
    })
    const lifecycle = await page.context().newCDPSession(page)
    try {
      await lifecycle.send('Page.setWebLifecycleState', { state: 'frozen' })
      await sibling.evaluate(async (scope) => {
        const { mutateCachedPieces } = await import('/src/lib/local-storage/piece-cache.ts')
        await mutateCachedPieces(scope, (files) =>
          files.map((file) => (file.id === 'demo-file' ? { ...file, fileName: 'Changed while asleep.pdf' } : file))
        )
        const { saveFolders } = await import('/src/lib/local-storage/drive-directory.ts')
        await saveFolders(scope, ['created-while-asleep'])
      }, scope)
    } finally {
      await lifecycle.send('Page.setWebLifecycleState', { state: 'active' })
      await lifecycle.detach()
    }
    await page.getByRole('button', { name: 'Changed while asleep.pdf', exact: true }).waitFor()
    await page
      .getByRole('navigation', { name: 'File folders' })
      .getByRole('button', { name: 'created-while-asleep', exact: true })
      .waitFor()
    await page.evaluate(() => window.removeEventListener('storage', window.__ignoreStorage, true))

    // Leave the original fixture in place for the remaining browser scenarios.
    await sibling.evaluate(async (scope) => {
      const { mutateCachedPieces } = await import('/src/lib/local-storage/piece-cache.ts')
      await mutateCachedPieces(scope, (files) =>
        files
          .filter((file) => file.id !== 'tab-b')
          .map((file) => (file.id === 'demo-file' ? { ...file, fileName: 'report.pdf' } : file))
      )
    }, scope)
    await page.getByRole('button', { name: 'report.pdf', exact: true }).waitFor()
  } finally {
    await page.evaluate(() => window.__releaseDirectoryLock?.()).catch(() => undefined)
    await page.evaluate(() => window.__releaseDeletionLock?.()).catch(() => undefined)
    await sibling.unrouteAll({ behavior: 'ignoreErrors' })
    await sibling.close()
  }
}
