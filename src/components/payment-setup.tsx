'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { CreditCard, Settings, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function PaymentSetup() {
  const { address, isConnected } = useAccount()
  const [depositAmount, setDepositAmount] = useState('100')
  const [storageAllowance, setStorageAllowance] = useState('10TiB')
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [setupStatus, setSetupStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const handleSetup = async () => {
    if (!isConnected) return
    
    setIsSettingUp(true)
    setSetupStatus('idle')
    
    try {
      // Simulate payment setup
      await new Promise(resolve => setTimeout(resolve, 3000))
      setSetupStatus('success')
    } catch (error) {
      setSetupStatus('error')
    } finally {
      setIsSettingUp(false)
    }
  }

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Setup Required
          </CardTitle>
          <CardDescription>
            Connect your wallet to configure Filecoin storage payments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please connect your wallet first to set up payment approvals for Filecoin storage.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="pb-4 sm:pb-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
            Configure Filecoin Payments
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Set up USDFC deposits and storage allowances for Filecoin storage deals
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* Current Status */}
          <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <h3 className="font-medium mb-3 text-sm sm:text-base">Current Status</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
              <div>
                <span className="text-slate-600 dark:text-slate-400">Wallet:</span>
                <p className="font-mono text-xs sm:text-sm">{address?.slice(0, 6)}...{address?.slice(-4)}</p>
              </div>
              <div>
                <span className="text-slate-600 dark:text-slate-400">Network:</span>
                <Badge variant="outline" className="text-xs">Filecoin Calibration</Badge>
              </div>
            </div>
          </div>

          {/* Setup Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deposit" className="text-sm sm:text-base">USDFC Deposit Amount</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="deposit"
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="100"
                  className="flex-1"
                />
                <Badge variant="secondary" className="w-fit sm:w-auto">USDFC</Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Amount to deposit for storage payments
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="storage" className="text-sm sm:text-base">Storage Allowance</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="storage"
                  value={storageAllowance}
                  onChange={(e) => setStorageAllowance(e.target.value)}
                  placeholder="10TiB"
                  className="flex-1"
                />
                <Badge variant="secondary" className="w-fit sm:w-auto">Size</Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Maximum storage capacity (e.g., "10TiB" or "5000" for USDFC/epoch)
              </p>
            </div>
          </div>

          {/* Setup Button */}
          <Button 
            onClick={handleSetup} 
            disabled={isSettingUp}
            className="w-full"
          >
            {isSettingUp ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Setting up payments...
              </>
            ) : (
              <>
                <Settings className="h-4 w-4 mr-2" />
                Setup Payment Approvals
              </>
            )}
          </Button>

          {/* Status Messages */}
          {setupStatus === 'success' && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Payment setup completed successfully! You can now store files on Filecoin.
              </AlertDescription>
            </Alert>
          )}

          {setupStatus === 'error' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Payment setup failed. Please check your USDFC balance and try again.
              </AlertDescription>
            </Alert>
          )}

          {/* Help Links */}
          <div className="pt-4 border-t">
            <h4 className="font-medium mb-2 text-sm sm:text-base">Need Help?</h4>
            <div className="space-y-2 text-xs sm:text-sm">
              <a 
                href="https://docs.secured.finance/usdfc-stablecoin/getting-started#testnet-resources" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 break-all"
              >
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                <span className="break-words">Get test USDFC from faucet</span>
              </a>
              <a 
                href="https://docs.secured.finance/usdfc-stablecoin" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 break-all"
              >
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                <span className="break-words">USDFC Documentation</span>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
