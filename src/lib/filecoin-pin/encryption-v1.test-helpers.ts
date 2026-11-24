/**
 * Test-only: issue credentials and write envelopes the way keysmith 0.1.0
 * (format 1) did. Drive no longer writes this format, so tests of the legacy
 * read path make their own fixtures here.
 */
import { encodeGrant, keyspaceKeys, newSalt, pieceKey, pieceMetadata, publicKeyOf, wrapTo } from '@filoz/keysmith-v1'
import * as fee from 'filecoin-encryption-envelope'
import { base64 } from 'multiformats/bases/base64'
import type { Address, Hex } from 'viem'
import { CAR_CONTENT_TYPE, defaultGroupKeyId, type EncryptionCredential, type OwnerSigner } from './encryption.ts'
import { readStreamBytes } from './read-stream.ts'

/** A format 1 credential and the group key it wraps, for encrypting fixtures. */
export async function issueLegacyCredential(signer: OwnerSigner, sessionPrivateKey: Hex) {
  const groupKeyId = defaultGroupKeyId(signer.address)
  const keys = await keyspaceKeys(signer as never, { owner: signer.address, keyspace: groupKeyId })
  const grant = await wrapTo(publicKeyOf(sessionPrivateKey), keys.kk, keys.descriptor)
  const credential: EncryptionCredential = {
    grant: base64.baseEncode(encodeGrant(grant)),
    groupKeyId,
    commitment: keys.commitment,
    owner: signer.address.toLowerCase() as Address,
  }
  return { credential, groupKey: keys.kk }
}

/** One format 1 envelope (`foc/v` 1, `foc/ks`) around `innerCar`. */
export async function encryptLegacyCar(
  groupKey: Uint8Array,
  credential: EncryptionCredential,
  innerCar: Uint8Array
): Promise<Uint8Array> {
  const salt = newSalt()
  const appMetadata = pieceMetadata({ owner: credential.owner, keyspace: credential.groupKeyId }, { salt })
  return readStreamBytes(
    new Blob([innerCar as BlobPart]).stream().pipeThrough(
      fee.encrypt({
        cek: pieceKey(groupKey, salt),
        appMetadata,
        contentLength: innerCar.byteLength,
        contentType: CAR_CONTENT_TYPE,
      })
    )
  )
}
