import { CarReader } from '@ipld/car'
import { isCar } from 'filecoin-pin/core/car'
import { type CreateCarOptions, createCarFromFile } from 'filecoin-pin/core/unixfs'

/** Import archives unchanged; ordinary files retain the existing UnixFS encoding. */
export async function prepareUploadInput(file: File, options: CreateCarOptions = {}) {
  if (!(await isCar(file.stream()))) {
    return { ...(await createCarFromFile(file, options)), importedCar: false }
  }
  const carBytes = new Uint8Array(await file.arrayBuffer())
  const reader = await CarReader.fromBytes(carBytes)
  const roots = await reader.getRoots()
  const rootCid = roots[0]
  if (!rootCid) throw new Error('The CAR archive needs at least one root CID for Drive to track and retrieve it.')
  // Validate the block framing and declared roots before any funding or storage request.
  for (const root of roots)
    if (!(await reader.has(root))) throw new Error(`The CAR archive is missing its root block: ${root}`)
  options.onProgress?.(file.size, file.size)
  return { carBytes, rootCid, importedCar: true }
}
