import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import QRCode from 'qrcode'
import { Maximize, Minimize } from 'lucide-react'
import { useCircle } from '../../../api/circles'
import { useDocumentTitle } from '../../../app/locale'
import { Panda } from '../../../components/Panda'
import { bindPresentation, receive, useLive, type PresentationState } from './presentation'
import { SlideStage } from './SlideStage'
import '../../../styles/circles.css'
import '../../../styles/present.css'

type Status = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'refused'

/** The circle's join link and a QR code to it, so people in the room can join from their phones. */
function JoinCard({ code }: { code: string }) {
  const { t } = useTranslation()
  const url = `${window.location.origin}/join/${code}`
  const shown = `${window.location.host}/join/${code}`
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: 'M' })
      .then((data) => (live ? setQr(data) : undefined))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [url])
  return (
    <aside className="audience__join" aria-labelledby="audience-join">
      <h2 id="audience-join" className="audience__join-title">{t('present.joinTitle')}</h2>
      {qr ? <img className="audience__qr" src={qr} alt={t('present.qrAlt')} width={480} height={480} /> : null}
      <p className="audience__url"><bdi dir="ltr">{shown}</bdi></p>
    </aside>
  )
}

/** The join card shows except while a question is open for answers (spec 006 US3 #7). */
const showJoin = (state: PresentationState | null) => !state || state.phase !== 'answering'

/**
 * The audience screen for a projector or TV (spec 006 US3 #7): the animator opens it in another window. It follows
 * the presentation with no controls, notes or next slide, and it does not count as someone in the room.
 */
export default function AudienceScreen() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const circle = useCircle(id)
  const state = useLive((s) => s.state)
  const [status, setStatus] = useState<Status>('connecting')
  const [full, setFull] = useState(false)
  const [idle, setIdle] = useState(false)
  const root = useRef<HTMLElement>(null)
  useDocumentTitle('present.audienceTitle')

  useEffect(() => {
    if (!id) return
    const connection = new HubConnectionBuilder().withUrl('/hubs/circle').withAutomaticReconnect().configureLogging(LogLevel.Error).build()
    bindPresentation(connection)
    const enter = async () => {
      try {
        receive(await connection.invoke<PresentationState | null>('EnterAudience', id))
        setStatus('live')
      } catch (e) {
        // Only a refusal means "not the animator"; anything else is the network.
        setStatus(e instanceof Error && e.message.includes('animator-only') ? 'refused' : 'offline')
      }
    }
    connection.onreconnecting(() => setStatus('reconnecting'))
    connection.onreconnected(() => void enter())
    connection.onclose(() => setStatus((s) => (s === 'refused' ? s : 'offline')))
    let cancelled = false
    connection
      .start()
      .then(() => (cancelled ? undefined : enter()))
      .catch(() => (cancelled ? undefined : setStatus('offline')))
    return () => {
      cancelled = true
      useLive.getState().reset()
      void connection.stop()
    }
  }, [id])

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === root.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // The pointer hides after a few still seconds, as on any projector.
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), 3000)
    const wake = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), 3000)
    }
    window.addEventListener('pointermove', wake)
    window.addEventListener('keydown', wake)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [])

  const code = circle.data?.joinCode
  const join = code && status !== 'refused' && showJoin(state)
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void root.current?.requestFullscreen?.()
  }

  return (
    <main ref={root} className={['audience', join ? 'has-join' : '', idle ? 'is-idle' : ''].filter(Boolean).join(' ')} data-status={status}>
      <h1 className="visually-hidden">{t('present.audienceTitle')}</h1>
      <div className="audience__screen">
        {status === 'refused' ? (
          <div className="audience__wait"><p>{t('present.audienceRefused')}</p></div>
        ) : state ? (
          <SlideStage state={state} className="audience__stage" />
        ) : (
          <div className="audience__wait">
            <Panda thinking className="audience__panda" />
            <p>{t('present.waitTitle')}</p>
          </div>
        )}
      </div>
      {join ? <JoinCard code={code} /> : null}
      {status === 'reconnecting' || status === 'offline' ? (
        <p className="audience__status" role="status">{t(status === 'offline' ? 'present.offline' : 'present.reconnecting')}</p>
      ) : null}
      {document.fullscreenEnabled ? (
        <button type="button" className="audience__full" onClick={toggleFull} aria-label={full ? t('present.exitFullscreen') : t('present.fullscreen')}>
          {full ? <Minimize size={20} aria-hidden="true" /> : <Maximize size={20} aria-hidden="true" />}
        </button>
      ) : null}
    </main>
  )
}
