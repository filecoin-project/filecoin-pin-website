import SidebarLinks from './sidebar-links'
import SidebarSteps from './sidebar-steps'

export default function Sidebar() {
  return (
    <div className="flex flex-col justify-between min-h-full">
      <SidebarSteps />
      <SidebarLinks />
    </div>
  )
}
