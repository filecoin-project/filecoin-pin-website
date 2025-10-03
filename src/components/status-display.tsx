'use client'

import { useAccount, useBalance, useReadContract } from 'wagmi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Wallet, 
  CreditCard, 
  HardDrive, 
  Activity, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  RefreshCw
} from 'lucide-react'
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
] as const

export function StatusDisplay() {
  const { address, isConnected } = useAccount()
  
  // Fetch native TFIL balance
  const { data: tfilBalance, refetch: refetchTfil } = useBalance({
    address: address,
  })

  // Fetch USDFC token balance
  const { data: usdfcBalance, refetch: refetchUsdfc } = useReadContract({
    address: USDFC_CONTRACT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })

  // Fetch USDFC token decimals
  const { data: usdfcDecimals } = useReadContract({
    address: USDFC_CONTRACT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: {
      enabled: !!address,
    },
  })

  const formatBalance = (balance: bigint | undefined, _decimals: number = 18) => {
    if (!balance) return '0.00'
    const formatted = formatEther(balance)
    return parseFloat(formatted).toFixed(4)
  }

  const usdfcFormattedBalance = usdfcBalance && usdfcDecimals 
    ? formatBalance(usdfcBalance, usdfcDecimals)
    : '0.00'

  const handleRefresh = () => {
    refetchTfil()
    refetchUsdfc()
  }

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Status
          </CardTitle>
          <CardDescription>
            Connect your wallet to view storage and payment status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Wallet className="h-12 w-12 mx-auto mb-4 text-slate-400" />
            <p className="text-slate-600 dark:text-slate-400">
              Please connect your wallet to view status information
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Mock data for demonstration
  const mockStorageDeals = [
    {
      id: 'deal-001',
      cid: 'QmXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXx',
      status: 'active',
      size: '2.5 GB',
      provider: 'f01234',
      duration: '365 days',
      cost: '0.5 USDFC'
    },
    {
      id: 'deal-002',
      cid: 'QmYyYyYyYyYyYyYyYyYyYyYyYyYyYyYyYyYyYyYyYyYyYyYyYyYyYyYy',
      status: 'pending',
      size: '1.2 GB',
      provider: 'f05678',
      duration: '180 days',
      cost: '0.3 USDFC'
    }
  ]

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return <Activity className="h-4 w-4 text-slate-400" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Active</Badge>
      case 'pending':
        return <Badge variant="default" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Pending</Badge>
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>
      default:
        return <Badge variant="secondary">Unknown</Badge>
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Balance Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
              TFIL Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              {formatBalance(tfilBalance?.value)} TFIL
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Native Filecoin
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
              USDFC Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              {usdfcFormattedBalance} USDFC
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Storage Payments
            </p>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <HardDrive className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
              Storage Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              3.7 GB
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Across {mockStorageDeals.length} deals
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Storage Deals */}
      <Card>
        <CardHeader className="pb-4 sm:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
                Storage Deals
              </CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Active and pending storage deals on Filecoin
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="w-full sm:w-auto">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 sm:space-y-4">
            {mockStorageDeals.map((deal) => (
              <div key={deal.id} className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg">
                <div className="flex-shrink-0 mt-0.5">
                  {getStatusIcon(deal.status)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-white break-all">
                      {deal.cid.slice(0, 20)}...
                    </p>
                    {getStatusBadge(deal.status)}
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <div>
                      <span className="font-medium">Size:</span> {deal.size}
                    </div>
                    <div>
                      <span className="font-medium">Provider:</span> {deal.provider}
                    </div>
                    <div>
                      <span className="font-medium">Duration:</span> {deal.duration}
                    </div>
                    <div>
                      <span className="font-medium">Cost:</span> {deal.cost}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Payment Status */}
      <Card>
        <CardHeader className="pb-4 sm:pb-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <CreditCard className="h-4 w-4 sm:h-5 sm:w-5" />
            Payment Configuration
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Current payment setup and allowances
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-3">
              <h4 className="font-medium text-sm sm:text-base">Deposit Status</h4>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-xs sm:text-sm">Deposit configured: 100 USDFC</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-xs sm:text-sm">Auto-renewal enabled</span>
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium text-sm sm:text-base">Storage Allowance</h4>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-xs sm:text-sm">Allowance: 10 TiB</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-xs sm:text-sm">Provider selection: Auto</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
