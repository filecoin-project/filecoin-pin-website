import { File, FileArchive, FileCode2, FileImage, FileMusic, FileSpreadsheet, FileText, FileVideo } from 'lucide-react'

const fileTypes = [
  { pattern: /\.(avif|bmp|gif|heic|ico|jpe?g|png|svg|tiff?|webp)$/i, icon: FileImage },
  { pattern: /\.(avi|m4v|mkv|mov|mp4|mpeg|mpg|webm)$/i, icon: FileVideo },
  { pattern: /\.(aac|aiff|flac|m4a|mp3|ogg|opus|wav)$/i, icon: FileMusic },
  { pattern: /\.(7z|bz2|car|gz|rar|tar|tgz|xz|zip)$/i, icon: FileArchive },
  { pattern: /\.(csv|ods|tsv|xlsx?)$/i, icon: FileSpreadsheet },
  { pattern: /\.(c|cpp|css|go|h|html?|java|[cm]?jsx?|json|py|rs|sh|sql|tsx?|vue|xml|ya?ml)$/i, icon: FileCode2 },
  { pattern: /\.(docx?|md|odt|pdf|rtf|txt)$/i, icon: FileText },
]

export function FileTypeIcon({ fileName, importedCar }: { fileName: string; importedCar?: boolean }) {
  const Icon = importedCar ? FileArchive : (fileTypes.find(({ pattern }) => pattern.test(fileName))?.icon ?? File)
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-800/10 text-accent">
      <Icon aria-hidden="true" size={16} />
    </span>
  )
}
