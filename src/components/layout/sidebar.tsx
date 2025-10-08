import './sidebar.css'

export default function Sidebar() {
  return (
    <div className="sidebar">
      <h2>Steps</h2>
      <ol>
        <li>Step 1: Wallet setup</li>
        <li>Step 2: Select file</li>
        <li>Step 3: Upload to SP</li>
        <li>Step 4: Index and announce</li>
        <li>Step 5: Verify storage</li>
      </ol>
      <button type="button">Learn more</button>
    </div>
  )
}
