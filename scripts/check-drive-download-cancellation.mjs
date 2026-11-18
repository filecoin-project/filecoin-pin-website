import assert from 'node:assert/strict'
import { prepareEncryptedBrowserPage } from './drive-browser-fixtures.mjs'
import { openDrive } from './drive-browser-navigation.mjs'
export async function checkDownloadCancellation(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    await prepareEncryptedBrowserPage(page, { seedDirectory: false })
    await page.goto(process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173/')
    await openDrive(page)
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
    const stored = await page.evaluate(async () => {
      const { issueEncryptionCredential, encryptCar } = await import('/src/lib/filecoin-pin/encryption.ts')
      const { generatePrivateKey } = await import('/node_modules/.vite/deps/viem_accounts.js')
      const { createCarFromFile } = await import('/node_modules/.vite/deps/filecoin-pin_core_unixfs.js')
      const { calculate } = await import('/node_modules/.vite/deps/@filoz_synapse-core_piece.js')
      const address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      const signer = {
        address,
        signTypedData: (args) => window.__signDriveTestTypedData(address, JSON.stringify(args)),
      }
      const key = generatePrivateKey(),
        credential = await issueEncryptionCredential(signer, key)
      const envelope = await encryptCar(key, credential, new Uint8Array([1, 2, 3]))
      const car = await createCarFromFile(new File([envelope], 'encrypted.bin'))
      return {
        bytes: [...car.carBytes],
        cid: car.rootCid.toString(),
        pieceCid: (await calculate(car.carBytes)).toString(),
      }
    })
    await page.route('https://cancel-sp.example/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/vnd.ipld.car', body: Buffer.from(stored.bytes) })
    )
    await page.evaluate(async (record) => {
      const original = window.ethereum.request.bind(window.ethereum)
      window.__cancelSignatureCount = 0
      window.ethereum.request = async (args) => {
        if (args.method === 'eth_signTypedData_v4') {
          window.__cancelSignatureCount++
          throw Object.assign(new Error('User rejected the request.'), { code: 4001 })
        }
        return original(args)
      }
      const { mutateCachedPieces } = await import('/src/lib/local-storage/piece-cache.ts')
      await mutateCachedPieces(window.__driveTestScope, (current) => [
        ...current,
        {
          id: 'cancel-demo',
          fileName: '1',
          fileSize: '116 KB',
          cid: record.cid,
          pieceCid: record.pieceCid,
          providerName: 'Demo provider',
          providerId: '',
          datasetId: '',
          serviceURL: 'https://cancel-sp.example',
          transactionHash: '',
          network: 'mainnet',
          uploadedAt: Date.now(),
          encrypted: true,
          copyCount: 1,
        },
      ])
    }, stored)
    await page.getByRole('button', { name: '1', exact: true }).waitFor()
    const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: '1', exact: true }) })
    await row.getByRole('button', { name: 'Download', exact: true }).click()
    await page.getByText('Download cancelled. Sign with your wallet to decrypt this upload.', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.__cancelSignatureCount), 1)
    assert.equal(await page.getByText('1: Failed to fetch', { exact: true }).count(), 0)
    assert.equal(await row.getByRole('button', { name: 'Download', exact: true }).isEnabled(), true)
    await page.screenshot({ path: '/tmp/drive-download-signature-cancelled.png', animations: 'disabled' })
    console.log(
      'Real encrypted download cancellation captured: one rejected signature, neutral toast, no fetch error, Download restored.'
    )
  } finally {
    await page.close()
  }
}
