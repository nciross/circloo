import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { CalendarHeart, CircleDashed, Home, LayoutGrid, LogOut, Menu, MessagesSquare, Plug, Plus, Settings, Sparkles, X } from 'lucide-react'
import { useMe, useSignOut } from '../../api/hooks'
import { Brand } from '../../components/Brand'
import { Avatar } from '../../components/Avatar'
import { ButtonLink } from '../../components/Button'
import { usePopover } from '../../components/usePopover'
import { AskBar } from '../ask/AskBar'
import { useAskBar } from './askBarStore'
import '../../styles/app.css'

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

const SOON = [
  { id: 'checkins', icon: CalendarHeart },
  { id: 'boards', icon: LayoutGrid },
  { id: 'integrations', icon: Plug },
] as const

/** The left navigation: what is live, what is coming (never a dead link), and settings at the foot. */
function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const soonId = useId()
  const cls = ({ isActive }: { isActive: boolean }) => `navitem${isActive ? ' is-active' : ''}`
  return (
    <nav className="sidenav" aria-label={t('common.nav.label')}>
      <ul className="sidenav__list">
        <li>
          <NavLink to="/app" end className={cls} onClick={onNavigate} viewTransition>
            <Home size={18} aria-hidden="true" />
            <span>{t('common.nav.home')}</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/app/circles/new" className={cls} onClick={onNavigate} viewTransition>
            <CircleDashed size={18} aria-hidden="true" />
            <span>{t('circles.new')}</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/app/icebreakers" className={cls} onClick={onNavigate} viewTransition>
            <MessagesSquare size={18} aria-hidden="true" />
            <span>{t('common.nav.icebreakers')}</span>
          </NavLink>
        </li>
      </ul>
      <p className="sidenav__group" id={soonId}>{t('common.nav.soonGroup')}</p>
      <ul className="sidenav__list" aria-labelledby={soonId}>
        {SOON.map(({ id, icon: Icon }) => (
          <li key={id}>
            <span className="navitem is-soon">
              <Icon size={18} aria-hidden="true" />
              <span>{t(`home.modules.${id}.title`)}</span>
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
      <div ref={panelRef} id={id} className="dropdown__panel dropdown__panel--end account__panel" hidden={!menuOpen} {...panelProps}>
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
      </div>
      {failed ? <p className="toast toast--error" role="alert">{t('common.signOutFailed')}</p> : null}
    </div>
  )
}

/** The signed-in shell: top bar with Ask circloo, a left sidebar (a drawer on small screens) and the page. */
export function AppShell() {
  const { t } = useTranslation()
  const { open, initial, show, hide } = useAskBar()
  const [toast, setToast] = useState('')
  const drawerRef = useRef<HTMLDialogElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const shortcut = isMac() ? '⌘K' : 'Ctrl K'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyK') {
        e.preventDefault()
        show()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(id)
  }, [toast])

  // A route change (link in the drawer, or an Ask circloo plan) closes the drawer.
  useEffect(() => {
    if (drawerRef.current?.open) drawerRef.current.close()
  }, [location.pathname])

  const closeDrawer = useCallback(() => drawerRef.current?.close(), [])
  const onDone = useCallback((message: string) => setToast(message), [])

  return (
    <div className="shell">
      <header className="topbar">
        <a className="skip-link" href="#main">{t('common.skipToContent')}</a>
        <button
          ref={menuRef}
          type="button"
          className="icon-btn topbar__menu"
          aria-label={t('common.nav.open')}
          aria-haspopup="dialog"
          onClick={() => drawerRef.current?.showModal()}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <Brand to="/app" />
        <button type="button" className="topbar__ask" onClick={() => show()} aria-keyshortcuts="Control+K Meta+K">
          <Sparkles size={16} aria-hidden="true" />
          <span className="topbar__ask-text">{t('askbar.open')}</span>
          <kbd className="topbar__kbd" dir="ltr">{shortcut}</kbd>
        </button>
        <div className="topbar__end">
          <ButtonLink to="/app/circles/new" size="sm" className="topbar__create" icon={<Plus size={16} strokeWidth={2.5} />}>
            {t('circles.new')}
          </ButtonLink>
          <AccountMenu />
        </div>
      </header>

      <div className="shell__body">
        <aside className="sidebar">
          <SideNav />
        </aside>
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
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <SideNav onNavigate={closeDrawer} />
      </dialog>

      <AskBar open={open} initial={initial} onClose={hide} onDone={onDone} />
      <p className="toast" role="status" aria-live="polite" hidden={!toast}>{toast}</p>
    </div>
  )
}
