'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Wallet, LogOut, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { BalanceDisplay } from './balance-display'

export function WalletButton() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const [copied, setCopied] = useState(false)

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
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

  if (isConnected && address) {
    return (
      <div className="w-full max-w-4xl space-y-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Wallet Connected
            </CardTitle>
            <CardDescription>
              Your wallet is successfully connected
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="font-mono text-sm">{formatAddress(address)}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(address)}
                className="h-8 w-8 p-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={() => disconnect()}
              className="w-full"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Disconnect
            </Button>
          </CardContent>
        </Card>

        {/* Balance Display */}
        <BalanceDisplay />
      </div>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Connect Wallet
        </CardTitle>
        <CardDescription>
          Connect your wallet to get started with Filecoin Pin
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {connectors.map((connector) => (
          <Button
            key={connector.uid}
            onClick={() => connect({ connector })}
            disabled={isPending}
            className="w-full justify-start"
            variant="outline"
          >
            {connector.name}
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}
