import { MAX_FILE_SIZE } from '../../constants/files.ts'
import { normalizeFolder } from '../local-storage/drive-directory.ts'

export type DirectoryUpload = { kind: 'directory'; name: string; size: number; files: File[] }
export type UploadSource = File | DirectoryUpload
export const isDirectoryUpload = (source: UploadSource): source is DirectoryUpload =>
  'kind' in source && source.kind === 'directory'

/** Preserve the browser's relative paths; all files must belong to one selected root. */
export function directoryUpload(files: File[]): DirectoryUpload {
  if (!files.length)
    throw new Error(
      'Select a folder containing at least one file. Empty folders are not available from the browser picker.'
    )
  const paths = new Set<string>()
  let name = ''
  let size = 0
  for (const file of files) {
    const path = file.webkitRelativePath
    if (!path || normalizeFolder(path) !== path || path.includes('\\') || path.split('/').length < 2)
      throw new Error('Select a folder with valid relative file paths.')
    const root = path.split('/')[0]
    name ||= root
    if (root !== name || paths.has(path)) throw new Error('Select one folder without duplicate file paths.')
    paths.add(path)
    size += file.size
    if (size > MAX_FILE_SIZE) throw new Error('The selected folder must total 200 MB or less.')
  }
  return { kind: 'directory', name, size, files }
}
