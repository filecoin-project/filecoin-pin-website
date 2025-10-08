'use client'

import {
  Upload,
  File,
  X,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Wallet,
  CreditCard,
  RefreshCw,
  Copy,
} from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  useAccount,
  useBalance,
  useReadContract,
  useChainId,
  useSwitchChain,
} from 'wagmi'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SidebarLayout } from '@/components/layout/sidebar-layout'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

const USDFC_CONTRACT_ADDRESS =
  '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0' as const

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

interface UploadedFile {
  file: File
  id: string
  type: 'regular' | 'car'
  status: 'pending' | 'validating' | 'uploading' | 'completed' | 'error'
  progress: number
  cid?: string
  rootCids?: string[]
  pieceCid?: string
  storageProvider?: string
  downloadUrl?: string
  error?: string
}

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const { address, isConnected } = useAccount()
  const [paymentSetupComplete] = useState(true)

  const chainId = useChainId()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
  const filecoinCalibrationChainId = 314159
  const isCorrectNetwork = chainId === filecoinCalibrationChainId

  // Auto-switch to Filecoin Calibration when connected to wrong network
  useEffect(() => {
    const autoSwitchNetwork = async () => {
      if (isConnected && !isCorrectNetwork && !isSwitchingChain) {
        console.log('Auto-switching to Filecoin Calibration testnet...')
        try {
          await switchChain({ chainId: filecoinCalibrationChainId })
        } catch (error: unknown) {
          console.error('Auto network switch failed:', error)
          // If auto-switch fails, user will see the manual switch UI
        }
      }
    }

    autoSwitchNetwork()
  }, [
    isConnected,
    isCorrectNetwork,
    isSwitchingChain,
    switchChain,
    filecoinCalibrationChainId,
  ])

  const {
    data: tfilBalance,
    isLoading: tfilLoading,
    error: tfilError,
    refetch: refetchTfil,
  } = useBalance({
    address: address,
  })

  const {
    data: usdfcBalance,
    isLoading: usdfcLoading,
    error: usdfcError,
    refetch: refetchUsdfc,
  } = useReadContract({
    address: USDFC_CONTRACT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })

  const hasFunds =
    (tfilBalance && parseFloat(tfilBalance.formatted) > 0) ||
    (usdfcBalance && usdfcBalance > BigInt(0))

  const getCurrentStep = () => {
    if (!isConnected) return 1
    if (!isCorrectNetwork) return 1.5
    if (!hasFunds) return 2
    if (!paymentSetupComplete) return 3
    return 4
  }

  const currentStep = getCurrentStep()

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
    } catch (error: unknown) {
      console.error('Error switching network:', error)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFilesFromEntry = async (entry: FileSystemEntry): Promise<File[]> => {
    const files: File[] = []

    if (entry.isFile) {
      return new Promise((resolve) => {
        ;(entry as FileSystemFileEntry).file((file) => {
          resolve([file])
        })
      })
    } else if (entry.isDirectory) {
      const dirReader = (entry as FileSystemDirectoryEntry).createReader()
      const entries = await new Promise<FileSystemEntry[]>((resolve) => {
        dirReader.readEntries(resolve)
      })

      for (const subEntry of entries) {
        const subFiles = await getFilesFromEntry(subEntry)
        files.push(...subFiles)
      }
    }

    return files
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      type:
        file.name.endsWith('.car') || file.type === 'application/car'
          ? 'car'
          : 'regular',
      status: 'pending',
      progress: 0,
    }))
    setFiles((prev) => [...prev, ...newFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    getFilesFromEvent: async (event) => {
      const files: File[] = []

      // Handle drag and drop events
      if ('dataTransfer' in event && event.dataTransfer) {
        if (event.dataTransfer.items) {
          // Handle folder drops
          const items = Array.from(event.dataTransfer.items)
          for (const item of items) {
            if (item.kind === 'file') {
              const entry = item.webkitGetAsEntry()
              if (entry) {
                const fileList = await getFilesFromEntry(entry)
                files.push(...fileList)
              }
            }
          }
        } else if (event.dataTransfer.files) {
          files.push(...Array.from(event.dataTransfer.files))
        }
      } else if ('target' in event && event.target && 'files' in event.target) {
        const input = event.target as HTMLInputElement
        if (input.files) {
          files.push(...Array.from(input.files))
        }
      }

      return files
    },
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'video/*': ['.mp4', '.avi', '.mov', '.wmv'],
      'audio/*': ['.mp3', '.wav', '.flac', '.aac'],
      'application/pdf': ['.pdf'],
      'text/*': ['.txt', '.md', '.json', '.csv'],
      'application/zip': ['.zip'],
      'application/x-tar': ['.tar'],
      'application/gzip': ['.gz'],
      'application/car': ['.car'],
    },
    multiple: true,
  })

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id))
  }

  const uploadFiles = async () => {
    setIsUploading(true)

    for (const fileItem of files.filter((f) => f.status === 'pending')) {
      try {
        // Set initial status based on file type
        const initialStatus =
          fileItem.type === 'car' ? 'validating' : 'uploading'
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? {
                  ...f,
                  status: initialStatus,
                  progress: fileItem.type === 'car' ? 10 : 0,
                }
              : f,
          ),
        )

        if (fileItem.type === 'car') {
          // CAR file validation step
          await new Promise((resolve) => setTimeout(resolve, 1000))

          const mockRootCids = [
            `Qm${Math.random().toString(36).substr(2, 44)}`,
            `Qm${Math.random().toString(36).substr(2, 44)}`,
          ]

          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileItem.id
                ? {
                    ...f,
                    status: 'uploading',
                    progress: 20,
                    rootCids: mockRootCids,
                  }
                : f,
            ),
          )
        }

        // Upload progress
        const startProgress = fileItem.type === 'car' ? 20 : 0
        const increment = fileItem.type === 'car' ? 20 : 10

        for (
          let progress = startProgress;
          progress <= 100;
          progress += increment
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, fileItem.type === 'car' ? 500 : 200),
          )
          setFiles((prev) =>
            prev.map((f) => (f.id === fileItem.id ? { ...f, progress } : f)),
          )
        }

        // Generate mock results based on file type
        const mockCid = `Qm${Math.random().toString(36).substr(2, 44)}`
        const mockPieceCid = `baga${Math.random().toString(36).substr(2, 44)}`

        const completedFile = {
          ...fileItem,
          status: 'completed' as const,
          progress: 100,
          cid: mockCid,
          pieceCid: mockPieceCid,
        }

        // Add CAR-specific fields
        if (fileItem.type === 'car') {
          completedFile.storageProvider = `f0${Math.floor(Math.random() * 10000)}`
          completedFile.downloadUrl = `https://api.calibration.node.glif.io/retrieve/${mockPieceCid}`
        }

        setFiles((prev) =>
          prev.map((f) => (f.id === fileItem.id ? completedFile : f)),
        )
      } catch {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? {
                  ...f,
                  status: 'error',
                  error:
                    fileItem.type === 'car' ? 'Import failed' : 'Upload failed',
                }
              : f,
          ),
        )
      }
    }

    setIsUploading(false)
  }

  // Status icon helpers
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      case 'uploading':
      case 'validating':
        return (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        )
      default:
        return <File className="h-4 w-4 text-slate-400" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Ready to upload'
      case 'validating':
        return 'Validating...'
      case 'uploading':
        return 'Uploading...'
      case 'completed':
        return 'Uploaded'
      case 'error':
        return 'Upload failed'
      default:
        return 'Unknown'
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      <SidebarLayout
        sidebar={<Sidebar />}
        header={
          <Header
            isConnected={isConnected}
            isCorrectNetwork={isCorrectNetwork}
            chainId={chainId}
          />
        }
      >
        <main className="container mx-auto px-4 py-4 sm:py-6">
          <div className="space-y-6 sm:space-y-8">
            {/* Step 1: Connect Wallet */}
            {currentStep === 1 && (
              <section>
                <div className="mb-4 text-center sm:mb-6">
                  <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                    Connect your wallet and acquire tokens as needed
                  </p>
                </div>

                <div className="mx-auto w-full max-w-2xl">
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Wallet className="h-4 w-4" />
                        Connect Wallet
                      </CardTitle>
                      <CardDescription className="text-sm">
                        Use the wallet button in the navbar to connect your
                        wallet
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Please connect your wallet using the button in the top
                          navigation bar to continue.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>
                </div>
              </section>
            )}

            {/* Step 1.5: Switch Network */}
            {currentStep === 1.5 && (
              <section>
                <div className="mb-4 text-center sm:mb-6">
                  <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                    {isSwitchingChain
                      ? 'Automatically switching to Filecoin Calibration testnet...'
                      : 'Your wallet is connected but on the wrong network. Please switch to Filecoin Calibration testnet to continue.'}
                  </p>
                </div>

                <div className="mx-auto w-full max-w-2xl">
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        {isSwitchingChain ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                            Switching Network...
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-4 w-4 text-orange-600" />
                            Network Switch Required
                          </>
                        )}
                      </CardTitle>
                      <CardDescription className="text-sm">
                        {isSwitchingChain
                          ? 'Automatically switching to Filecoin Calibration testnet'
                          : 'Switch your wallet to the Filecoin Calibration testnet'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-4">
                        <Alert
                          variant={isSwitchingChain ? 'default' : 'destructive'}
                        >
                          {isSwitchingChain ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                          ) : (
                            <AlertCircle className="h-4 w-4" />
                          )}
                          <AlertDescription>
                            {isSwitchingChain ? (
                              <>
                                <strong>Switching Networks...</strong> Please
                                confirm the network switch in your wallet popup.
                              </>
                            ) : (
                              <>
                                <strong>Wrong Network Detected!</strong>{' '}
                                You&apos;re currently connected to Chain ID:{' '}
                                {chainId}. This app requires Filecoin
                                Calibration testnet (Chain ID:{' '}
                                {filecoinCalibrationChainId}).
                              </>
                            )}
                          </AlertDescription>
                        </Alert>

                        {!isSwitchingChain && (
                          <div className="rounded-lg bg-orange-50 p-4 dark:bg-orange-950">
                            <h4 className="mb-2 font-medium text-orange-900 dark:text-orange-100">
                              How to switch networks:
                            </h4>
                            <div className="space-y-2 text-sm text-orange-800 dark:text-orange-200">
                              <p>
                                1. Click the &quot;Switch Network&quot; button
                                below
                              </p>
                              <p>
                                2. Confirm the network switch in your wallet
                              </p>
                              <p>3. Wait for the network to switch</p>
                              <p>4. Your balances will then load correctly</p>
                            </div>
                          </div>
                        )}

                        {isSwitchingChain && (
                          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950">
                            <h4 className="mb-2 font-medium text-blue-900 dark:text-blue-100">
                              Network Switch in Progress:
                            </h4>
                            <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                              <p>1. ✅ Automatic switch initiated</p>
                              <p>2. ⏳ Please confirm in your wallet popup</p>
                              <p>3. ⏳ Waiting for network switch...</p>
                              <p>4. ⏳ Balances will load automatically</p>
                            </div>
                          </div>
                        )}

                        <Button
                          onClick={handleSwitchNetwork}
                          disabled={isSwitchingChain}
                          className="w-full"
                          size="lg"
                        >
                          {isSwitchingChain ? (
                            <>
                              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              Switching Network Automatically...
                            </>
                          ) : (
                            <>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Switch to Filecoin Calibration
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </section>
            )}

            {/* Step 2: Add Funds */}
            {currentStep === 2 && (
              <section>
                <div className="mb-4 text-center sm:mb-6">
                  <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                    Filecoin Pay is the go-to payment service that can be easily
                    linked with your crypto wallet
                  </p>
                </div>

                <div className="mx-auto w-full max-w-2xl">
                  <Card>
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <CreditCard className="h-4 w-4" />
                            Demo wallet Filecoin Pay Balances
                          </CardTitle>
                          <CardDescription className="text-sm">
                            Current balances in your connected wallet
                          </CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRefreshBalances}
                          disabled={tfilLoading || usdfcLoading}
                          className="h-8 px-3"
                        >
                          <RefreshCw
                            className={`h-4 w-4 ${tfilLoading || usdfcLoading ? 'animate-spin' : ''}`}
                          />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600 dark:text-slate-400">
                            TFIL:
                          </span>
                          <span className="font-medium">
                            {tfilLoading ? (
                              <span className="text-slate-400">Loading...</span>
                            ) : tfilError ? (
                              <span className="text-red-500">
                                Error loading
                              </span>
                            ) : (
                              `${tfilBalance ? parseFloat(tfilBalance.formatted).toFixed(4) : '0.0000'} TFIL`
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600 dark:text-slate-400">
                            USDFC:
                          </span>
                          <span className="font-medium">
                            {usdfcLoading ? (
                              <span className="text-slate-400">Loading...</span>
                            ) : usdfcError ? (
                              <span className="text-red-500">
                                Error loading
                              </span>
                            ) : (
                              `${usdfcBalance ? (Number(usdfcBalance) / 1e18).toFixed(2) : '0.00'} USDFC`
                            )}
                          </span>
                        </div>
                      </div>

                      <Alert className="mt-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          You need TFIL or USDFC tokens to pay for storage. Get
                          test tokens from the faucet links in the wallet
                          dropdown.
                        </AlertDescription>
                      </Alert>

                      {/* Faucet Links */}
                      <div className="mt-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-950">
                        <h4 className="mb-3 font-medium text-blue-900 dark:text-blue-100">
                          Get Test Tokens
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <ExternalLink className="h-4 w-4 text-blue-600" />
                            <a
                              href="https://faucet.calibration.fildev.network/funds.html"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              Filecoin Calibration Faucet
                            </a>
                          </div>
                          <div className="flex items-center gap-2">
                            <ExternalLink className="h-4 w-4 text-blue-600" />
                            <a
                              href="https://docs.secured.finance/usdfc-stablecoin/getting-started#testnet-resources"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              USDFC Testnet Faucet
                            </a>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                              Your wallet address:
                            </p>
                            <div className="flex items-center gap-1">
                              <code className="rounded bg-blue-100 px-2 py-1 text-xs dark:bg-blue-900">
                                {address}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  navigator.clipboard.writeText(address || '')
                                }
                                className="h-6 w-6 p-0"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </section>
            )}

            {/* Step 3: Setup Payment */}
            {currentStep === 3 && (
              <section>
                <div className="mb-4 text-center sm:mb-6">
                  <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                    Make an initial deposit and configure storage settings
                  </p>
                </div>

                <div className="mx-auto w-full max-w-2xl">
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <CreditCard className="h-4 w-4" />
                        Payment Setup Required
                      </CardTitle>
                      <CardDescription className="text-sm">
                        Configure your payment settings to enable file storage
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Please complete the payment setup in the wallet
                          dropdown menu to continue with file uploads.
                        </AlertDescription>
                      </Alert>

                      <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
                        <h4 className="mb-2 font-medium">Current Status:</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Wallet connected</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Funds available</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-yellow-600" />
                            <span>Payment setup pending</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </section>
            )}

            {/* Step 4: File Upload (only shown when ready) */}
            {currentStep === 4 && (
              <section>
                <div className="mb-6 text-center sm:mb-8">
                  <h2 className="mb-3 text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">
                    Upload to Filecoin
                  </h2>
                  <p className="mx-auto max-w-2xl text-sm text-slate-600 sm:text-base dark:text-slate-400">
                    Upload files, folders, or CAR archives. Files will be stored
                    securely with cryptographic proofs on the Filecoin network.
                  </p>
                </div>

                <div className="mx-auto w-full max-w-4xl">
                  <Card className="flex h-full flex-col">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Upload className="h-5 w-5 text-blue-600" />
                        Upload Files & Archives
                      </CardTitle>
                      <CardDescription>
                        Drag and drop files, folders, or CAR archives, or click
                        to browse
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col">
                      <div
                        {...getRootProps()}
                        className={`flex flex-1 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200 hover:scale-[1.02] sm:p-8 ${
                          isDragActive
                            ? 'scale-[1.02] border-blue-500 bg-blue-50 dark:bg-blue-950'
                            : 'border-slate-300 hover:border-blue-400 dark:border-slate-600 dark:hover:border-blue-500'
                        }`}
                      >
                        <input {...getInputProps()} />
                        <div className="flex flex-col items-center space-y-4">
                          <div className="rounded-full bg-blue-100 p-4 dark:bg-blue-900">
                            <Upload className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                          </div>
                          {isDragActive ? (
                            <p className="text-lg font-medium text-blue-600">
                              Drop files here...
                            </p>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-lg font-medium text-slate-900 dark:text-white">
                                Drag & drop files, folders, or CAR archives here
                              </p>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                or click to browse
                              </p>
                              <div className="mt-3 flex flex-wrap justify-center gap-1">
                                <Badge variant="secondary" className="text-xs">
                                  Images
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  Videos
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  Documents
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  Folders
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  CAR Files
                                </Badge>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {files.length > 0 && (
                        <div className="mt-6">
                          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="text-base font-medium">
                              Selected Files ({files.length})
                            </h3>
                            <Button
                              onClick={uploadFiles}
                              disabled={
                                isUploading ||
                                files.every((f) => f.status !== 'pending')
                              }
                              className="flex w-full items-center gap-2 sm:w-auto"
                            >
                              <Upload className="h-4 w-4" />
                              {isUploading
                                ? 'Uploading...'
                                : 'Upload to Filecoin'}
                            </Button>
                          </div>

                          <div className="max-h-64 space-y-3 overflow-y-auto">
                            {files.map((fileItem) => (
                              <div
                                key={fileItem.id}
                                className="flex items-start gap-3 rounded-lg border p-3"
                              >
                                <div className="mt-0.5 flex-shrink-0">
                                  {getStatusIcon(fileItem.status)}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <p className="text-sm font-medium break-all text-slate-900 dark:text-white">
                                      {fileItem.file.name}
                                    </p>
                                    <Badge
                                      variant="secondary"
                                      className="w-fit"
                                    >
                                      {formatFileSize(fileItem.file.size)}
                                    </Badge>
                                    <Badge
                                      variant={
                                        fileItem.type === 'car'
                                          ? 'default'
                                          : 'secondary'
                                      }
                                      className="w-fit"
                                    >
                                      {fileItem.type === 'car'
                                        ? 'CAR Archive'
                                        : 'Regular File'}
                                    </Badge>
                                    <Badge
                                      variant={
                                        fileItem.status === 'completed'
                                          ? 'default'
                                          : fileItem.status === 'error'
                                            ? 'destructive'
                                            : 'secondary'
                                      }
                                      className="w-fit"
                                    >
                                      {getStatusText(fileItem.status)}
                                    </Badge>
                                  </div>

                                  {(fileItem.status === 'uploading' ||
                                    fileItem.status === 'validating') && (
                                    <div className="mb-2">
                                      <Progress
                                        value={fileItem.progress}
                                        className="h-2"
                                      />
                                      <p className="mt-1 text-xs text-slate-500">
                                        {fileItem.progress}%{' '}
                                        {fileItem.status === 'validating'
                                          ? 'validated'
                                          : 'uploaded'}
                                      </p>
                                    </div>
                                  )}

                                  {fileItem.status === 'completed' && (
                                    <div className="mt-2 space-y-1">
                                      <p className="text-xs break-all text-green-600 dark:text-green-400">
                                        CID: {fileItem.cid}
                                      </p>
                                      <p className="text-xs break-all text-blue-600 dark:text-blue-400">
                                        Piece CID: {fileItem.pieceCid}
                                      </p>
                                      {fileItem.type === 'car' &&
                                        fileItem.rootCids && (
                                          <div className="text-xs text-purple-600 dark:text-purple-400">
                                            <p>
                                              Root CIDs:{' '}
                                              {fileItem.rootCids.join(', ')}
                                            </p>
                                          </div>
                                        )}
                                    </div>
                                  )}

                                  {fileItem.status === 'error' && (
                                    <Alert
                                      variant="destructive"
                                      className="mt-2"
                                    >
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertDescription className="text-xs">
                                        {fileItem.error}
                                      </AlertDescription>
                                    </Alert>
                                  )}

                                  {fileItem.type === 'car' &&
                                    fileItem.status === 'completed' && (
                                      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
                                        {fileItem.storageProvider && (
                                          <Badge
                                            variant="secondary"
                                            className="w-fit"
                                          >
                                            Provider: {fileItem.storageProvider}
                                          </Badge>
                                        )}
                                        {fileItem.downloadUrl && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                              window.open(
                                                fileItem.downloadUrl,
                                                '_blank',
                                              )
                                            }
                                            className="h-6 w-fit text-xs"
                                          >
                                            <ExternalLink className="mr-1 h-3 w-3" />
                                            Download
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                </div>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFile(fileItem.id)}
                                  className="h-8 w-8 flex-shrink-0 p-0"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <Alert className="mt-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          Supports regular files, folders, and CAR archives. CAR
                          files will be validated and imported directly to
                          Filecoin storage providers.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>
                </div>
              </section>
            )}
          </div>
        </main>
      </SidebarLayout>
    </div>
  )
}
