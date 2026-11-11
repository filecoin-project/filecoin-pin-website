import assert from 'node:assert/strict'
import { checkDownloadCancellation } from './check-drive-download-cancellation.mjs'
import { prepareEncryptedBrowserPage } from './drive-browser-fixtures.mjs'

/** Chromium Response body consumption loses stream errors; exercise real encryption in the browser. */
export async function checkFileAccessErrors(browser) {
  await checkDownloadCancellation(browser)
  const page = await browser.newPage()
  try {
    await prepareEncryptedBrowserPage(page, { seedDirectory: false })
    await page.goto(process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173/')
    const result = await page.evaluate(async () => {
      const {
        encryptCar,
        decryptEnvelope,
        issueEncryptionCredential,
        grantKeyResolver,
        ownerKeyResolver,
        createShareLink,
      } = await import('/src/lib/filecoin-pin/encryption.ts')
      const { describeFileAccessError } = await import('/src/utils/file-access-error.ts')
      const { generatePrivateKey } = await import('/node_modules/.vite/deps/viem_accounts.js')
      const address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      const signer = {
        address,
        signTypedData: (args) => window.__signDriveTestTypedData(address, JSON.stringify(args)),
      }
      const privateKey = generatePrivateKey()
      const credential = await issueEncryptionCredential(signer, privateKey)
      const original = new Uint8Array([0, 1, 255, 2, 7])
      const envelope = await encryptCar(privateKey, credential, original)
      const rejection = Object.assign(new Error('User rejected the request.'), { code: 4001 })
      const rejectingSigner = {
        address,
        signTypedData: async () => {
          throw rejection
        },
      }
      let download, preview, share
      try {
        await decryptEnvelope(envelope, ownerKeyResolver(rejectingSigner))
      } catch (cause) {
        download = { sameError: cause === rejection, code: cause.code, ...describeFileAccessError(cause, 'download') }
      }
      const fee = await import('/node_modules/.vite/deps/filecoin-encryption-envelope.js')
      const appMetadata = (await fee.parse(envelope)).appMetadata
      for (const action of ['preview', 'share']) {
        try {
          await createShareLink({
            sender: { signer: rejectingSigner },
            rootCid: 'bafkreigh2akiscaildcgck5x5wqlooqkztdxqv5t5uwmybnv5brkw4zj3m',
            appMetadata,
          })
        } catch (cause) {
          const failure = { sameError: cause === rejection, ...describeFileAccessError(cause, action) }
          if (action === 'preview') preview = failure
          else share = failure
        }
      }
      const decrypted = await decryptEnvelope(envelope, grantKeyResolver(privateKey, credential))
      const damaged = envelope.slice()
      damaged[damaged.length - 1] ^= 1
      let integrity
      try {
        await decryptEnvelope(damaged, grantKeyResolver(privateKey, credential))
      } catch (cause) {
        integrity = describeFileAccessError(cause, 'download')
      }
      return {
        download,
        preview,
        share,
        original: [...original],
        decrypted: [...decrypted],
        integrity,
        network: describeFileAccessError(new TypeError('Failed to fetch'), 'download'),
      }
    })
    assert.equal(result.download.sameError, true)
    assert.equal(result.download.code, 4001)
    for (const action of ['download', 'preview', 'share']) assert.equal(result[action].cancelled, true)
    assert.deepEqual(result.decrypted, result.original)
    assert.equal(result.integrity.cancelled, false)
    assert.match(result.integrity.message, /wrong key|modified/i)
    assert.deepEqual(result.network, { cancelled: false, message: 'Failed to fetch' })
    console.log(
      'File access error browser checks passed: cancelled signatures retain code 4001; normal decryption, integrity and network failures remain distinct.'
    )
  } finally {
    await page.close()
  }
}
