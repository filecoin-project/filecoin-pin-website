import { useState } from 'react'
import DragNDrop from '../upload/drag-n-drop.tsx'
import './content.css'

export default function Content() {
  const [_files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const handleFilesSelected = (selectedFiles: File[]) => {
    setFiles(selectedFiles)
    console.log('Files selected:', selectedFiles)
  }

  const handleUpload = async (filesToUpload: File[]) => {
    if (filesToUpload.length === 0) {
      alert('Please select files to upload')
      return
    }

    setIsUploading(true)

    try {
      // TODO: Implement actual upload to Filecoin
      console.log('Uploading files:', filesToUpload)

      // Simulate upload delay
      await new Promise((resolve) => setTimeout(resolve, 2000))

      alert(`Successfully uploaded ${filesToUpload.length} file(s) to Filecoin`)
      setFiles([]) // Clear files after successful upload
    } catch (error) {
      console.error('Upload failed:', error)
      alert('Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="content">
      <h1>IPFS Pin on Filecoin</h1>
      <p>Pin any IPFS file to a decentralized network of Filecoin storage providers</p>

      <div className="upload-section">
        <DragNDrop isUploading={isUploading} onFilesSelected={handleFilesSelected} onUpload={handleUpload} />
      </div>
    </div>
  )
}
