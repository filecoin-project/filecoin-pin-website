import { CircleAlert } from 'lucide-react'

function Alert() {
  return (
    <div className="flex items-center gap-3 p-5 rounded-md bg-zinc-900 text-zinc-100">
      <CircleAlert />
      <span>
        This demo runs on Filecoin Calibration testnet, where data isn’t permanent and infrastructure resets regularly.
      </span>
    </div>
  )
}

export { Alert }
