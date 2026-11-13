/**
 * Build the plaintext payload of an encrypted upload in the browser: the
 * metadata-first UnixFS CAR, under an anonymous wrapper directory, that
 * filecoin-pin's `get`, `get --share` and the share viewer unpack. The DAG
 * comes from the same builder plain uploads use (identical CIDs); this module
 * adds the wrapper and re-emits the blocks in the profile's order.
 */
import { CarReader } from '@ipld/car'
import * as dagPb from '@ipld/dag-pb'
import { createCarFromFile, createCarFromFileList } from 'filecoin-pin/core/unixfs'
import { UnixFS } from 'ipfs-unixfs'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import { type BlockSource, DAG_PB_CODEC, encodeVarint, isUnsafeName, layout, RAW_CODEC } from './unixfs-car-layout.ts'
export type PayloadInput =
  | { kind: 'file'; file: File }
  | { kind: 'directory'; files: File[]; name: string }
  | { kind: 'car'; carBytes: Uint8Array; name: string }

export interface EncryptedPayload {
  carBytes: Uint8Array
  /** The wrapper directory's CID: the inner CAR's root, deterministic for identical input. */
  rootCid: string
}

/** A named wrapper entry, or undefined for a legacy root layout. Malformed blocks still throw. */
export async function payloadEntry(reader: CarReader): Promise<{ name: string; cid: CID } | undefined> {
  const roots = await reader.getRoots()
  const root = roots[0]
  if (!root) throw new Error('The decrypted content is missing its root CID.')
  for (const cid of roots)
    if (!(await reader.has(cid))) throw new Error('The decrypted content is missing its root block.')
  // Legacy CARs can contain multiple roots or a raw file at the root.
  if (roots.length !== 1 || root.code !== DAG_PB_CODEC) return undefined
  const block = await reader.get(root)
  if (!block) throw new Error('The decrypted content is missing its root block.')
  const node = dagPb.decode(block.bytes)
  if (!node.Data || UnixFS.unmarshal(node.Data).type !== 'directory') return undefined
  const link = node.Links[0]
  // Ordinary legacy directories need not have the profile's single named entry.
  if (node.Links.length !== 1 || !link?.Name) return undefined
  if (isUnsafeName(link.Name)) throw new Error('The decrypted content has an unsafe entry name.')
  if (!(await reader.has(link.Hash))) throw new Error('The decrypted content is missing its named entry block.')
  return { name: link.Name, cid: link.Hash }
}

/** Total subtree size (dag-pb Tsize convention): own block plus every child's Tsize. */
function subtreeSize(rootBytes: Uint8Array, root: CID): number {
  if (root.code === RAW_CODEC) return rootBytes.length
  const node = dagPb.decode(rootBytes)
  return node.Links.reduce((sum, link) => sum + Number(link.Tsize ?? 0), rootBytes.length)
}

export async function buildEncryptedPayload(input: PayloadInput): Promise<EncryptedPayload> {
  if (input.kind === 'car') {
    // `createCarFromFile` deliberately refuses CAR inputs (plain uploads must
    // import them); the payload wants the archive as an ordinary named file,
    // so build its file DAG directly under the same unixfs-v1-2025 profile.
    const { root, blocks } = await fileDagFromBytes(input.carBytes)
    return wrapBlocks(blocks, root, input.name)
  }
  const entryName = input.kind === 'file' ? input.file.name : input.name
  const base = input.kind === 'file' ? await createCarFromFile(input.file) : await createCarFromFileList(input.files)
  return wrapCarPayload(base, entryName)
}

/** 1 MiB raw-leaf chunks, CIDv1 — the unixfs-v1-2025 profile plain uploads use. */
const CHUNK_SIZE = 1024 * 1024

async function fileDagFromBytes(bytes: Uint8Array): Promise<{ root: CID; blocks: Map<string, BlockSource> }> {
  const blocks = new Map<string, BlockSource>()
  const leaves: { cid: CID; size: number }[] = []
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const slice = bytes.subarray(offset, Math.min(offset + CHUNK_SIZE, bytes.length))
    const cid = CID.createV1(RAW_CODEC, await sha256.digest(slice))
    if (!blocks.has(cid.toString())) blocks.set(cid.toString(), { bytes: slice })
    leaves.push({ cid, size: slice.length })
  }
  const first = leaves[0]
  if (leaves.length === 1 && first) return { root: first.cid, blocks }
  const node = dagPb.encode(
    dagPb.prepare({
      Data: new UnixFS({ type: 'file', blockSizes: leaves.map((leaf) => BigInt(leaf.size)) }).marshal(),
      Links: leaves.map((leaf) => ({ Hash: leaf.cid, Tsize: leaf.size })),
    })
  )
  const root = CID.createV1(DAG_PB_CODEC, await sha256.digest(node))
  blocks.set(root.toString(), { bytes: node })
  return { root, blocks }
}

/**
 * Wrap an already-built UnixFS CAR (the same one a plain upload would send)
 * into the encrypted-payload profile under `entryName`.
 */
export async function wrapCarPayload(
  base: { carBytes: Uint8Array; rootCid: { toString(): string } },
  entryName: string
): Promise<EncryptedPayload> {
  const reader = await CarReader.fromBytes(base.carBytes)
  const baseRoot = CID.parse(base.rootCid.toString())
  const blocks = new Map<string, BlockSource>()
  for await (const block of reader.blocks()) blocks.set(block.cid.toString(), { bytes: block.bytes })
  return wrapBlocks(blocks, baseRoot, entryName)
}

async function wrapBlocks(
  blocks: Map<string, BlockSource>,
  baseRoot: CID,
  entryName: string
): Promise<EncryptedPayload> {
  if (isUnsafeName(entryName)) throw new Error(`The name ${JSON.stringify(entryName)} is unsafe to restore; rename it.`)
  const rootBlock = blocks.get(baseRoot.toString())
  if (!rootBlock) throw new Error('The packed content is missing its root block.')

  // Wrapper: an anonymous UnixFS directory holding exactly one named entry.
  const wrapperNode = dagPb.encode(
    dagPb.prepare({
      Data: new UnixFS({ type: 'directory' }).marshal(),
      Links: [{ Name: entryName, Hash: baseRoot, Tsize: subtreeSize(rootBlock.bytes, baseRoot) }],
    })
  )
  const wrapperCid = CID.createV1(DAG_PB_CODEC, await sha256.digest(wrapperNode))
  blocks.set(wrapperCid.toString(), { bytes: wrapperNode })

  // The layout names every block in profile order; emit exactly that.
  const plan = layout(wrapperCid, blocks)
  const out = new Uint8Array(plan.total)
  out.set(plan.header, 0)
  let pos = plan.header.length
  const writeSection = (cid: CID, bytes: Uint8Array) => {
    const prefix = encodeVarint(cid.bytes.length + bytes.length)
    out.set(prefix, pos)
    pos += prefix.length
    out.set(cid.bytes, pos)
    pos += cid.bytes.length
    out.set(bytes, pos)
    pos += bytes.length
  }
  for (const placement of [...plan.metadata, ...plan.leaves]) {
    const block = blocks.get(placement.cid.toString())
    if (!block) throw new Error(`The packed content is missing block ${placement.cid.toString()}.`)
    writeSection(placement.cid, block.bytes)
  }
  if (pos !== plan.total) throw new Error('The packed content does not match its computed layout.')
  return { carBytes: out, rootCid: wrapperCid.toString() }
}
