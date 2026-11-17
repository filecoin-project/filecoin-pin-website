/**
 * One-time whole-wallet scan for the group key this owner already encrypts
 * under, mirroring the scan half of filecoin-pin's `ownerGroupKey` so Drive and
 * the CLI land on the same key. Runs once at setup, never per upload.
 */
import type { Synapse } from '@filoz/synapse-sdk'
import { listDataSets } from 'filecoin-pin/core/data-set'
import { getClientAddress } from 'filecoin-pin/core/synapse'
import { defaultGroupKeyId, GROUP_KEY_ID_KEY, type GroupKeyRecord, oldestValidGroupKey } from './encryption.ts'

/**
 * The group key recorded on the owner's live data sets (oldest valid wins), or
 * undefined when none is recorded and the caller should mint the owner's
 * default group key.
 *
 * @throws When no valid group key is recorded but data sets already use the
 * owner's default group key id with conflicting records: issuing a credential
 * for it would grow a group no single key can fully read, so this is a hard
 * stop, never a guess.
 */
export async function scanGroupKey(synapse: Synapse): Promise<GroupKeyRecord | undefined> {
  const tagged = await listDataSets(synapse, {
    filter: (dataSet) => dataSet.isLive && typeof dataSet.metadata?.[GROUP_KEY_ID_KEY] === 'string',
  })
  const recorded = oldestValidGroupKey(tagged)
  if (recorded == null) {
    const defaultId = defaultGroupKeyId(getClientAddress(synapse))
    const invalid = tagged.filter((dataSet) => dataSet.metadata?.[GROUP_KEY_ID_KEY] === defaultId)
    if (invalid.length > 0) {
      throw new Error(
        `Your default group key ${defaultId} is already used by data sets ` +
          `${invalid.map((dataSet) => dataSet.dataSetId).join(', ')}, but their encryption records conflict. ` +
          'No key was added, so no file can become unreadable. Contact support before encrypting with this wallet.'
      )
    }
  }
  return recorded
}
