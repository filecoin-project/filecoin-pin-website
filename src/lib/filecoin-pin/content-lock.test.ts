import { describe, expect, it } from 'vitest'
import { acquireContentLock } from './content-lock.ts'
import { withFileDeletionLock } from './delete.ts'

describe('content operation exclusion', () => {
  it('excludes deletion during upload while allowing other content and scopes', async () => {
    const release = await acquireContentLock('wallet-a', 'root-a')
    try {
      await expect(withFileDeletionLock('wallet-a', 'root-a', async () => 'deleted')).rejects.toThrow('Retry after')
      await expect(withFileDeletionLock('wallet-a', 'root-b', async () => 'deleted')).resolves.toBe('deleted')
      await expect(withFileDeletionLock('wallet-b', 'root-a', async () => 'deleted')).resolves.toBe('deleted')
    } finally {
      await release()
    }
    await expect(withFileDeletionLock('wallet-a', 'root-a', async () => 'deleted')).resolves.toBe('deleted')
  })

  it('excludes upload during deletion and releases after failure', async () => {
    await expect(
      withFileDeletionLock('wallet-a', 'root-a', async () => {
        await expect(acquireContentLock('wallet-a', 'root-a')).rejects.toThrow('Retry after')
        throw new Error('Provider unavailable')
      })
    ).rejects.toThrow('Provider unavailable')
    const release = await acquireContentLock('wallet-a', 'root-a')
    await release()
  })

  it('coordinates missing-root deletions with every upload in both directions', async () => {
    const upload = await acquireContentLock('wallet-a', 'root-a')
    await expect(acquireContentLock('wallet-a', '')).rejects.toThrow('Retry after')
    await upload()
    const deletion = await acquireContentLock('wallet-a', '')
    try {
      await expect(acquireContentLock('wallet-a', 'root-b')).rejects.toThrow('Retry after')
    } finally {
      await deletion()
    }
  })
})
