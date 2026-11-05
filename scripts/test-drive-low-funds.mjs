import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { prepareBrowserPage } from './drive-browser-fixtures.mjs'
import { openDrive } from './drive-browser-navigation.mjs'

// Illustrative SDK quote fixtures, not current live-chain prices.
const output = '/tmp/filecoin-low-funds'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const balance of ['0', '0.1']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
    const page = await context.newPage()
    const available = balance === '0' ? '0n' : '100000000000000000n'
    const needed = balance === '0' ? '745200000000000000n' : '645200000000000000n'
    const uploadNeeded = '245200000000000000n'
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareBrowserPage(page, {
      seedDirectory: false,
      funded: balance !== '0',
      depositedBalance: balance === '0' ? '0' : '100000000000000000',
    })
    await page.route('**/src/lib/filecoin-pin/storage-budget.ts*', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `export async function quoteStorageBudget(){return {copies:2,costs:{rates:{perMonth:60000000000000000n},depositNeeded:${needed},needsFwssMaxApproval:false},account:{availableFunds:${available},totalLockup:0n}}}`,
      })
    )
    await page.route('**/src/lib/filecoin-pin/upload-funding.ts*', async (route) => {
      const response = await route.fetch()
      const body = (await response.text()).replace(
        'export async function prepareUploadContexts(',
        'async function originalPrepareUploadContexts('
      )
      await route.fulfill({
        response,
        body:
          body +
          `\nexport async function prepareUploadContexts(){window.__fundingCheckCount=(window.__fundingCheckCount||0)+1;throw new UploadFundingRequired(${uploadNeeded},false,2)}`,
      })
    })
    await page.goto(process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173/')
    await openDrive(page)
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
    await page.getByRole('button', { name: 'Wallet and Storage', exact: true }).click()
    await page
      .getByRole('checkbox', { name: 'I authorize storage uploads and file deletions for this browser.' })
      .check()
    await page.getByRole('button', { name: 'Authorize session', exact: true }).click()
    await page.getByLabel('Session authorized', { exact: true }).waitFor()
    const wallet = page.getByRole('dialog', { name: 'Wallet and Storage', exact: true })
    const budget = page.getByRole('region', { name: 'Storage funds', exact: true })
    await budget
      .locator('dl')
      .getByText(`${balance === '0' ? '0.7452' : '0.6452'} USDFC`, { exact: true })
      .waitFor()
    await page.waitForFunction(
      (expected) => document.querySelector('input[aria-label="Deposit amount in USDFC"]')?.value === expected,
      balance === '0' ? '0.7452' : '0.6452'
    )
    await wallet.evaluate((node) => {
      node.scrollTop = 0
    })
    await wallet.screenshot({ path: `${output}/${balance}-wallet.png`, animations: 'disabled' })
    await budget.screenshot({
      path: `${output}/${balance}-budget.png`,
      animations: 'disabled',
      style: '[role="dialog"] > .sticky {position:static!important}',
    })
    await page.getByRole('button', { name: 'Close Wallet and Storage', exact: true }).click()
    await page.getByRole('button', { name: 'Upload files', exact: true }).click()
    if (balance === '0') {
      await wallet.waitFor()
      await page.getByText('Add funds for storage', { exact: true }).waitFor()
      assert.equal(await page.getByRole('dialog', { name: 'Upload files', exact: true }).count(), 0)
      console.log('0 USDFC: upload opens funding setup before file selection')
    } else {
      const upload = page.getByRole('dialog', { name: 'Upload files', exact: true })
      await upload.locator('input[type=file]').setInputFiles(
        ['example.png', 'notes.txt', 'receipt.csv'].map((name) => ({
          name,
          mimeType: 'text/plain',
          buffer: Buffer.from(name),
        }))
      )
      await upload.getByRole('button', { name: 'Upload 3 files', exact: true }).click()
      await page.getByText('Paused', { exact: true }).waitFor()
      const pausedRow = page.getByRole('button', { name: 'example.png', exact: true }).locator('..').locator('..')
      assert.equal(
        await pausedRow.getByLabel('Uploading…').count(),
        0,
        'Paused uploads must not show an uploading spinner'
      )
      assert.equal(await page.getByRole('columnheader', { name: /Status|Copies/ }).count(), 0)
      for (const name of ['notes.txt', 'receipt.csv']) {
        const row = page.getByRole('button', { name, exact: true }).locator('..').locator('..')
        await row.getByRole('img', { name: 'Waiting to upload', exact: true }).waitFor()
        assert.equal(await row.getByText('Waiting', { exact: true }).count(), 0)
        assert.equal(await row.getByLabel('Uploading…').count(), 0, 'Queued uploads must not show a spinner')
        assert.equal(await row.getByRole('checkbox', { name: `Select ${name}`, exact: true }).isEnabled(), true)
      }

      await page.getByRole('button', { name: 'example.png', exact: true }).click()
      await page.getByRole('button', { name: 'Check funding and continue', exact: true }).waitFor()
      await page
        .getByText('Add 0.2452 USDFC to continue.', {
          exact: false,
        })
        .waitFor()
      await page.getByRole('dialog').screenshot({ path: `${output}/0.1-upload.png`, animations: 'disabled' })
      await page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'Upload status', exact: true }) })
        .last()
        .screenshot({
          path: `${output}/upload-shortfall-status.png`,
          animations: 'disabled',
          style: '[role="dialog"] > .sticky {position:static!important}',
        })
      await page.getByText('Upload details', { exact: true }).click()
      await page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'Upload status', exact: true }) })
        .last()
        .screenshot({
          path: `${output}/upload-details-expanded.png`,
          animations: 'disabled',
          style: '[role="dialog"] > .sticky {position:static!important}',
        })
      assert.equal(await page.getByText('Removes this local record only.', { exact: true }).count(), 0)
      await page.getByRole('button', { name: 'Add funds in Wallet and Storage', exact: true }).click()
      assert.equal(await page.getByRole('dialog').count(), 1)
      const pending = page.getByRole('region', { name: 'Pending upload funding' })
      await pending.getByRole('button', { name: 'Check funding and continue', exact: true }).waitFor()
      await pending.screenshot({
        path: `${output}/upload-shortfall-wallet.png`,
        animations: 'disabled',
        style: '[role="dialog"] > .sticky {position:static!important}',
      })
      await page.getByRole('button', { name: 'Close Wallet and Storage', exact: true }).click()
      for (const name of ['example.png', 'notes.txt', 'receipt.csv']) {
        await page.getByRole('checkbox', { name: `Select ${name}`, exact: true }).check()
      }
      await page.screenshot({ path: `${output}/queue-selected.png`, animations: 'disabled' })
      await page.getByRole('button', { name: 'Remove local records (3)', exact: true }).click()
      const removal = page.getByRole('dialog', { name: 'Remove local records', exact: true })
      await removal.screenshot({ path: `${output}/queue-remove-confirmation.png`, animations: 'disabled' })
      await removal.getByRole('button', { name: 'Remove local records', exact: true }).click()
      await removal.waitFor({ state: 'hidden' })
      for (const name of ['example.png', 'notes.txt', 'receipt.csv']) {
        assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0)
      }
      assert.equal(
        await page.evaluate(() => window.__fundingCheckCount),
        1,
        'No queued upload may start while removing the batch'
      )
      await page.screenshot({ path: `${output}/queue-removed.png`, animations: 'disabled' })
      console.log('0.1 USDFC: actual quote pauses upload with retained file')
    }
    assert.deepEqual(errors, [])
    await context.close()
  }
} finally {
  await browser.close()
}
