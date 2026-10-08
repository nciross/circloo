import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarHeart, LogOut, Menu, Plus, Settings, X } from 'lucide-react'
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
 * The navigation as pills: what is live, what is coming (never a dead link, a tiny "Soon" lozenge instead).
 * In the top bar it runs in a row; in the drawer it stacks, with Settings at the foot.
 */
function SideNav({ onNavigate, inDrawer = false }: { onNavigate?: () => void; inDrawer?: boolean }) {
  const { t } = useTranslation()
  const soonId = useId()
  const cls = ({ isActive }: { isActive: boolean }) => `navitem${isActive ? ' is-active' : ''}`
  return (
    <nav className={`sidenav${inDrawer ? ' sidenav--drawer' : ''}`} aria-label={t('common.nav.label')}>
      <ul className="sidenav__list">
        <li>
          <NavLink to="/app" end className={cls} onClick={onNavigate} viewTransition>
            {t('common.nav.home')}
          </NavLink>
        </li>
        <li>
          <NavLink to="/app/icebreakers" className={cls} onClick={onNavigate} viewTransition>
            {t('common.nav.icebreakers')}
          </NavLink>
        </li>
        <li>
          <NavLink to="/app/presentations" className={cls} onClick={onNavigate} viewTransition>
            {t('presentations.title')}
          </NavLink>
        </li>
        <li>
          <NavLink to="/app/integrations" className={cls} onClick={onNavigate} viewTransition>
            {t('integrations.title')}
          </NavLink>
        </li>
      </ul>
      <p className="sidenav__group" id={soonId}>{t('common.nav.soonGroup')}</p>
      <ul className="sidenav__list" aria-labelledby={soonId}>
        {SOON.map(({ id, icon: Icon }) => (
          <li key={id}>
            <span className="navitem is-soon">
              {inDrawer ? <Icon size={18} aria-hidden="true" /> : null}
              <span>{t(`home.modules.${id}.title`)}</span>
              <span className="lozenge">{t('common.soon')}</span>
            </span>
          </li>
        ))}
      </ul>
      {inDrawer ? (
        <ul className="sidenav__list sidenav__foot">
          <li>
            <NavLink to="/app/settings" className={cls} onClick={onNavigate} viewTransition>
              <Settings size={18} aria-hidden="true" />
              <span>{t('common.settings')}</span>
            </NavLink>
          </li>
        </ul>
      ) : null}
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
 * The signed-in shell: one white top bar with the wordmark, the navigation as pills, Ask Pirikoo, New circle
 * and the avatar. No rail: under 62rem the pills fold into a drawer. The page sits on white, 76rem wide at most.
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
      <header className="topbar">
        <div className="topbar__inner">
          <a className="skip-link" href="#main">{t('common.skipToContent')}</a>
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
          <Brand to="/app" />
          <div className="topbar__nav">
            <SideNav />
          </div>
          <div className="topbar__end">
            <button type="button" className="topbar__ask" onClick={() => usePirikoo.getState().open('center')} aria-keyshortcuts="Control+K Meta+K">
              <span className="topbar__bird"><Bird /></span>
              <span className="topbar__ask-text">{t('pirikoo.ask')}</span>
              <kbd className="topbar__kbd" dir="ltr">{shortcut}</kbd>
            </button>
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
