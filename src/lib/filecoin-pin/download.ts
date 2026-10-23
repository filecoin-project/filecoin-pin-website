import type { Synapse } from '@filoz/synapse-sdk'
import { CarReader } from '@ipld/car'
import { exporter } from 'ipfs-unixfs-exporter'
import { CID } from 'multiformats/cid'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'

export async function unpackFile(carBytes: Uint8Array, rootCid: string): Promise<Blob> {
  const reader = await CarReader.fromBytes(carBytes)
  const root = CID.parse(rootCid)
  if (!(await reader.getRoots()).some((cid) => cid.equals(root)))
    throw new Error('Downloaded CAR does not contain the expected root CID')
  const entry = await exporter(rootCid, {
    get: async function* (cid) {
      const block = await reader.get(CID.parse(cid.toString()))
      if (!block) throw new Error('Missing file block in downloaded CAR')
      yield block.bytes
    },
  })
  if (entry.type !== 'file' && entry.type !== 'raw' && entry.type !== 'identity')
    throw new Error('This record is not a single file')
  const chunks: ArrayBuffer[] = []
  for await (const chunk of entry.content()) chunks.push(new Uint8Array(chunk).buffer)
  return new Blob(chunks, { type: 'application/octet-stream' })
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function downloadFile(
  synapse: Synapse,
  file: DatasetPiece,
  onStage?: (stage: 'downloading' | 'preparing') => void
) {
  if (!file.cid)
    throw new Error('The IPFS root CID is missing. Import the original directory backup to download the original file.')
  let failure: unknown
  for (const datasetId of file.datasetIds ?? [file.datasetId]) {
    try {
      const context = await synapse.storage.createContext({ dataSetId: BigInt(datasetId) })
      onStage?.('downloading')
      const bytes = await context.download({ pieceCid: file.pieceCid, withCDN: false })
      onStage?.('preparing')
      saveBlob(await unpackFile(bytes, file.cid), file.fileName)
      return
    } catch (cause) {
      failure = cause
    }
  }
  throw new Error('Unable to download the file from its storage providers. Try the IPFS gateway link in Details.', {
    cause: failure,
  })
}
