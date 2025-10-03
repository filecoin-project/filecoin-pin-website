'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

interface UploadedFile {
  file: File
  id: string
  status: 'pending' | 'uploading' | 'completed' | 'error'
  progress: number
  cid?: string
  pieceCid?: string
  error?: string
}

export function FileUpload() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)

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
        // Update status to uploading
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { ...f, status: 'uploading', progress: 0 } : f
        ))

        // Simulate upload progress
        for (let progress = 0; progress <= 100; progress += 10) {
          await new Promise(resolve => setTimeout(resolve, 200))
          setFiles(prev => prev.map(f => 
            f.id === fileItem.id ? { ...f, progress } : f
          ))
        }

        // Simulate successful upload
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
      } catch (error) {
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      case 'uploading':
        return <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      default:
        return <File className="h-4 w-4 text-slate-400" />
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Upload Area */}
      <Card>
        <CardHeader className="pb-4 sm:pb-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Upload className="h-4 w-4 sm:h-5 sm:w-5" />
            Upload Files to Filecoin
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Drag and drop files or click to browse. Files will be pinned to Filecoin network.
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
            <Upload className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 mx-auto mb-3 sm:mb-4 text-slate-400" />
            {isDragActive ? (
              <p className="text-base sm:text-lg font-medium text-blue-600">Drop files here...</p>
            ) : (
              <div>
                <p className="text-base sm:text-lg font-medium text-slate-900 dark:text-white mb-2">
                  Drag & drop files here, or click to select
                </p>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Supports images, videos, documents, and archives
                </p>
              </div>
            )}
          </div>

          {files.length > 0 && (
            <div className="mt-4 sm:mt-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4">
                <h3 className="text-base sm:text-lg font-medium">Selected Files ({files.length})</h3>
                <Button 
                  onClick={uploadFiles} 
                  disabled={isUploading || files.every(f => f.status !== 'pending')}
                  className="flex items-center gap-2 w-full sm:w-auto"
                >
                  <Upload className="h-4 w-4" />
                  {isUploading ? 'Uploading...' : 'Upload to Filecoin'}
                </Button>
              </div>

              <div className="space-y-3">
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
    </div>
  )
}
