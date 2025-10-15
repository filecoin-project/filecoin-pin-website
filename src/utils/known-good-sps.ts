/**
 * Temporary allowlist of storage providers that have proven reliable during launch.
 * This exists to paper over early stability issues while the wider provider ecosystem
 * catches up. Remove once automatic provider discovery is trustworthy again.
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
