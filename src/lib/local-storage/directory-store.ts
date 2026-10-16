export const DIRECTORY_SAVE_ERROR =
  'Unable to save the browser directory. Keep this page open and export a directory backup before reloading.'

const CHANGE_EVENT = 'filecoin-drive-directory-change'

export function requireDirectoryLocks(): LockManager {
  if (!navigator.locks?.request)
    throw new Error('This browser cannot safely update the file directory. Use a current browser over HTTPS.')
  return navigator.locks
}

/** Only local reads and writes belong inside this lock, never wallet prompts or RPCs. */
export function withDirectoryLock<T>(scope: string, operation: () => T): Promise<T> {
  return requireDirectoryLocks().request(`filecoin-drive-directory-${scope}`, operation)
}

export function subscribeDirectory(key: string, changed: () => void): () => void {
  const storage = (event: StorageEvent) => {
    if (event.storageArea === localStorage && (event.key === key || event.key === null)) changed()
  }
  const local = (event: Event) => {
    if ((event as CustomEvent<string>).detail === key) changed()
  }
  const visible = () => {
    if (document.visibilityState === 'visible') changed()
  }
  window.addEventListener('storage', storage)
  window.addEventListener(CHANGE_EVENT, local)
  window.addEventListener('focus', changed)
  window.addEventListener('pageshow', changed)
  document.addEventListener('visibilitychange', visible)
  document.addEventListener('resume', changed)
  return () => {
    window.removeEventListener('storage', storage)
    window.removeEventListener(CHANGE_EVENT, local)
    window.removeEventListener('focus', changed)
    window.removeEventListener('pageshow', changed)
    document.removeEventListener('visibilitychange', visible)
    document.removeEventListener('resume', changed)
  }
}

/** Retain failed mutations in this page so confirmed upload/deletion metadata can still be exported. */
export function createDirectoryStore<T>(keyFor: (scope: string) => string, decode: (raw: string | null) => T) {
  const unsaved = new Map<string, Array<(current: T) => T>>()
  const read = (scope: string): T => {
    const stored = decode(localStorage.getItem(keyFor(scope)))
    return (unsaved.get(scope) ?? []).reduce((value, update) => update(value), stored)
  }
  const mutate = async (scope: string, update: (current: T) => T): Promise<T> =>
    withDirectoryLock(scope, () => {
      const updates = [...(unsaved.get(scope) ?? []), update]
      const raw = localStorage.getItem(keyFor(scope))
      const next = updates.reduce((value, apply) => apply(value), decode(raw))
      const serialized = JSON.stringify(next)
      if (serialized === raw && !unsaved.has(scope)) return next
      try {
        localStorage.setItem(keyFor(scope), serialized)
      } catch {
        unsaved.set(scope, updates)
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: keyFor(scope) }))
        throw new Error(DIRECTORY_SAVE_ERROR)
      }
      unsaved.delete(scope)
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: keyFor(scope) }))
      return next
    })
  return {
    read,
    mutate,
    subscribe: (scope: string, changed: () => void) => subscribeDirectory(keyFor(scope), changed),
    hasUnsaved: (scope: string) => unsaved.has(scope),
    reset: (scope: string) => unsaved.delete(scope),
  }
}
