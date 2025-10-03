'use client'

import { useAccount, useBalance, useReadContract } from 'wagmi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Coins, DollarSign } from 'lucide-react'
import { formatEther } from 'viem'

const USDFC_CONTRACT_ADDRESS = '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0' as const

// ERC20 ABI for balanceOf function
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export function BalanceDisplay() {
  const { address, isConnected } = useAccount()
  
  // Fetch native TFIL balance
  const { data: tfilBalance, isLoading: tfilLoading } = useBalance({
    address: address,
  })

  // Fetch USDFC token balance
  const { data: usdfcBalance, isLoading: usdfcBalanceLoading } = useReadContract({
    address: USDFC_CONTRACT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })


  // Fetch USDFC token symbol
  const { data: usdfcSymbol } = useReadContract({
    address: USDFC_CONTRACT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'symbol',
    query: {
      enabled: !!address,
    },
  })

  if (!isConnected || !address) {
    return null
  }

  const formatBalance = (balance: bigint | undefined) => {
    if (!balance) return '0.00'
    const formatted = formatEther(balance)
    return parseFloat(formatted).toFixed(4)
  }

  const usdfcFormattedBalance = usdfcBalance 
    ? formatBalance(usdfcBalance)
    : '0.00'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
      {/* TFIL Balance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Coins className="h-5 w-5 text-blue-600" />
            TFIL Balance
          </CardTitle>
          <CardDescription>
            Native Filecoin Testnet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {tfilLoading ? (
              <div className="animate-pulse bg-slate-200 dark:bg-slate-700 h-8 w-24 rounded"></div>
            ) : (
              `${formatBalance(tfilBalance?.value)} ${tfilBalance?.symbol || 'TFIL'}`
            )}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {tfilBalance?.formatted || '0.00'} TFIL
          </div>
        </CardContent>
      </Card>

      {/* USDFC Balance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5 text-green-600" />
            USDFC Balance
          </CardTitle>
          <CardDescription>
            USD Filecoin Token
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {usdfcBalanceLoading ? (
              <div className="animate-pulse bg-slate-200 dark:bg-slate-700 h-8 w-24 rounded"></div>
            ) : (
              `${usdfcFormattedBalance} ${usdfcSymbol || 'USDFC'}`
            )}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Contract: {USDFC_CONTRACT_ADDRESS.slice(0, 6)}...{USDFC_CONTRACT_ADDRESS.slice(-4)}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
