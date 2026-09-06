import { GameIcon } from './GameIcon.js'
import { NavLink, Outlet } from 'react-router-dom'
import { getCopy } from '@agentwolf/assets'
import { gameArt } from '../game-art.js'

export function AppShell() {
  return (
    <div className="aw-app-shell">
      <a className="aw-skip-link" href="#main-content">
        {getCopy('tableDesign.skip')}
      </a>
      <header className="aw-topbar">
        <NavLink className="aw-brand" to="/">
          <img src={gameArt.emblem} alt="" width="112" height="112" />
          <span>
            {getCopy('brand')}
            <small>{getCopy('tableDesign.brandTagline')}</small>
          </span>
        </NavLink>
        <nav className="aw-nav" aria-label={getCopy('tableDesign.navigation')}>
          <NavItem to="/" label={getCopy('navigation.lobby')} icon={<GameIcon name="eye" />} end />
          <NavItem
            to="/matches/new"
            label={getCopy('navigation.newMatch')}
            icon={<GameIcon name="battle" />}
          />
          <NavItem
            to="/boards"
            label={getCopy('navigation.boards')}
            icon={<GameIcon name="cards" />}
          />
          <NavItem
            to="/collection/characters"
            label={getCopy('navigation.collection')}
            icon={<GameIcon name="smile" />}
          />
          <NavItem
            to="/agents"
            label={getCopy('navigation.agents')}
            icon={<GameIcon name="pawn" />}
          />
          <NavItem
            to="/settings"
            label={getCopy('navigation.settings')}
            icon={<GameIcon name="settings" />}
          />
        </nav>
        <img className="aw-sidebar-forest" src={gameArt.forest} alt="" />
      </header>
      <div className="aw-app-content" id="main-content" tabIndex={-1}>
        <Outlet />
      </div>
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
    <NavLink
      className="aw-nav__link aw-choice aw-choice--navigation"
      aria-label={label}
      to={to}
      end={end}
    >
      {icon}
      <span className="aw-choice__label">{label}</span>
    </NavLink>
  )
}
