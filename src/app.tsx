import './app.css'
import Content from './components/layout/content.tsx'
import Header from './components/layout/header.tsx'
import Sidebar from './components/layout/sidebar.tsx'
import { SidebarLayout } from './components/layout/sidebar-layout.tsx'

function App() {
  return (
    <SidebarLayout header={<Header />} sidebar={<Sidebar />}>
      <Content />
    </SidebarLayout>
  )
}

export default App
