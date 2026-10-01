import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { LogOut, Settings as SettingsIcon } from 'lucide-react'
import { useSignOut } from '../../api/hooks'
import { MagnetButton, MagnetLink } from '../../components/Magnet'

export function AccountMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const signOut = useSignOut()
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
          // Router-level navigate still works after the guard unmounts this menu.
          await signOut.mutateAsync().catch(() => undefined)
          navigate('/', { replace: true })
        }}
      >
        {t('common.signOut')}
      </MagnetButton>
    </nav>
  )
}
