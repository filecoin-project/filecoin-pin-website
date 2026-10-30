import { downloadAndValidate } from '@filoz/synapse-core/piece'
import type { Synapse } from '@filoz/synapse-sdk'
import { CarReader } from '@ipld/car'
import { exporter } from 'ipfs-unixfs-exporter'
import { CID } from 'multiformats/cid'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import { zipDirectory } from './directory.ts'
import { displayFileName } from './drive-api.ts'
import { contentReader } from './ipfs-content.ts'

export async function unpackFile(
  carBytes: Uint8Array,
  rootCid: string,
  path = '',
  directoryName?: string
): Promise<Blob> {
  const reader = await CarReader.fromBytes(carBytes)
  const root = CID.parse(rootCid)
  if (!(await reader.getRoots()).some((cid) => cid.equals(root)))
    throw new Error('Downloaded CAR does not contain the expected root CID')
  const blockstore = {
    get: async function* (cid: CID) {
      const block = await reader.get(CID.parse(cid.toString()))
      if (!block) throw new Error('Missing file block in downloaded CAR')
      yield block.bytes
    },
  }
  const resolve = (target: string) => exporter(target, blockstore)
  const entry = await resolve(`${rootCid}${path ? `/${path}` : ''}`)
  if (directoryName && entry.type === 'directory') return zipDirectory(entry, resolve, directoryName)
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
    throw new Error('The IPFS root CID is missing from this record. Use Load from Filecoin after the index catches up.')
  let failure: unknown
  if (file.directoryEntry && !file.isDirectory) {
    try {
      onStage?.('downloading')
      const entry = await contentReader(file, new AbortController().signal).entry()
      if (entry.type !== 'file' && entry.type !== 'raw' && entry.type !== 'identity')
        throw new Error('Not a single file.')
      const chunks: ArrayBuffer[] = []
      for await (const chunk of entry.content()) chunks.push(new Uint8Array(chunk).buffer)
      saveBlob(new Blob(chunks, { type: 'application/octet-stream' }), displayFileName(file))
      return
    } catch (cause) {
      failure = cause
    }
  }
  const attempts: (() => Promise<Uint8Array>)[] = []
  for (const datasetId of file.datasetIds ?? [file.datasetId]) {
    if (!datasetId) continue
    attempts.push(async () => {
      const context = await synapse.storage.createContext({ dataSetId: BigInt(datasetId) })
      return context.download({ pieceCid: file.pieceCid, withCDN: false })
    })
  }
  for (const provider of file.upload?.providers ?? []) {
    if (!provider.stored || !file.pieceCid) continue
    attempts.push(() =>
      downloadAndValidate({
        url: new URL(`/piece/${encodeURIComponent(file.pieceCid)}`, provider.serviceURL).href,
        expectedPieceCid: file.pieceCid,
      })
    )
  }
  for (const retrieve of attempts) {
    try {
      onStage?.('downloading')
      const bytes = await retrieve()
      onStage?.('preparing')
      if (file.importedCar) {
        const reader = await CarReader.fromBytes(bytes)
        if (!(await reader.getRoots()).some((cid) => cid.toString() === file.cid))
          throw new Error('Downloaded CAR does not contain the expected root CID')
        saveBlob(new Blob([new Uint8Array(bytes).buffer], { type: 'application/vnd.ipld.car' }), displayFileName(file))
      } else {
        const blob = await unpackFile(
          bytes,
          file.directoryEntry?.rootCid ?? file.cid,
          file.directoryEntry?.path ?? '',
          displayFileName(file)
        )
        saveBlob(blob, `${displayFileName(file)}${blob.type === 'application/zip' ? '.zip' : ''}`)
      }
      return
    } catch (cause) {
      failure = cause
    }
  }
  throw new Error(
    file.importedCar
      ? 'Unable to download the CAR archive from its storage providers. Try again later.'
      : 'Unable to download the file from its storage providers. Try again later.',
    {
      cause: failure,
    }
  )
}
