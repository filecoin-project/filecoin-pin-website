import { Upload } from 'lucide-react'
import { NavWallet } from '../nav-wallet'

function Header({
  isConnected,
  isCorrectNetwork,
  chainId,
}: {
  isConnected: boolean
  isCorrectNetwork: boolean
  chainId: number
}) {
  return (
    <header>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <Upload className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="text-lg font-bold text-slate-900 sm:text-xl dark:text-white">
              Filecoin Pin
            </span>
            <p className="-mt-1 text-xs text-slate-500 dark:text-slate-400">
              Pin and share files on Filecoin
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-4 sm:space-x-6">
          Network Status Indicator
          {isConnected && (
            <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
              <div
                className={`h-2 w-2 rounded-full ${isCorrectNetwork ? 'bg-green-500' : 'bg-red-500'}`}
              />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {isCorrectNetwork ? 'Filecoin Calibration' : `Chain ${chainId}`}
              </span>
            </div>
          )}
          <NavWallet />
        </div>
      </div>
    </header>
  )
}

export { Header }
