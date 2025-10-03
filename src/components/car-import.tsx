'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileArchive, Upload, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface CarFile {
  file: File
  id: string
  status: 'pending' | 'validating' | 'uploading' | 'completed' | 'error'
  progress: number
  rootCids?: string[]
  pieceCid?: string
  storageProvider?: string
  downloadUrl?: string
  error?: string
}

export function CarImport() {
  const [files, setFiles] = useState<CarFile[]>([])
  const [isImporting, setIsImporting] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const carFiles = acceptedFiles.filter(file => 
      file.name.endsWith('.car') || file.type === 'application/car'
    )
    
    const newFiles: CarFile[] = carFiles.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: 'pending',
      progress: 0
    }))
    setFiles(prev => [...prev, ...newFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/car': ['.car']
    },
    multiple: true
  })

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(file => file.id !== id))
  }

  const importFiles = async () => {
    setIsImporting(true)
    
    for (const fileItem of files.filter(f => f.status === 'pending')) {
      try {
        // Validate CAR file
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { ...f, status: 'validating', progress: 10 } : f
        ))

        await new Promise(resolve => setTimeout(resolve, 1000))

        // Simulate CAR validation and root CID extraction
        const mockRootCids = [
          `Qm${Math.random().toString(36).substr(2, 44)}`,
          `Qm${Math.random().toString(36).substr(2, 44)}`
        ]

        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { 
            ...f, 
            status: 'uploading', 
            progress: 20,
            rootCids: mockRootCids
          } : f
        ))

        // Simulate upload to Synapse
        for (let progress = 20; progress <= 100; progress += 20) {
          await new Promise(resolve => setTimeout(resolve, 500))
          setFiles(prev => prev.map(f => 
            f.id === fileItem.id ? { ...f, progress } : f
          ))
        }

        // Simulate successful import
        const mockPieceCid = `baga${Math.random().toString(36).substr(2, 44)}`
        const mockStorageProvider = `f0${Math.floor(Math.random() * 10000)}`
        const mockDownloadUrl = `https://api.calibration.node.glif.io/retrieve/${mockPieceCid}`
        
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { 
            ...f, 
            status: 'completed', 
            progress: 100,
            pieceCid: mockPieceCid,
            storageProvider: mockStorageProvider,
            downloadUrl: mockDownloadUrl
          } : f
        ))
      } catch (error) {
        setFiles(prev => prev.map(f => 
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusIcon = (status: CarFile['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      case 'validating':
      case 'uploading':
        return <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      default:
        return <FileArchive className="h-4 w-4 text-slate-400" />
    }
  }

  const getStatusText = (status: CarFile['status']) => {
    switch (status) {
      case 'validating':
        return 'Validating CAR file...'
      case 'uploading':
        return 'Uploading to Filecoin...'
      case 'completed':
        return 'Import completed'
      case 'error':
        return 'Import failed'
      default:
        return 'Ready to import'
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="pb-4 sm:pb-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <FileArchive className="h-4 w-4 sm:h-5 sm:w-5" />
            Import CAR Files
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Import existing CAR (Content Addressed Archive) files directly to Filecoin storage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-4 sm:p-6 md:p-8 text-center cursor-pointer transition-colors ${
              isDragActive 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
            }`}
          >
            <input {...getInputProps()} />
            <FileArchive className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 mx-auto mb-3 sm:mb-4 text-slate-400" />
            {isDragActive ? (
              <p className="text-base sm:text-lg font-medium text-blue-600">Drop CAR files here...</p>
            ) : (
              <div>
                <p className="text-base sm:text-lg font-medium text-slate-900 dark:text-white mb-2">
                  Drag & drop CAR files here, or click to select
                </p>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Only .car files are supported
                </p>
              </div>
            )}
          </div>

          {files.length > 0 && (
            <div className="mt-4 sm:mt-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4">
                <h3 className="text-base sm:text-lg font-medium">CAR Files ({files.length})</h3>
                <Button 
                  onClick={importFiles} 
                  disabled={isImporting || files.every(f => f.status !== 'pending')}
                  className="flex items-center gap-2 w-full sm:w-auto"
                >
                  <Upload className="h-4 w-4" />
                  {isImporting ? 'Importing...' : 'Import to Filecoin'}
                </Button>
              </div>

              <div className="space-y-4">
                {files.map((fileItem) => (
                  <div key={fileItem.id} className="border rounded-lg p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getStatusIcon(fileItem.status)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {fileItem.file.name}
                          </p>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {formatFileSize(fileItem.file.size)}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(fileItem.id)}
                              className="h-6 w-6 p-0 flex-shrink-0"
                            >
                              ×
                            </Button>
                          </div>
                        </div>
                        
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                          {getStatusText(fileItem.status)}
                        </p>
                        
                        {(fileItem.status === 'validating' || fileItem.status === 'uploading') && (
                          <Progress value={fileItem.progress} className="mb-3" />
                        )}
                        
                        {fileItem.status === 'completed' && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 gap-2 text-xs">
                              <div>
                                <span className="text-slate-600 dark:text-slate-400">Root CIDs:</span>
                                <div className="font-mono text-green-600 dark:text-green-400 break-all">
                                  {fileItem.rootCids?.map(cid => (
                                    <div key={cid} className="break-all">{cid}</div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <span className="text-slate-600 dark:text-slate-400">Piece CID:</span>
                                <div className="font-mono text-blue-600 dark:text-blue-400 break-all">
                                  {fileItem.pieceCid}
                                </div>
                              </div>
                            </div>
                            
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
                        )}
                        
                        {fileItem.status === 'error' && (
                          <Alert variant="destructive" className="mt-2">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                              {fileItem.error}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Alert className="mt-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              CAR files must be valid Content Addressed Archives. The system will extract root CIDs and upload to Filecoin storage providers.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
