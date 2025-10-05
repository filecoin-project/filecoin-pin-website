'use client'

import { NavWallet } from "@/components/nav-wallet";
import { Upload, FileArchive, File, X, CheckCircle, AlertCircle, ExternalLink, Wallet, CreditCard, RefreshCw, Copy } from "lucide-react";
import { useState, useCallback } from "react";
import { useDropzone } from 'react-dropzone';
import { useAccount, useBalance, useReadContract, useChainId, useSwitchChain } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';

const USDFC_CONTRACT_ADDRESS = '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0' as const

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
  status: 'pending' | 'uploading' | 'completed' | 'error'
  progress: number
  cid?: string
  pieceCid?: string
  error?: string
}

interface CarFile {
  file: File
  id: string
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
  const [carFiles, setCarFiles] = useState<CarFile[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const { address, isConnected } = useAccount()
  const [paymentSetupComplete] = useState(true)

  const chainId = useChainId()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
  const filecoinCalibrationChainId = 314159
  const isCorrectNetwork = chainId === filecoinCalibrationChainId

  const { data: tfilBalance, isLoading: tfilLoading, error: tfilError, refetch: refetchTfil } = useBalance({
    address: address,
  })

  const { data: usdfcBalance, isLoading: usdfcLoading, error: usdfcError, refetch: refetchUsdfc } = useReadContract({
    address: USDFC_CONTRACT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })

  const hasFunds = tfilBalance && parseFloat(tfilBalance.formatted) > 0 || 
                   usdfcBalance && usdfcBalance > BigInt(0)

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
    } catch (error) {
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
        (entry as FileSystemFileEntry).file((file) => {
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
    const newFiles: UploadedFile[] = acceptedFiles.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: 'pending',
      progress: 0
    }))
    setFiles(prev => [...prev, ...newFiles])
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
      }
      else if ('target' in event && event.target && 'files' in event.target) {
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
      'application/gzip': ['.gz']
    },
    multiple: true
  })

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(file => file.id !== id))
  }

  const uploadFiles = async () => {
    setIsUploading(true)
    
    for (const fileItem of files.filter(f => f.status === 'pending')) {
      try {
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { ...f, status: 'uploading', progress: 0 } : f
        ))

        for (let progress = 0; progress <= 100; progress += 10) {
          await new Promise(resolve => setTimeout(resolve, 200))
          setFiles(prev => prev.map(f => 
            f.id === fileItem.id ? { ...f, progress } : f
          ))
        }

        const mockCid = `Qm${Math.random().toString(36).substr(2, 44)}`
        const mockPieceCid = `baga${Math.random().toString(36).substr(2, 44)}`
        
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { 
            ...f, 
            status: 'completed', 
            progress: 100,
            cid: mockCid,
            pieceCid: mockPieceCid
          } : f
        ))
      } catch {
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { 
            ...f, 
            status: 'error', 
            error: 'Upload failed'
          } : f
        ))
      }
    }
    
    setIsUploading(false)
  }

  // CAR import handlers
  const onCarDrop = useCallback((acceptedFiles: File[]) => {
    const carFiles = acceptedFiles.filter(file => 
      file.name.endsWith('.car') || file.type === 'application/car'
    )
    
    const newFiles: CarFile[] = carFiles.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: 'pending',
      progress: 0
    }))
    setCarFiles(prev => [...prev, ...newFiles])
  }, [])

  const { getRootProps: getCarRootProps, getInputProps: getCarInputProps, isDragActive: isCarDragActive } = useDropzone({
    onDrop: onCarDrop,
    accept: {
      'application/car': ['.car']
    },
    multiple: true
  })

  const removeCarFile = (id: string) => {
    setCarFiles(prev => prev.filter(file => file.id !== id))
  }

  const importCarFiles = async () => {
    setIsImporting(true)
    
    for (const fileItem of carFiles.filter(f => f.status === 'pending')) {
      try {
        setCarFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { ...f, status: 'validating', progress: 10 } : f
        ))

        await new Promise(resolve => setTimeout(resolve, 1000))

        const mockRootCids = [
          `Qm${Math.random().toString(36).substr(2, 44)}`,
          `Qm${Math.random().toString(36).substr(2, 44)}`
        ]

        setCarFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { 
            ...f, 
            status: 'uploading', 
            progress: 20,
            rootCids: mockRootCids
          } : f
        ))

        for (let progress = 20; progress <= 100; progress += 20) {
          await new Promise(resolve => setTimeout(resolve, 500))
          setCarFiles(prev => prev.map(f => 
            f.id === fileItem.id ? { ...f, progress } : f
          ))
        }

        const mockPieceCid = `baga${Math.random().toString(36).substr(2, 44)}`
        const mockStorageProvider = `f0${Math.floor(Math.random() * 10000)}`
        const mockDownloadUrl = `https://api.calibration.node.glif.io/retrieve/${mockPieceCid}`
        
        setCarFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { 
            ...f, 
            status: 'completed', 
            progress: 100,
            pieceCid: mockPieceCid,
            storageProvider: mockStorageProvider,
            downloadUrl: mockDownloadUrl
          } : f
        ))
      } catch {
        setCarFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { 
            ...f, 
            status: 'error', 
            error: 'Import failed'
          } : f
        ))
      }
    }
    
    setIsImporting(false)
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
        return <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      default:
        return <File className="h-4 w-4 text-slate-400" />
    }
  }


  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Ready to upload'
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Upload className="w-5 h-5 text-white" />
              </div>
              <div>
              <span className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Filecoin Pin
              </span>
                <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
                  Pin and share files on Filecoin
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4 sm:space-x-6">
              {/* Network Status Indicator */}
              {isConnected && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={`h-2 w-2 rounded-full ${isCorrectNetwork ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {isCorrectNetwork ? 'Filecoin Calibration' : `Chain ${chainId}`}
                  </span>
                </div>
              )}
              <NavWallet />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4 sm:py-6">
        <div className="space-y-6 sm:space-y-8">

          {/* Step 1: Connect Wallet */}
          {currentStep === 1 && (
            <section>
              <div className="text-center mb-4 sm:mb-6">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Connect your wallet and acquire tokens as needed
                </p>
              </div>

              <div className="w-full max-w-2xl mx-auto">
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Wallet className="h-4 w-4" />
                      Connect Wallet
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Use the wallet button in the navbar to connect your wallet
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Please connect your wallet using the button in the top navigation bar to continue.
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
              <div className="text-center mb-4 sm:mb-6">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Your wallet is connected but on the wrong network. Please switch to Filecoin Calibration testnet to continue.
                </p>
              </div>
              
              <div className="w-full max-w-2xl mx-auto">
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <AlertCircle className="h-4 w-4 text-orange-600" />
                      Network Switch Required
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Switch your wallet to the Filecoin Calibration testnet
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-4">
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Wrong Network Detected!</strong> You&apos;re currently connected to Chain ID: {chainId}. 
                          This app requires Filecoin Calibration testnet (Chain ID: {filecoinCalibrationChainId}).
                        </AlertDescription>
                      </Alert>
                      
                      <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                        <h4 className="font-medium mb-2 text-orange-900 dark:text-orange-100">How to switch networks:</h4>
                        <div className="space-y-2 text-sm text-orange-800 dark:text-orange-200">
                          <p>1. Click the &quot;Switch Network&quot; button below</p>
                          <p>2. Confirm the network switch in your wallet</p>
                          <p>3. Wait for the network to switch</p>
                          <p>4. Your balances will then load correctly</p>
          </div>
        </div>

                      <Button 
                        onClick={handleSwitchNetwork}
                        disabled={isSwitchingChain}
                        className="w-full"
                        size="lg"
                      >
                        {isSwitchingChain ? (
                          <>
                            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                            Switching Network...
                          </>
                        ) : (
                          <>
                            <ExternalLink className="h-4 w-4 mr-2" />
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
              <div className="text-center mb-4 sm:mb-6">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Filecoin Pay is the go-to payment service that can be easily linked with your crypto wallet
                </p>
              </div>
              
              <div className="w-full max-w-2xl mx-auto">
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
                        <RefreshCw className={`h-4 w-4 ${(tfilLoading || usdfcLoading) ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 dark:text-slate-400">TFIL:</span>
                        <span className="font-medium">
                          {tfilLoading ? (
                            <span className="text-slate-400">Loading...</span>
                          ) : tfilError ? (
                            <span className="text-red-500">Error loading</span>
                          ) : (
                            `${tfilBalance ? parseFloat(tfilBalance.formatted).toFixed(4) : '0.0000'} TFIL`
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 dark:text-slate-400">USDFC:</span>
                        <span className="font-medium">
                          {usdfcLoading ? (
                            <span className="text-slate-400">Loading...</span>
                          ) : usdfcError ? (
                            <span className="text-red-500">Error loading</span>
                          ) : (
                            `${usdfcBalance ? (Number(usdfcBalance) / 1e18).toFixed(2) : '0.00'} USDFC`
                          )}
                        </span>
                      </div>
                    </div>
                    
                    <Alert className="mt-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        You need TFIL or USDFC tokens to pay for storage. Get test tokens from the faucet links in the wallet dropdown.
                      </AlertDescription>
                    </Alert>

                    {/* Faucet Links */}
                    <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <h4 className="font-medium mb-3 text-blue-900 dark:text-blue-100">Get Test Tokens</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <ExternalLink className="h-4 w-4 text-blue-600" />
                          <a 
                            href="https://faucet.calibration.fildev.network/funds.html" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
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
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                          >
                            USDFC Testnet Faucet
                          </a>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            Your wallet address:
                          </p>
                          <div className="flex items-center gap-1">
                            <code className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded text-xs">
                              {address}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigator.clipboard.writeText(address || '')}
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
              <div className="text-center mb-4 sm:mb-6">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Make an initial deposit and configure storage settings
                </p>
              </div>

              <div className="w-full max-w-2xl mx-auto">
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
                        Please complete the payment setup in the wallet dropdown menu to continue with file uploads.
                      </AlertDescription>
                    </Alert>
                    
                    <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <h4 className="font-medium mb-2">Current Status:</h4>
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
              <div className="text-center mb-6 sm:mb-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-3">
                  Upload to Filecoin
                </h2>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                  Choose your upload method below. Files will be stored securely with cryptographic proofs on the Filecoin network.
                </p>
              </div>
            
              <div className="w-full max-w-6xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                  {/* File Upload Section */}
                  <Card className="h-full flex flex-col">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Upload className="h-5 w-5 text-blue-600" />
                        Upload Files & Folders
                      </CardTitle>
                      <CardDescription>
                        Drag and drop files, folders, or click to browse
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col">
                      <div
                        {...getRootProps()}
                        className={`border-2 border-dashed rounded-xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 hover:scale-[1.02] flex-1 flex items-center justify-center ${
                          isDragActive 
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 scale-[1.02]' 
                            : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'
                        }`}
                      >
                        <input {...getInputProps()} />
                        <div className="flex flex-col items-center space-y-4">
                          <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900">
                            <Upload className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                          </div>
                          {isDragActive ? (
                            <p className="text-lg font-medium text-blue-600">Drop files or folders here...</p>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-lg font-medium text-slate-900 dark:text-white">
                                Drag & drop files or folders here
                              </p>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                or click to browse
                              </p>
                              <div className="flex flex-wrap justify-center gap-1 mt-3">
                                <Badge variant="secondary" className="text-xs">Images</Badge>
                                <Badge variant="secondary" className="text-xs">Videos</Badge>
                                <Badge variant="secondary" className="text-xs">Documents</Badge>
                                <Badge variant="secondary" className="text-xs">Folders</Badge>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {files.length > 0 && (
                        <div className="mt-6">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                            <h3 className="text-base font-medium">Selected Files ({files.length})</h3>
                            <Button 
                              onClick={uploadFiles} 
                              disabled={isUploading || files.every(f => f.status !== 'pending')}
                              className="flex items-center gap-2 w-full sm:w-auto"
                            >
                              <Upload className="h-4 w-4" />
                              {isUploading ? 'Uploading...' : 'Upload to Filecoin'}
                            </Button>
                          </div>

                          <div className="space-y-3 max-h-64 overflow-y-auto">
                            {files.map((fileItem) => (
                              <div key={fileItem.id} className="flex items-start gap-3 p-3 border rounded-lg">
                                <div className="flex-shrink-0 mt-0.5">
                                  {getStatusIcon(fileItem.status)}
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                      {fileItem.file.name}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      {formatFileSize(fileItem.file.size)}
                                    </p>
                                  </div>
                                  
                                  {fileItem.status === 'uploading' && (
                                    <Progress value={fileItem.progress} className="mt-2" />
                                  )}
                                  
                                  {fileItem.status === 'completed' && (
                                    <div className="mt-2 space-y-1">
                                      <p className="text-xs text-green-600 dark:text-green-400 break-all">
                                        CID: {fileItem.cid}
                                      </p>
                                      <p className="text-xs text-blue-600 dark:text-blue-400 break-all">
                                        Piece CID: {fileItem.pieceCid}
                                      </p>
                                    </div>
                                  )}

                                  {fileItem.status === 'error' && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                      {fileItem.error}
                                    </p>
                                  )}
                                </div>
                                
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFile(fileItem.id)}
                                  className="h-8 w-8 p-0 flex-shrink-0"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* CAR Import Section */}
                  <Card className="h-full flex flex-col">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <FileArchive className="h-5 w-5 text-purple-600" />
                        Import CAR Files
                      </CardTitle>
                      <CardDescription>
                        Import existing CAR archives directly to Filecoin storage
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col">
                      <div
                        {...getCarRootProps()}
                        className={`border-2 border-dashed rounded-xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 hover:scale-[1.02] flex-1 flex items-center justify-center ${
                          isCarDragActive 
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-950 scale-[1.02]' 
                            : 'border-slate-300 dark:border-slate-600 hover:border-purple-400 dark:hover:border-purple-500'
                        }`}
                      >
                        <input {...getCarInputProps()} />
                        <div className="flex flex-col items-center space-y-4">
                          <div className="p-4 rounded-full bg-purple-100 dark:bg-purple-900">
                            <FileArchive className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                          </div>
                          {isCarDragActive ? (
                            <p className="text-lg font-medium text-purple-600">Drop CAR files here...</p>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-lg font-medium text-slate-900 dark:text-white">
                                Drag & drop CAR files here
                              </p>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                or click to browse
                              </p>
                              <Badge variant="secondary" className="text-xs">.car files only</Badge>
                            </div>
                          )}
                        </div>
                      </div>

                      {carFiles.length > 0 && (
                        <div className="mt-6">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                            <h3 className="text-base font-medium">CAR Files ({carFiles.length})</h3>
                            <Button 
                              onClick={importCarFiles} 
                              disabled={isImporting || carFiles.every(f => f.status !== 'pending')}
                              className="flex items-center gap-2 w-full sm:w-auto"
                            >
                              <FileArchive className="h-4 w-4" />
                              {isImporting ? 'Importing...' : 'Import to Filecoin'}
                            </Button>
                          </div>

                          <div className="space-y-3 max-h-64 overflow-y-auto">
                            {carFiles.map((fileItem) => (
                              <div key={fileItem.id} className="flex items-start gap-3 p-3 border rounded-lg">
                                <div className="flex-shrink-0 mt-1">
                                  {getStatusIcon(fileItem.status)}
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                                    <p className="text-sm font-medium text-slate-900 dark:text-white break-all">
                                      {fileItem.file.name}
                                    </p>
                                    <Badge variant="secondary" className="w-fit">
                                      {formatFileSize(fileItem.file.size)}
                                    </Badge>
                                    <Badge 
                                      variant={fileItem.status === 'completed' ? 'default' : 
                                              fileItem.status === 'error' ? 'destructive' : 'secondary'}
                                      className="w-fit"
                                    >
                                      {getStatusText(fileItem.status)}
                                    </Badge>
                                  </div>
                                  
                                  {fileItem.status === 'uploading' && (
                                    <div className="mb-2">
                                      <Progress value={fileItem.progress} className="h-2" />
                                      <p className="text-xs text-slate-500 mt-1">{fileItem.progress}% uploaded</p>
                                    </div>
                                  )}
                                  
                                  {fileItem.cid && (
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                      <p><span className="font-medium">CID:</span> {fileItem.cid}</p>
                                      {fileItem.pieceCid && (
                                        <p><span className="font-medium">Piece CID:</span> {fileItem.pieceCid}</p>
                                      )}
                                    </div>
                                  )}

                                  {fileItem.error && (
                                    <Alert variant="destructive" className="mt-2">
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertDescription className="text-xs">
                                        {fileItem.error}
                                      </AlertDescription>
                                    </Alert>
                                  )}
                                  
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2">
                                    <Badge variant="secondary" className="w-fit">
                                      Provider: {fileItem.storageProvider}
                                    </Badge>
                                    {fileItem.downloadUrl && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.open(fileItem.downloadUrl, '_blank')}
                                        className="h-6 text-xs w-fit"
                                      >
                                        <ExternalLink className="h-3 w-3 mr-1" />
                                        Download
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeCarFile(fileItem.id)}
                                  className="h-8 w-8 p-0 flex-shrink-0"
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
                          CAR files must be valid Content Addressed Archives. The system will extract root CIDs and upload to Filecoin storage providers.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </section>
          )}


        </div>
      </main>
    </div>
  );
}