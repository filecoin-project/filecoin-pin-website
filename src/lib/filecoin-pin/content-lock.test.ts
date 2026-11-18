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

it('locks both encrypted identities and releases partial acquisition on conflict', async () => {
  const upload = await acquireContentLock('encrypted-wallet', 'inner')
  try {
    await expect(withFileDeletionLock('encrypted-wallet', 'envelope', async () => 'deleted', 'inner')).rejects.toThrow(
      'Retry after'
    )
    const publicLock = await acquireContentLock('encrypted-wallet', 'envelope')
    await publicLock()
  } finally {
    await upload()
  }
  await expect(
    withFileDeletionLock(
      'encrypted-wallet',
      'envelope',
      async () => {
        await expect(acquireContentLock('encrypted-wallet', 'inner')).rejects.toThrow('Retry after')
        await expect(acquireContentLock('encrypted-wallet', 'envelope')).rejects.toThrow('Retry after')
        const unrelated = await acquireContentLock('encrypted-wallet', 'other')
        await unrelated()
        throw new Error('Provider unavailable')
      },
      'inner'
    )
  ).rejects.toThrow('Provider unavailable')
  for (const root of ['inner', 'envelope']) {
    const release = await acquireContentLock('encrypted-wallet', root)
    await release()
  }
})
