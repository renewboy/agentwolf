import {
  GearSix,
  MoonStars,
  PlusCircle,
  SlidersHorizontal,
  SquaresFour,
} from '@phosphor-icons/react'
import { NavLink, Outlet } from 'react-router-dom'
import { getCopy } from '@agentwolf/assets'

export function AppShell() {
  return (
    <div className="aw-app-shell">
      <header className="aw-topbar">
        <NavLink className="aw-brand" to="/">
          {getCopy('brand')}
        </NavLink>
        <nav className="aw-nav" aria-label={getCopy('navigation.lobby')}>
          <NavItem to="/" label={getCopy('navigation.lobby')} icon={<MoonStars />} end />
          <NavItem to="/matches/new" label={getCopy('navigation.newMatch')} icon={<PlusCircle />} />
          <NavItem to="/boards" label={getCopy('navigation.boards')} icon={<SquaresFour />} />
          <NavItem to="/agents" label={getCopy('navigation.agents')} icon={<GearSix />} />
          <NavItem
            to="/settings"
            label={getCopy('navigation.settings')}
            icon={<SlidersHorizontal />}
          />
        </nav>
      </header>
      <Outlet />
    </div>
  )
}

function NavItem({
  to,
  label,
  icon,
  end = false,
}: {
  readonly to: string
  readonly label: string
  readonly icon: React.ReactNode
  readonly end?: boolean
}) {
  return (
    <NavLink className="aw-nav__link" to={to} end={end}>
      {icon}
      <span>{label}</span>
    </NavLink>
  )
}
