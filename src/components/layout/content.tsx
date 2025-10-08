import { useState } from 'react'
import './content.css'

export default function Content() {
  const [count, setCount] = useState(0)

  return (
    <div className="content">
      <h1>IPFS Pin on Filecoin</h1>
      <p>Pin any IPFS file to a decentralized network of Filecoin storage providers</p>

      <div className="card">
        <button onClick={() => setCount((count) => count + 1)} type="button">
          count is {count}
        </button>
        <p>
          Edit <code>src/app.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">Click on the Vite and React logos to learn more</p>
    </div>
  )
}
