import SidebarLinks from './sidebar-links.tsx'
import SidebarSteps from './sidebar-steps.tsx'

function Sidebar() {
  return (
    <div className="flex flex-col justify-between h-full">
      <SidebarSteps />
      <SidebarLinks />
    </div>
  )
}

export { Sidebar }
