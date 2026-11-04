import assert from 'node:assert/strict'
import { prepareBrowserPage } from './drive-browser-fixtures.mjs'

export async function checkWalletSelection(browser) {
  for (const mixed of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 440 } })
    try {
      const page = await context.newPage()
      await prepareBrowserPage(page)
      await page.addInitScript((mixed) => {
        window.addEventListener('eip6963:requestProvider', () => {
          for (let i = 0; i < (mixed ? 1 : 8); i++) {
            window.dispatchEvent(
              new CustomEvent('eip6963:announceProvider', {
                detail: {
                  info: {
                    uuid: `350670db-19fa-4704-a166-e52e178b59d${i}`,
                    name: `Test wallet ${i}`,
                    rdns: `test.wallet.${i}`,
                    icon:
                      i === 1
                        ? 'data:image/png;base64,invalid'
                        : `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="blue"/></svg>')}`,
                  },
                  provider: mixed ? { ...window.ethereum } : window.ethereum,
                },
              })
            )
          }
        })
      }, mixed)
      await page.goto(process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173/')
      const dialog = page.getByRole('dialog', { name: 'Connect a wallet', exact: true })
      await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
      await dialog.waitFor()
      assert.equal(await dialog.getByRole('button', { name: 'Browser wallet', exact: true }).count(), 0)
      if (!mixed) {
        await page.waitForFunction(() => document.querySelector('[role="dialog"] img')?.naturalWidth > 0)
        await dialog.getByRole('button', { name: 'Test wallet 1', exact: true }).locator('svg').waitFor()
        assert(
          await dialog.locator('.overflow-y-auto').evaluate((element) => element.scrollHeight > element.clientHeight),
          'Long wallet lists must scroll inside the modal'
        )
        assert(
          await dialog.evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight),
          'Mobile wallet modal must fit the viewport'
        )
      }
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      await page.getByRole('button', { name: 'Connect a wallet', exact: true }).click()
      await dialog.waitFor()
      await dialog.getByRole('button', { name: 'Test wallet 0', exact: true }).click()
      await page.getByRole('button', { name: 'report.pdf', exact: true }).waitFor()
    } finally {
      await context.close()
    }
  }
}
