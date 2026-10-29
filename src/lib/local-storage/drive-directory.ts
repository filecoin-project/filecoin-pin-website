import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { isDeletionScheduled } from '../../utils/file-deletion.ts'

export function normalizeFolder(path: string): string {
  const parts = path.replaceAll('\\', '/').split('/').filter(Boolean)
  if (
    parts.some((part) => part === '.' || part === '..' || [...part].some((character) => character.charCodeAt(0) < 32))
  )
    throw new Error('Use folder names without dot segments or control characters.')
  return parts.join('/')
}

export function directoryFolders(files: DatasetPiece[], folders: string[]): string[] {
  const result = new Set<string>()
  for (const value of [
    ...folders,
    ...files.filter((file) => !isDeletionScheduled(file)).map((file) => file.folderPath ?? ''),
  ]) {
    const parts = normalizeFolder(value).split('/').filter(Boolean)
    for (let i = 1; i <= parts.length; i++) result.add(parts.slice(0, i).join('/'))
  }
  // Keep descendants beside their parent, even when a sibling shares its prefix.
  return [...result].sort((left, right) => {
    const a = left.split('/')
    const b = right.split('/')
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
    }
    return a.length - b.length
  })
}
