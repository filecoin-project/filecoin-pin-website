'use client'

import { XIcon } from 'lucide-react'
import { DashedContainer } from './dashed-container.tsx'

type SelectedFileProps = {
  file: File
  onReset: () => void
}

export function SelectedFile({ file, onReset }: SelectedFileProps) {
  return (
    <DashedContainer>
      <div className="flex items-center gap-1">
        <p className="font-medium text-zinc-50">{file.name}</p>
        <button
          className="group/button cursor-pointer rounded-full p-2 focus:outline-none"
          onClick={onReset}
          type="button"
        >
          <div className="group-focus/button:brand-outline rounded-full bg-zinc-700 p-2 text-zinc-300 group-hover/button:bg-zinc-600">
            <span className="sr-only">Remove selected file</span>
            <XIcon size={16} />
          </div>
        </button>
      </div>
    </DashedContainer>
  )
}
