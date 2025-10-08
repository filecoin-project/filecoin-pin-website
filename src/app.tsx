import './app.css'
import Content from './components/layout/content.tsx'
import Header from './components/layout/header.tsx'
import Sidebar from './components/layout/sidebar.tsx'

function App() {
  return (
    <>
      <Header />
      <div className="main-content">
        <Sidebar />
        <Content />
      </div>
    </>
  )
}

export default App
