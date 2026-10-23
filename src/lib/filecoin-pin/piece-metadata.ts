import type { Synapse } from '@filoz/synapse-sdk'
import { CID } from 'multiformats/cid'
import { parseAbiItem } from 'viem'
import { getBlockNumber, getLogs } from 'viem/actions'

const pieceAdded = parseAbiItem(
  'event PieceAdded(uint256 indexed dataSetId, uint256 indexed pieceId, (bytes data) pieceCid, string[] keys, string[] values)'
)
// GLIF limits eth_getLogs to 360 epochs. Bound recovery to eight recent days;
// an unavailable archive or missing metadata must never block the directory.
const PAGE_SIZE = 360n
const MAX_PAGES = 64
export type RecoveredPieceMetadata = { fileName?: string; cid?: string }

export async function recoverPieceMetadata(
  synapse: Synapse,
  dataSetId: bigint,
  pieceIds: bigint[],
  signal?: AbortSignal
) {
  const recovered = new Map<string, RecoveredPieceMetadata>()
  const missing = new Set(pieceIds.map(String))
  if (!missing.size) return recovered
  try {
    const deadline = Date.now() + 20_000
    let end = await getBlockNumber(synapse.readClient)
    for (let page = 0; page < MAX_PAGES && missing.size && Date.now() < deadline; page++) {
      signal?.throwIfAborted()
      const start = end >= PAGE_SIZE - 1n ? end - PAGE_SIZE + 1n : 0n
      const logs = await getLogs(synapse.readClient, {
        address: synapse.chain.contracts.fwss.address,
        event: pieceAdded,
        args: { dataSetId },
        fromBlock: start,
        toBlock: end,
        strict: true,
      })
      for (const log of [...logs].reverse()) {
        const id = String(log.args.pieceId)
        if (!missing.has(id)) continue
        const metadata = Object.fromEntries(log.args.keys.map((key, index) => [key, log.args.values[index]]))
        let cid: string | undefined
        try {
          cid = metadata.ipfsRootCID ? CID.parse(metadata.ipfsRootCID).toString() : undefined
        } catch {
          /* Ignore malformed metadata. */
        }
        recovered.set(id, {
          fileName: metadata.label || metadata.name || undefined,
          cid,
        })
        missing.delete(id)
      }
      if (start === 0n) break
      end = start - 1n
    }
  } catch (cause) {
    if (signal?.aborted) throw cause
    console.warn('[DatasetPieces] Original metadata recovery unavailable', cause)
  }
  return recovered
}
