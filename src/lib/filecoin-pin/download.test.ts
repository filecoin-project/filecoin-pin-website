// @vitest-environment node
import { CarWriter } from '@ipld/car'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import { describe, expect, it } from 'vitest'
// Node selects the filesystem export; exercise the same browser builder Vite uses.
import { createCarFromFile } from '../../../node_modules/filecoin-pin/dist/core/unixfs/browser.js'
import { unpackFile } from './download.ts'

describe('original file retrieval', () => {
  it('round-trips a multi-block UnixFS CAR produced by the actual upload library', async () => {
    const bytes = Uint8Array.from({ length: 2 * 1024 * 1024 + 123 }, (_, index) => index % 251)
    const car = await createCarFromFile(new File([bytes], '研究.bin'))
    const downloaded = await unpackFile(car.carBytes, car.rootCid.toString())
    expect(Buffer.compare(Buffer.from(await downloaded.arrayBuffer()), Buffer.from(bytes))).toBe(0)
  })

  it('round-trips an empty file without downloading the CAR envelope', async () => {
    const car = await createCarFromFile(new File([], 'empty.txt'))
    const downloaded = await unpackFile(car.carBytes, car.rootCid.toString())
    expect(downloaded.size).toBe(0)
  })

  it('extracts file bytes rather than saving the CAR wrapper', async () => {
    const bytes = new TextEncoder().encode('hello Filecoin')
    const root = CID.createV1(0x55, await sha256.digest(bytes))
    const { writer, out } = CarWriter.create([root])
    const chunks: Uint8Array[] = []
    const drain = (async () => {
      for await (const chunk of out) chunks.push(chunk)
    })()
    await writer.put({ cid: root, bytes })
    await writer.close()
    await drain
    const car = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
    let offset = 0
    for (const chunk of chunks) {
      car.set(chunk, offset)
      offset += chunk.length
    }
    const file = await unpackFile(car, root.toString())
    const buffer = await file.arrayBuffer()
    expect(new Uint8Array(buffer)).toEqual(bytes)
    const otherRoot = CID.createV1(0x55, await sha256.digest(new Uint8Array([9])))
    await expect(unpackFile(car, otherRoot.toString())).rejects.toThrow('expected root CID')
  })
})
