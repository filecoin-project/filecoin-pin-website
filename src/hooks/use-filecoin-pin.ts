import { useContext } from 'react'
import { FilecoinPinContext } from '../context/filecoin-pin-provider.tsx'

export const useFilecoinPin = () => {
  const context = useContext(FilecoinPinContext)
  if (!context) {
    throw new Error('useFilecoinPin must be used within FilecoinPinProvider')
  }
  return context
}
