interface SidebarLayoutProps {
  children: React.ReactNode
  sidebar: React.ReactNode
  header: React.ReactNode
}

export function SidebarLayout({ children, sidebar, header }: SidebarLayoutProps) {
  return (
    <div className="grid grid-cols-[440px_1fr] grid-rows-[auto_1fr] min-h-screen">
      <div className="col-span-2 h-[var(--spacing-sidebar-height)] border-b border-zinc-800 px-12 flex">{header}</div>
      <aside className="sticky top-0 self-start h-[calc(100vh-var(--spacing-sidebar-height))] overflow-y-auto p-12">
        {sidebar}
      </aside>
      <main className="overflow-y-auto border-l border-zinc-800 p-12">{children}</main>
    </div>
  )
}
