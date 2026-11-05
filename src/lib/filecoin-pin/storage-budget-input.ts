type BudgetInput = string | number

/** Convert decimal text (including exponent notation) without Number rounding. */
function decimalUnits(input: BudgetInput, unit: bigint, roundUp: boolean): bigint {
  const match = /^\+?(\d*\.?\d+)(?:e([+-]?\d+))?$/i.exec(String(input).trim())
  if (!match) throw new Error('Invalid number')
  const [whole, fraction = ''] = match[1].split('.')
  const coefficient = BigInt(`${whole}${fraction}`)
  if (coefficient <= 0n) throw new Error('Expected a positive number')
  const scale = BigInt(fraction.length) - BigInt(match[2] ?? '0')
  const numerator = coefficient * unit
  if (scale <= 0n) return numerator * 10n ** -scale
  // Tiny positive capacities still require one byte; avoid constructing huge denominators.
  if (scale > BigInt(numerator.toString().length)) {
    if (roundUp) return 1n
    throw new Error('Expected a whole number')
  }
  const divisor = 10n ** scale
  const remainder = numerator % divisor
  if (!roundUp && remainder !== 0n) throw new Error('Expected a whole number')
  return numerator / divisor + (roundUp && remainder !== 0n ? 1n : 0n)
}

export function storageBudgetBytes(capacityGiB: BudgetInput): bigint {
  return decimalUnits(capacityGiB, 1024n ** 3n, true)
}

export function storageBudgetEpochs(days: BudgetInput): bigint {
  return decimalUnits(days, 1n, false) * 2880n
}

export function storageBudgetInputError(capacityGiB: BudgetInput, days: BudgetInput): string | undefined {
  try {
    storageBudgetBytes(capacityGiB)
  } catch {
    return 'Enter a storage amount greater than 0.'
  }
  try {
    storageBudgetEpochs(days)
  } catch {
    return 'Enter a whole number of days greater than 0.'
  }
  return undefined
}
