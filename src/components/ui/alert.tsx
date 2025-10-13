import { CircleAlert } from 'lucide-react'

type AlertProps = {
  description: string
}

function Alert({ description }: AlertProps) {
  return (
    <div className="flex items-center gap-3 p-5 rounded-md bg-zinc-900 text-zinc-100">
      <span aria-hidden="true" className="text-zinc-400">
        <CircleAlert />
      </span>
      <span>{description}</span>
    </div>
  )
}

export { Alert }
