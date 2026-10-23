import { requireDirectoryLocks } from '../local-storage/directory-store.ts'

const CONFLICT = 'This content is being uploaded or deleted in another tab. Retry after that operation finishes.'

function acquire(name: string, mode: LockMode): Promise<() => Promise<void>> {
  return new Promise((resolve, reject) => {
    const completed = requireDirectoryLocks().request(name, { mode, ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error(CONFLICT)
      await new Promise<void>((release) =>
        resolve(async () => {
          release()
          await completed
        })
      )
    })
    void completed.catch(reject)
  })
}

/** Missing-root deletions exclude all uploads; known roots only exclude identical content. */
export async function acquireContentLock(scope: string, rootCid: string): Promise<() => Promise<void>> {
  const releaseScope = await acquire(`filecoin-drive-content-${scope}`, rootCid ? 'shared' : 'exclusive')
  try {
    const releaseContent = rootCid
      ? await acquire(`filecoin-drive-content-${scope}-${rootCid}`, 'exclusive')
      : undefined
    return async () => {
      await releaseContent?.()
      await releaseScope()
    }
  } catch (error) {
    await releaseScope()
    throw error
  }
}
