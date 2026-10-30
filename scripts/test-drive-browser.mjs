import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { checkDirectoryTabs } from './check-drive-directory-tabs.mjs'
import { checkSessionTabs } from './check-drive-session-tabs.mjs'
import { checkWalletSelection } from './check-drive-wallet-selection.mjs'
import { prepareBrowserPage } from './drive-browser-fixtures.mjs'

// Run against npm run dev. All wallet requests and external RPCs are mocked.
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
try {
  if (!process.env.DRIVE_TEST_WALLETCONNECT) await checkWalletSelection(browser)
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const mockBrowser = await prepareBrowserPage(page)
  await page.goto(process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173/')
  await page.getByRole('heading', { name: 'A browser drive for Filecoin', exact: true }).waitFor()
  const aligned = await page.getByLabel('Network', { exact: true }).evaluate((select) => {
    const arrow = select.parentElement.querySelector('svg').getBoundingClientRect()
    const field = select.getBoundingClientRect()
    return Math.abs(arrow.y + arrow.height / 2 - (field.y + field.height / 2)) < 1
  })
  assert.equal(aligned, true, 'Network arrow is not vertically centered')
  await page.screenshot({ path: '/tmp/filecoin-drive-landing-desktop.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Mobile landing overflows horizontally'
  )
  await page.screenshot({ path: '/tmp/filecoin-drive-landing-mobile.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 1440, height: 1080 })
  if (process.env.DRIVE_TEST_WALLETCONNECT) {
    assert.equal(mockBrowser.sdkLoads(), 0, 'WalletConnect SDK loaded before it was requested')
    await page.getByRole('button', { name: 'WalletConnect', exact: true }).click()
  } else {
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
  }
  await page.getByRole('button', { name: 'report.pdf', exact: true }).waitFor({ timeout: 20000 })
  await page.screenshot({ path: '/tmp/filecoin-drive-setup.png', fullPage: true, animations: 'disabled' })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const shareDialog = page.getByRole('dialog', { name: 'Share file', exact: true })
  const shareLink = await shareDialog.getByRole('textbox', { name: 'Share link', exact: true }).inputValue()
  assert.match(shareLink, /^https:\/\/[^/]+\.ipfs\.inbrowser\.link\/\?filename=/)
  assert.equal(await shareDialog.getByText('Copied!', { exact: true }).count(), 0)
  await shareDialog.getByRole('button', { name: 'Copy link', exact: true }).click()
  await shareDialog.getByText('Copied!', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), shareLink)
  assert.equal(await shareDialog.locator('svg title').textContent(), 'Share link QR code')
  await page.screenshot({ path: '/tmp/filecoin-drive-share-desktop.png', animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  const shareBox = await shareDialog.boundingBox()
  assert(shareBox.x >= 0 && shareBox.x + shareBox.width <= 390, 'Share panel overflows mobile viewport')
  await page.screenshot({ path: '/tmp/filecoin-drive-share-mobile.png', animations: 'disabled' })
  await shareDialog.getByRole('button', { name: 'Close share', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 1080 })

  if (process.env.DRIVE_TEST_WALLETCONNECT) {
    assert.equal(mockBrowser.sdkLoads(), 1)
    const options = await page.evaluate(() => window.__walletConnectOptions)
    assert.equal(options.showQrModal, true)
    assert.deepEqual(await page.evaluate(() => window.__walletConnectPairing), {
      chains: [314],
      optionalChains: [314159],
    })
  }
  await checkSessionTabs(page)
  await checkDirectoryTabs(page, errors)
  await page.evaluate(async () => {
    const { mutateCachedPieces } = await import('/src/lib/local-storage/piece-cache.ts')
    await mutateCachedPieces('314:0x1111111111111111111111111111111111111111', (files) =>
      files.map((file) => ({ ...file, fileName: 'Annual report.pdf', folderPath: 'reports/2026' }))
    )
  })
  await page.getByRole('button', { name: '2026', exact: true }).click()
  await page.getByRole('button', { name: 'Annual report.pdf', exact: true }).click()
  assert.equal(await page.getByLabel('Display name', { exact: true }).count(), 0)
  await page.screenshot({ path: '/tmp/filecoin-drive-details.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Close details', exact: true }).click()
  assert((await page.locator('table').boundingBox()).y < 500, 'File table should occupy the first desktop viewport')
  await page.getByRole('button', { name: 'Wallet and storage', exact: true }).click()
  await page.getByRole('checkbox', { name: 'I authorize storage uploads and file deletions for this browser.' }).check()
  await page.getByRole('button', { name: 'Authorize session', exact: true }).click()
  await page
    .getByText('Wallet setup · Session authorized', { exact: true })
    .waitFor({ timeout: 20000 })
    .catch(async (error) => {
      console.log(await page.locator('body').innerText())
      console.log(errors)
      throw error
    })
  await page.getByRole('button', { name: 'Close Wallet and storage', exact: true }).click()
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Wallet and storage')
  await page.getByRole('button', { name: 'Wallet and storage', exact: true }).click()
  await page.getByText('Wallet setup complete. You can upload files.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Continue to upload', exact: true }).click()
  await page.getByRole('textbox', { name: 'Upload location', exact: true }).waitFor()
  assert.equal(await page.getByRole('textbox', { name: 'Upload location', exact: true }).inputValue(), 'reports/2026')
  await page.getByRole('button', { name: 'Close Upload files', exact: true }).click()
  await page.getByRole('button', { name: 'Upload files', exact: true }).click()
  await page.getByRole('textbox', { name: 'Upload location', exact: true }).waitFor()
  assert.equal(await page.getByRole('textbox', { name: 'Upload location', exact: true }).inputValue(), 'reports/2026')
  await page.getByText('Click to upload', { exact: true }).waitFor()
  const uploadPanel = page.getByRole('dialog', { name: 'Upload files', exact: true })
  await uploadPanel.locator('input[type="file"]').evaluate((input) => {
    const file = new File(['size fixture'], 'oversize.bin')
    Object.defineProperty(file, 'size', { value: 200_000_001 })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await uploadPanel.getByRole('alert').filter({ hasText: 'File is too large.' }).waitFor()
  assert.equal(await uploadPanel.getByRole('button', { name: 'Upload', exact: true }).isDisabled(), true)
  await uploadPanel.locator('input[type="file"]').setInputFiles({
    name: 'small.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('valid file'),
  })
  assert.equal(await uploadPanel.getByRole('alert').count(), 0, 'Valid selection must clear the size error')
  assert.equal(await uploadPanel.getByRole('button', { name: 'Upload', exact: true }).isEnabled(), true)
  await uploadPanel.getByRole('button', { name: 'Remove selected file', exact: true }).click()
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Expanded upload overflows horizontally'
  )
  await page.screenshot({ path: '/tmp/filecoin-drive-upload.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Mobile upload overflows horizontally'
  )
  await page.screenshot({ path: '/tmp/filecoin-drive-upload-mobile.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 1440, height: 1080 })
  await page.getByRole('button', { name: 'Close Upload files', exact: true }).click()
  await page.screenshot({ path: '/tmp/filecoin-drive-desktop.png', fullPage: true, animations: 'disabled' })
  const backup = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('filecoin-pin-piece-cache-v1-314:0x1111111111111111111111111111111111111111'))
  )
  assert.equal(backup[0].folderPath, 'reports/2026')
  assert.equal(backup[0].fileName, 'Annual report.pdf')
  assert.equal(await page.getByRole('button', { name: 'Export backup', exact: true }).count(), 0)
  // A new browser context shares neither the directory nor the session vault.
  const restored = await browser.newPage({ viewport: { width: 1440, height: 1080 } })
  restored.on('pageerror', (error) => errors.push(error.message))
  await prepareBrowserPage(restored, { seedDirectory: false, indexedDirectory: true })
  await restored.goto(process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173/')
  await restored.getByRole('button', { name: 'Connect wallet', exact: true }).click()
  await restored.getByRole('button', { name: '2026', exact: true }).waitFor()
  await restored.getByRole('button', { name: '2026', exact: true }).click()
  await restored.getByRole('button', { name: 'Annual report.pdf', exact: true }).waitFor()
  await restored.getByRole('button', { name: 'Wallet and storage', exact: true }).click()
  assert.equal(await restored.getByRole('button', { name: 'Authorize session', exact: true }).count(), 1)
  assert.equal(await restored.getByRole('button', { name: 'Renew authorization', exact: true }).count(), 0)
  await restored.getByRole('button', { name: 'Close Wallet and storage', exact: true }).click()
  await restored.getByRole('button', { name: 'Details', exact: true }).click()
  assert.equal(await restored.getByLabel('IPFS root CID', { exact: true }).inputValue(), backup[0].cid)
  assert.equal(await restored.getByLabel('Piece CID', { exact: true }).inputValue(), backup[0].pieceCid)
  await restored.getByRole('button', { name: 'Close details', exact: true }).click()
  await restored.reload()
  await restored.getByRole('button', { name: 'Disconnect', exact: true }).waitFor()
  const silentMethods = await restored.evaluate(() => window.__driveWalletRequests)
  assert(silentMethods.includes('eth_accounts'))
  assert(
    silentMethods.every((method) => ['eth_accounts', 'eth_chainId'].includes(method)),
    'Reload must not prompt or switch networks'
  )
  await restored.getByRole('button', { name: '2026', exact: true }).click()
  await restored.getByRole('button', { name: 'Annual report.pdf', exact: true }).waitFor()
  await restored.evaluate(() => window.ethereum.switchAccount('0x2222222222222222222222222222222222222222'))
  await restored.getByText('No files here yet. Upload to this folder.', { exact: true }).waitFor()
  await restored.unrouteAll({ behavior: 'ignoreErrors' })
  await restored.close()
  await page.getByLabel('Network', { exact: true }).selectOption('calibration')
  await page.getByText('No files here yet. Upload to this folder.', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Annual report.pdf', exact: true }).count(), 0)
  await page.reload()
  assert.equal(await page.getByLabel('Network', { exact: true }).inputValue(), 'calibration')
  await page.getByRole('button', { name: 'Disconnect', exact: true }).waitFor()
  const restoredMethods = await page.evaluate(() => window.__driveWalletRequests)
  assert.equal(restoredMethods.includes('eth_requestAccounts'), false)
  assert.equal(restoredMethods.includes('wallet_switchEthereumChain'), false)
  assert.equal(await page.evaluate(() => window.ethereum.request({ method: 'eth_chainId' })), '0x4cb2f')
  if (process.env.DRIVE_TEST_WALLETCONNECT)
    assert.equal(
      await page.evaluate(() => window.__walletConnectPairing),
      undefined,
      'Reload must not start a new pairing'
    )
  await page.getByLabel('Network', { exact: true }).selectOption('mainnet')
  await page.getByRole('button', { name: '2026', exact: true }).waitFor()
  await page.getByRole('button', { name: '2026', exact: true }).click()
  await page.getByText('Session ready', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Annual report.pdf', exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.screenshot({ path: '/tmp/filecoin-drive-mobile.png', fullPage: true, animations: 'disabled' })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Mobile page overflows horizontally'
  )
  await page.evaluate(() => window.ethereum.switchAccount('0x2222222222222222222222222222222222222222'))
  await page.getByText('No files here yet. Upload to this folder.', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Annual report.pdf', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
  await page.getByRole('heading', { name: 'A browser drive for Filecoin', exact: true }).waitFor()
  if (process.env.DRIVE_TEST_WALLETCONNECT)
    assert.equal(await page.evaluate(() => window.__walletConnectDisconnected), true)
  const loadsBeforeDisconnectReload = mockBrowser.sdkLoads()
  await page.reload()
  await page.getByRole('heading', { name: 'A browser drive for Filecoin', exact: true }).waitFor()
  assert.equal(mockBrowser.sdkLoads(), loadsBeforeDisconnectReload)
  assert.deepEqual(await page.evaluate(() => window.__driveWalletRequests), [])
  for (const setup of [
    { funded: false, approved: true },
    { funded: true, approved: false },
  ]) {
    const blockedPage = await browser.newPage()
    await prepareBrowserPage(blockedPage, { seedDirectory: false, ...setup })
    await blockedPage.goto(process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173/')
    await blockedPage.getByRole('button', { name: 'Connect wallet', exact: true }).click()
    await blockedPage.getByRole('button', { name: 'Upload files', exact: true }).click()
    await blockedPage.getByRole('dialog', { name: 'Wallet and storage', exact: true }).waitFor()
    await blockedPage
      .getByRole('checkbox', {
        name: 'I authorize storage uploads and file deletions for this browser.',
      })
      .check()
    await blockedPage.getByRole('button', { name: 'Authorize session', exact: true }).click()
    await blockedPage.getByText('Wallet setup · Session authorized', { exact: true }).waitFor()
    await blockedPage.getByText('Setup required', { exact: true }).waitFor()
    assert.equal(
      await blockedPage.getByText('Click to upload', { exact: true }).count(),
      0,
      'An authorized session must not bypass missing storage funds or payment approval'
    )
  }
  assert.deepEqual(errors, [])
  console.log(
    'Browser checks passed: cross-tab directory writes and resume, session authorization, folders, file details, cross-browser indexed recovery and reload, wallet/network isolation, desktop/mobile rendering'
  )
} finally {
  for (const context of browser.contexts())
    for (const page of context.pages()) await page.unrouteAll({ behavior: 'ignoreErrors' })
  await browser.close()
}
