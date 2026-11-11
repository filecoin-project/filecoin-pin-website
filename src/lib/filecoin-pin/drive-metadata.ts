import { normalizeFolder } from '../local-storage/drive-directory.ts'

export const DRIVE_METADATA_BYTES = 96
export const metadataBytes = (value: string) => new TextEncoder().encode(value).length

export function validateDriveMetadata(fileName: string, path: string) {
  if (!fileName.trim() || metadataBytes(fileName) > DRIVE_METADATA_BYTES)
    throw new Error(
      'File names, including extensions, must be 96 UTF-8 bytes or fewer. Rename the file before uploading.'
    )
  const folderPath = normalizeFolder(path)
  if (metadataBytes(folderPath) > DRIVE_METADATA_BYTES)
    throw new Error('The full folder path, including slashes, must be 96 UTF-8 bytes or fewer.')
  return folderPath
}
