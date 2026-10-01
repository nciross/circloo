import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { LogOut, Settings as SettingsIcon } from 'lucide-react'
import { useSignOut } from '../../api/hooks'
import { MagnetButton, MagnetLink } from '../../components/Magnet'

export function AccountMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const signOut = useSignOut()
  const [failed, setFailed] = useState(false)
  return (
    <nav className="account" aria-label={t('common.account')}>
      <MagnetLink to="/app/settings" color="paper" size="sm" icon={<SettingsIcon size={16} strokeWidth={2.5} />}>
        {t('common.settings')}
      </MagnetLink>
      <MagnetButton
        color="ink"
        size="sm"
        icon={<LogOut className="flip-rtl" size={16} strokeWidth={2.5} />}
        busy={signOut.isPending}
        onClick={async () => {
          setFailed(false)
          try {
            await signOut.mutateAsync()
            // Router-level navigate still works after the guard unmounts this menu.
            navigate('/', { replace: true })
          } catch {
            setFailed(true)
          }
        }}
      >
        {t('common.signOut')}
      </MagnetButton>
      {failed ? <p className="account__error" role="alert">{t('common.signOutFailed')}</p> : null}
    </nav>
  )
}
