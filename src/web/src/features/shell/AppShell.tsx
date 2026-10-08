import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarHeart, House, LogOut, Menu, MessageCircleQuestion, Plug, Plus, Presentation, Search, Settings, X } from 'lucide-react'
import { useMe, useSignOut } from '../../api/hooks'
import { Brand } from '../../components/Brand'
import { Avatar } from '../../components/Avatar'
import { ButtonLink } from '../../components/Button'
import { popoverMotion, usePopover } from '../../components/usePopover'
import { useReducedMotion } from '../../lib/motion'
import { Bird } from '../pirikoo/Bird'
import { PirikooChat } from '../pirikoo/PirikooChat'
import { usePirikoo } from '../../stores/pirikoo'
import '../../styles/app.css'

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

const SOON = [{ id: 'checkins', icon: CalendarHeart }] as const

/**
 * The navigation as pill rows with their icons: what is live, what is coming (never a dead link, a tiny "Soon"
 * lozenge instead), Settings at the foot. The same list runs in the left sidebar and, on phones, in the drawer.
 */
function SideNav({ onNavigate, inDrawer = false }: { onNavigate?: () => void; inDrawer?: boolean }) {
  const { t } = useTranslation()
  const soonId = useId()
  const cls = ({ isActive }: { isActive: boolean }) => `navitem${isActive ? ' is-active' : ''}`
  return (
    <nav className={`sidenav sidenav--stacked${inDrawer ? ' sidenav--drawer' : ''}`} aria-label={t('common.nav.label')}>
      <ul className="sidenav__list">
        <li>
          <NavLink to="/app" end className={cls} onClick={onNavigate} viewTransition>
            <House size={18} aria-hidden="true" />
            <span>{t('common.nav.home')}</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/app/icebreakers" className={cls} onClick={onNavigate} viewTransition>
            <MessageCircleQuestion size={18} aria-hidden="true" />
            <span>{t('common.nav.icebreakers')}</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/app/presentations" className={cls} onClick={onNavigate} viewTransition>
            <Presentation size={18} aria-hidden="true" />
            <span>{t('presentations.title')}</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/app/integrations" className={cls} onClick={onNavigate} viewTransition>
            <Plug size={18} aria-hidden="true" />
            <span>{t('integrations.title')}</span>
          </NavLink>
        </li>
      </ul>
      {/* The group is named for screen readers; sighted people read the "Soon" lozenge on its item. */}
      <p className="sidenav__group visually-hidden" id={soonId}>{t('common.nav.soonGroup')}</p>
      <ul className="sidenav__list" aria-labelledby={soonId}>
        {SOON.map(({ id, icon: Icon }) => (
          <li key={id}>
            <span className="navitem is-soon">
              <Icon size={18} aria-hidden="true" />
              <span>{t(`home.modules.${id}.title`)}</span>
              <span className="lozenge">{t('common.soon')}</span>
            </span>
          </li>
        ))}
      </ul>
      <ul className="sidenav__list sidenav__foot">
        <li>
          <NavLink to="/app/settings" className={cls} onClick={onNavigate} viewTransition>
            <Settings size={18} aria-hidden="true" />
            <span>{t('common.settings')}</span>
          </NavLink>
        </li>
      </ul>
    </nav>
  )
}

/** Avatar menu: who is signed in, settings, and sign out. */
function AccountMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: me } = useMe()
  const signOut = useSignOut()
  const { open: menuOpen, toggle, close, triggerRef, panelRef, panelProps } = usePopover()
  const reduced = useReducedMotion()
  const id = useId()
  const [failed, setFailed] = useState(false)
  const name = me?.displayName ?? me?.email ?? ''

  return (
    <div className="dropdown account">
      <button
        ref={triggerRef}
        type="button"
        className="account__trigger"
        aria-expanded={menuOpen}
        aria-controls={id}
        aria-label={t('common.profileMenu')}
        onClick={toggle}
      >
        <Avatar name={name} />
      </button>
      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            ref={panelRef}
            id={id}
            className="dropdown__panel dropdown__panel--end account__panel"
            data-motion=""
            {...popoverMotion(reduced)}
            {...panelProps}
          >
            <div className="account__who">
              <Avatar name={name} size="lg" />
              <div className="account__id">
                <p className="account__label">{t('common.signedInAs')}</p>
                <p className="account__name"><bdi>{name}</bdi></p>
                {me?.email && me.displayName ? <p className="account__email" dir="ltr">{me.email}</p> : null}
              </div>
            </div>
            <ul className="dropdown__list">
              <li>
                <Link to="/app/settings" className="dropdown__item" onClick={() => close(false)} viewTransition>
                  <Settings size={16} aria-hidden="true" />
                  <span className="dropdown__item-text">{t('common.settings')}</span>
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  className="dropdown__item account__signout"
                  aria-busy={signOut.isPending || undefined}
                  onClick={async () => {
                    if (signOut.isPending) return
                    setFailed(false)
                    try {
                      await signOut.mutateAsync()
                      // Router-level navigate still works after the guard unmounts the shell.
                      navigate('/', { replace: true })
                    } catch {
                      setFailed(true)
                    }
                  }}
                >
                  <LogOut className="flip-rtl" size={16} aria-hidden="true" />
                  <span className="dropdown__item-text">{t('common.signOut')}</span>
                </button>
              </li>
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {failed ? <p className="toast toast--error" role="alert">{t('common.signOutFailed')}</p> : null}
    </div>
  )
}

/**
 * The signed-in shell (#250): a left sidebar with the wordmark and the navigation, and over the page a header with
 * the search field (it asks Pirikoo, the AI guide; Ctrl/⌘ K), New circle and the avatar. Under 62rem the sidebar
 * folds into a drawer behind the menu button and the wordmark moves into the header. The page sits on white.
 */
export function AppShell() {
  const { t } = useTranslation()
  const { data: me } = useMe()
  const drawerRef = useRef<HTMLDialogElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const shortcut = isMac() ? '⌘K' : 'Ctrl K'

  // A route change (link in the drawer, or a plan Pirikoo ran) closes the drawer.
  useEffect(() => {
    if (drawerRef.current?.open) drawerRef.current.close()
  }, [location.pathname])

  const closeDrawer = useCallback(() => drawerRef.current?.close(), [])

  return (
    <div className="shell">
      <a className="skip-link" href="#main">{t('common.skipToContent')}</a>
      <aside className="sidebar">
        <div className="sidebar__brand">
          <Brand to="/app" />
        </div>
        <SideNav />
      </aside>

      <div className="shell__body">
        <header className="topbar">
          <div className="topbar__inner">
            <button
              ref={menuRef}
              type="button"
              className="icon-btn topbar__menu"
              aria-label={t('common.nav.open')}
              aria-haspopup="dialog"
              onClick={() => drawerRef.current?.showModal()}
            >
              <Menu size={22} aria-hidden="true" />
            </button>
            <span className="topbar__brand"><Brand to="/app" /></span>
            {/* Search is asking: Pirikoo finds the page, the circle or the round, and can run it. */}
            <button type="button" className="topbar__ask" onClick={() => usePirikoo.getState().open('center')} aria-keyshortcuts="Control+K Meta+K">
              <Search className="topbar__search-icon" size={18} strokeWidth={2.25} aria-hidden="true" />
              <span className="topbar__ask-text">{t('pirikoo.searchAsk')}</span>
              <span className="topbar__bird" aria-hidden="true"><Bird /></span>
              <kbd className="topbar__kbd" dir="ltr">{shortcut}</kbd>
            </button>
            <div className="topbar__end">
              <ButtonLink to="/app/circles/new" size="sm" className="topbar__create" icon={<Plus size={16} strokeWidth={2.5} />}>
                {t('circles.new')}
              </ButtonLink>
              <AccountMenu />
            </div>
          </div>
        </header>

        <main id="main" className="shell__main">
          <Outlet />
        </main>
      </div>

      <dialog
        ref={drawerRef}
        className="drawer"
        aria-label={t('common.nav.label')}
        onClose={() => menuRef.current?.focus()}
        onClick={(e) => { if (e.target === drawerRef.current) closeDrawer() }}
      >
        <div className="drawer__head">
          <Brand to="/app" />
          <button type="button" className="icon-btn" aria-label={t('common.nav.close')} onClick={closeDrawer}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <SideNav onNavigate={closeDrawer} inDrawer />
      </dialog>

      <PirikooChat owner={me ? `user:${me.id}` : null} />
    </div>
  )
}
