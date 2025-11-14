import { Dialog } from '../ui/dialog.tsx'
import { Logo } from '../ui/logo.tsx'
import SidebarSteps from './sidebar-steps.tsx'

interface SidebarLayoutProps {
  children: React.ReactNode
  sidebar: React.ReactNode
  header: React.ReactNode
}

export function SidebarLayout({ children, sidebar, header }: SidebarLayoutProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] grid-rows-[auto_1fr] min-h-screen w-full bg-black">
      {/* Header */}
      <div className="col-span-2 h-[var(--spacing-sidebar-height)] border-b border-zinc-800 px-12 md:flex hidden">
        {header}
      </div>
      <div className="col-span-2 border-b py-4 border-zinc-800 px-10 md:hidden flex">
        <Logo />
      </div>

      <div className="fixed bottom-8 right-8 z-50 lg:hidden block">
        <Dialog content={<SidebarSteps />} />
      </div>

      {/* Sidebar */}
      <aside className="hidden sticky top-0 self-start h-[calc(100vh-var(--spacing-sidebar-height))] overflow-y-auto p-12 py-10 lg:block">
        {sidebar}
      </aside>

      {/* Main content */}
      <main className="overflow-y-auto lg:border-l lg:border-zinc-800 px-6 lg:px-15 py-6">{children}</main>
    </div>
  )
}
