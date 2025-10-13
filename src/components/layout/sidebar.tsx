import SidebarLinks from './sidebar-links.tsx'
import SidebarSteps from './sidebar-steps.tsx'

export default function Sidebar() {
  return (
    <div className="sticky top-10 flex flex-col gap-40 justify-between">
      <SidebarSteps />
      <SidebarLinks />
    </div>
  )
}
