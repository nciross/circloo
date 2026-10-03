import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import QRCode from 'qrcode'
import { useCircle } from '../../../api/circles'
import { useDocumentTitle } from '../../../app/locale'
import { Panda } from '../../../components/Panda'
import { bindPresentation, receive, useLive, type PresentationState } from './presentation'
import { SlideStage } from './SlideStage'
import '../../../styles/present.css'

/** The circle's join code and a QR code to it, so people in the room can join from their phones. */
function JoinCard({ code }: { code: string }) {
  const { t } = useTranslation()
  const url = `${window.location.origin}/join/${code}`
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
      .then((data) => (live ? setQr(data) : undefined))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [url])
  return (
    <aside className="audience__join" aria-label={t('present.joinTitle')}>
      {qr ? <img className="audience__qr" src={qr} alt={t('present.qrAlt')} width={160} height={160} /> : null}
      <p className="audience__join-text">
        <span>{t('present.joinAt', { host: window.location.host })}</span>
        <span className="audience__code" dir="ltr">{code}</span>
      </p>
    </aside>
  )
}

/** Whether nothing is being asked right now: the join code shows only between questions (spec 006 US3 #7). */
const betweenQuestions = (state: PresentationState | null) => !state || state.slide.kind === 'deck' || state.blank

/**
 * The audience screen for a projector or TV (spec 006 US3 #7): the animator opens it in another window. It follows
 * the presentation with no controls, notes or next slide, and it does not count as someone in the room.
 */
export default function AudienceScreen() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const circle = useCircle(id)
  const state = useLive((s) => s.state)
  const [status, setStatus] = useState<'connecting' | 'live' | 'refused'>('connecting')
  useDocumentTitle('present.audienceTitle')

  useEffect(() => {
    if (!id) return
    const connection = new HubConnectionBuilder().withUrl('/hubs/circle').withAutomaticReconnect().configureLogging(LogLevel.Warning).build()
    bindPresentation(connection)
    const enter = async () => {
      receive(await connection.invoke<PresentationState | null>('EnterAudience', id))
      setStatus('live')
    }
    connection.onreconnected(() => enter().catch(() => setStatus('refused')))
    let cancelled = false
    connection
      .start()
      .then(() => (cancelled ? undefined : enter()))
      .catch(() => (cancelled ? undefined : setStatus('refused')))
    return () => {
      cancelled = true
      useLive.getState().reset()
      void connection.stop()
    }
  }, [id])

  const code = circle.data?.joinCode

  return (
    <main className="audience" data-status={status}>
      {status === 'refused' ? (
        <div className="audience__wait">
          <p>{t('present.audienceRefused')}</p>
        </div>
      ) : state ? (
        <SlideStage state={state} className="audience__stage" />
      ) : (
        <div className="audience__wait">
          <Panda thinking className="audience__panda" />
          <p>{t('present.waitTitle')}</p>
        </div>
      )}
      {code && betweenQuestions(state) ? <JoinCard code={code} /> : null}
    </main>
  )
}
