import clsx from 'clsx'

interface SidebarLayoutProps {
  children: React.ReactNode
  sidebar?: React.ReactNode
  header?: React.ReactNode
  sidebarWidth?: `w-${number}`
}

export function SidebarLayout({ children, sidebar, header, sidebarWidth = 'w-96' }: SidebarLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      {header && (
        <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-5">
          <div className="flex-1">{header}</div>
        </header>
      )}

      <div className="flex flex-grow flex-row">
        {sidebar && (
          <aside
            className={clsx(`${sidebarWidth} hidden h-screen border-r border-zinc-800 py-10 pr-15 pl-10 lg:block`)}
          >
            {sidebar}
          </aside>
        )}

        <main className="flex-grow px-15 py-10">{children}</main>
      </div>
    </div>
  )
}
