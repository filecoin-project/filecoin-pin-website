'use client'

import { useAccount, useConnect, useDisconnect, useBalance, useReadContract, useChainId, useSwitchChain } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Wallet, LogOut, Copy, Check, ChevronDown, Settings, CheckCircle, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { useState, useEffect } from 'react'
import { formatEther } from 'viem'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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

export function NavWallet() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const [copied, setCopied] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  
  // Network detection
  const chainId = useChainId()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
  const filecoinCalibrationChainId = 314159
  const isCorrectNetwork = chainId === filecoinCalibrationChainId
  
  // Payment setup state
  const [depositAmount, setDepositAmount] = useState('100')
  const [storageAllowance, setStorageAllowance] = useState('10TiB')
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [setupStatus, setSetupStatus] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Fetch native TFIL balance
  const { data: tfilBalance, isLoading: tfilLoading, error: tfilError, refetch: refetchTfil } = useBalance({
    address: address,
  })

  // Fetch USDFC token balance
  const { data: usdfcBalance, isLoading: usdfcLoading, error: usdfcError, refetch: refetchUsdfc } = useReadContract({
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

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const formatBalance = (balance: bigint | undefined) => {
    if (!balance) return '0.00'
    const formatted = formatEther(balance)
    return parseFloat(formatted).toFixed(2)
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy: ', err)
    }
  }

  const handlePaymentSetup = async () => {
    if (!isConnected) return
    
    setIsSettingUp(true)
    setSetupStatus('idle')
    
    try {
      await new Promise(resolve => setTimeout(resolve, 3000))
      setSetupStatus('success')
    } catch {
      setSetupStatus('error')
    } finally {
      setIsSettingUp(false)
    }
  }

  const handleRefreshBalances = async () => {
    try {
      await Promise.all([refetchTfil(), refetchUsdfc()])
    } catch (error) {
      console.error('Error refreshing balances:', error)
    }
  }

  const handleSwitchNetwork = async () => {
    try {
      await switchChain({ chainId: filecoinCalibrationChainId })
    } catch (error) {
      console.error('Error switching network:', error)
    }
  }

  if (isConnected && address && isMounted) {
    const tfilFormatted = formatBalance(tfilBalance?.value)
    const usdfcFormatted = usdfcBalance && usdfcDecimals 
      ? formatBalance(usdfcBalance)
      : '0.00'

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <Wallet className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden xs:inline">{formatAddress(address)}</span>
            <span className="xs:hidden">{address?.slice(0, 4)}...{address?.slice(-2)}</span>
            <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 sm:w-96">
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-xs sm:text-sm break-all">{formatAddress(address)}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(address)}
                className="h-6 w-6 p-0 flex-shrink-0"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
            
            {/* Network Status */}
            <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Network</span>
                {!isCorrectNetwork && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSwitchNetwork}
                    disabled={isSwitchingChain}
                    className="h-6 px-2 text-xs"
                  >
                    {isSwitchingChain ? (
                      <div className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      'Switch'
                    )}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${isCorrectNetwork ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {isCorrectNetwork ? 'Filecoin Calibration' : `Chain ID: ${chainId}`}
                </span>
              </div>
              {!isCorrectNetwork && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Switch to Filecoin Calibration (314159) to load balances
                </p>
              )}
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Balances</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshBalances}
                  disabled={tfilLoading || usdfcLoading || !isCorrectNetwork}
                  className="h-6 px-2 text-xs"
                >
                  <RefreshCw className={`h-3 w-3 ${(tfilLoading || usdfcLoading) ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-slate-600 dark:text-slate-400">TFIL:</span>
                <span className="font-medium">
                  {tfilLoading ? (
                    <span className="text-slate-400">Loading...</span>
                  ) : tfilError ? (
                    <span className="text-red-500">Error</span>
                  ) : (
                    `${tfilFormatted} TFIL`
                  )}
                </span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-slate-600 dark:text-slate-400">USDFC:</span>
                <span className="font-medium">
                  {usdfcLoading ? (
                    <span className="text-slate-400">Loading...</span>
                  ) : usdfcError ? (
                    <span className="text-red-500">Error</span>
                  ) : (
                    `${usdfcFormatted} USDFC`
                  )}
                </span>
              </div>
            </div>

            {/* Payment Setup Section */}
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="h-4 w-4 text-slate-600" />
                <span className="text-sm font-medium">Payment Setup</span>
              </div>
              
              <div className="space-y-2">
                <div>
                  <Label htmlFor="deposit" className="text-xs">USDFC Deposit</Label>
                  <div className="flex gap-1 mt-1">
                    <Input
                      id="deposit"
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="100"
                      className="h-7 text-xs"
                    />
                    <Badge variant="secondary" className="text-xs px-2 py-1">USDFC</Badge>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="storage" className="text-xs">Storage Allowance</Label>
                  <div className="flex gap-1 mt-1">
                    <Input
                      id="storage"
                      value={storageAllowance}
                      onChange={(e) => setStorageAllowance(e.target.value)}
                      placeholder="10TiB"
                      className="h-7 text-xs"
                    />
                    <Badge variant="secondary" className="text-xs px-2 py-1">Size</Badge>
                  </div>
                </div>
              </div>

              <Button 
                onClick={handlePaymentSetup} 
                disabled={isSettingUp}
                size="sm"
                className="w-full h-7 text-xs"
              >
                {isSettingUp ? (
                  <>
                    <div className="h-3 w-3 border border-white border-t-transparent rounded-full animate-spin mr-1" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <Settings className="h-3 w-3 mr-1" />
                    Setup Payments
                  </>
                )}
              </Button>

              {/* Status Messages */}
              {setupStatus === 'success' && (
                <Alert className="py-2">
                  <CheckCircle className="h-3 w-3" />
                  <AlertDescription className="text-xs">
                    Payment setup completed!
                  </AlertDescription>
                </Alert>
              )}

              {setupStatus === 'error' && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-3 w-3" />
                  <AlertDescription className="text-xs">
                    Setup failed. Check USDFC balance.
                  </AlertDescription>
                </Alert>
              )}

              {/* Help Links */}
              <div className="space-y-1">
                <a 
                  href="https://docs.secured.finance/usdfc-stablecoin/getting-started#testnet-resources" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  <ExternalLink className="h-3 w-3" />
                  Get test USDFC
                </a>
                <a 
                  href="https://docs.secured.finance/usdfc-stablecoin" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  <ExternalLink className="h-3 w-3" />
                  USDFC Docs
                </a>
              </div>
            </div>
          </div>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={() => disconnect()} className="text-red-600 text-xs sm:text-sm">
            <LogOut className="h-4 w-4 mr-2" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // Show loading state during hydration to prevent mismatch
  if (!isMounted) {
    return (
      <Button variant="outline" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm" disabled>
        <Wallet className="h-3 w-3 sm:h-4 sm:w-4" />
        <span className="hidden xs:inline">Loading...</span>
        <span className="xs:hidden">...</span>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
          <Wallet className="h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden xs:inline">Connect Wallet</span>
          <span className="xs:hidden">Connect</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 sm:w-56">
        {connectors.map((connector) => (
          <DropdownMenuItem
            key={connector.uid}
            onClick={() => connect({ connector })}
            disabled={isPending}
            className="text-xs sm:text-sm"
          >
            {connector.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
