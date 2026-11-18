import { normalizeFolder } from '../local-storage/drive-directory.ts'

export const DRIVE_METADATA_BYTES = 96
export const metadataBytes = (value: string) => new TextEncoder().encode(value).length

/** A trailing slash marks an uploaded directory without consuming a fourth piece-metadata key. */
export function driveMetadataLabel(fileName: string, isDirectory = false) {
  return isDirectory ? `${fileName}/` : fileName
}

export function parseDriveLabel(label: string): { fileName: string; isDirectory?: true } {
  if (label.endsWith('/')) {
    const name = label.slice(0, -1)
    if (
      name.trim() &&
      name !== '.' &&
      name !== '..' &&
      !name.includes('/') &&
      !name.includes('\\') &&
      !name.includes('\0')
    )
      return { fileName: name, isDirectory: true }
  }
  return { fileName: label }
}

export function validateDriveMetadata(fileName: string, path: string, isDirectory = false) {
  if (isDirectory && metadataBytes(driveMetadataLabel(fileName, true)) > DRIVE_METADATA_BYTES)
    throw new Error('Uploaded folder names must be 95 UTF-8 bytes or fewer. Rename the folder before uploading.')
  if (!fileName.trim() || metadataBytes(fileName) > DRIVE_METADATA_BYTES)
    throw new Error(
      'File names, including extensions, must be 96 UTF-8 bytes or fewer. Rename the file before uploading.'
    )
  const folderPath = normalizeFolder(path)
  if (metadataBytes(folderPath) > DRIVE_METADATA_BYTES)
    throw new Error('The full folder path, including slashes, must be 96 UTF-8 bytes or fewer.')
  return folderPath
}
