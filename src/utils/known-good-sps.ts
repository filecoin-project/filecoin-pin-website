/**
 * List of known good storage providers (SPs) that are verified and reliable
 */
export const KNOWN_GOOD_SPS = [2, 8, 16] as const

/**
 * Randomly select a storage provider from the known good SPs list
 * @returns A randomly selected storage provider ID
 */
export function selectRandomSP(): number {
  const randomIndex = Math.floor(Math.random() * KNOWN_GOOD_SPS.length)
  return KNOWN_GOOD_SPS[randomIndex]
}
