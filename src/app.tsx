import Content from './components/layout/content.tsx'
import { Header } from './components/layout/header.tsx'
import { Sidebar } from './components/layout/sidebar.tsx'
import { SidebarLayout } from './components/layout/sidebar-layout.tsx'
import { Alert } from './components/ui/alert.tsx'
import { PageTitle } from './components/ui/page-title.tsx'

const isSecureContext = typeof globalThis.crypto?.subtle !== 'undefined'

function App() {
  if (!isSecureContext) {
    return (
      <SidebarLayout header={<Header />} sidebar={<Sidebar />}>
        <div className="space-y-10">
          <PageTitle />
          <Alert
            description="This app requires Web Crypto (crypto.subtle), which is only available over HTTPS or localhost. You appear to be loading over plain HTTP from a non-localhost address."
            message="Secure context required"
            variant="error"
          />
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout header={<Header />} sidebar={<Sidebar />}>
      <Content />
    </SidebarLayout>
  )
}

export default App
