interface SidebarLayoutProps {
  children: React.ReactNode
  sidebar: React.ReactNode
  header: React.ReactNode
}

export function SidebarLayout({ children, sidebar, header }: SidebarLayoutProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] grid-rows-[auto_1fr] min-h-screen w-full bg-black">
      <div className="col-span-2 h-[var(--spacing-sidebar-height)] border-b border-zinc-800 px-10 lg:px-12 flex">
        {header}
      </div>
      <aside className="hidden sticky top-0 self-start h-[calc(100vh-var(--spacing-sidebar-height))] overflow-y-auto p-12 py-10 lg:block">
        {sidebar}
      </aside>
      <main className="overflow-y-auto border-l border-zinc-800 px-10 lg:px-15 py-10">{children}</main>
    </div>
  )
}
