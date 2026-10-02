import { useId, useState, type DragEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Character } from '../../components/Character'
import type { BoardNote, NoteColor } from '../../api/circles'
import { BOARD_COLUMNS, NOTE_MAX, VOTES_PER_MEMBER } from './catalog'
import { useRoom } from './room'

const COLORS: NoteColor[] = ['yellow', 'pink', 'blue', 'green', 'violet']
const DRAG_TYPE = 'application/x-circloo-note'

function NoteCard({ note, columns }: { note: BoardNote; columns: string[] }) {
  const { t } = useTranslation()
  const { me, members, vote, moveNote, deleteNote, editNote } = useRoom()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.text)
  const author = members.find((m) => m.id === note.authorId)
  const mine = note.authorId === me?.id
  const voted = !!me && note.voters.includes(me.id)
  const canDelete = mine || me?.role === 'animator'
  const moveId = useId()

  const onDragStart = (e: DragEvent<HTMLLIElement>) => {
    e.dataTransfer.setData(DRAG_TYPE, String(note.id))
    e.dataTransfer.effectAllowed = 'move'
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const clean = draft.trim()
    if (!clean) return
    try {
      await editNote(note.id, clean)
      setEditing(false)
    } catch {
      // The room shows the error code.
    }
  }

  return (
    <li className={`note-card note-card--${note.color}${voted ? ' is-voted' : ''}`} draggable={!editing} onDragStart={onDragStart}>
      {editing ? (
        <form className="note-card__edit" onSubmit={save}>
          <label className="visually-hidden" htmlFor={`edit-${note.id}`}>{t('boards.edit')}</label>
          <textarea id={`edit-${note.id}`} value={draft} maxLength={NOTE_MAX} dir="auto" rows={3} onChange={(e) => setDraft(e.target.value)} />
          <div className="note-card__edit-actions">
            <button type="button" className="btn btn--subtle btn--sm" onClick={() => { setDraft(note.text); setEditing(false) }}>
              <span className="btn__label">{t('common.cancel')}</span>
            </button>
            <button type="submit" className="btn btn--primary btn--sm"><span className="btn__label">{t('settings.save')}</span></button>
          </div>
        </form>
      ) : (
        <p className="note-card__text" dir="auto">{note.text}</p>
      )}
      <div className="note-card__foot">
        <span className="note-card__author">
          {author ? <Character id={author.character} className="note-card__char" /> : null}
          <bdi>{author?.name ?? ''}</bdi>
        </span>
        <button
          type="button"
          className="note-card__vote"
          aria-pressed={voted}
          aria-label={t('boards.voteFor', { count: note.voters.length, text: note.text.slice(0, 40) })}
          onClick={() => void vote(note.id).catch(() => undefined)}
        >
          <span className="note-card__dots" aria-hidden="true">
            {note.voters.length > 0 ? note.voters.slice(0, 6).map((v) => <span key={v} className="note-card__dot" />) : <span className="note-card__dot is-empty" />}
          </span>
          <span className="note-card__count" aria-hidden="true">{note.voters.length}</span>
        </button>
      </div>
      <div className="note-card__tools">
        <label className="visually-hidden" htmlFor={moveId}>{t('boards.moveTo', { text: note.text.slice(0, 40) })}</label>
        <select id={moveId} className="note-card__move" value={note.column} onChange={(e) => void moveNote(note.id, e.target.value).catch(() => undefined)}>
          {columns.map((c) => <option key={c} value={c}>{t(`boards.columns.${c}`)}</option>)}
        </select>
        {mine && !editing ? (
          <button type="button" className="icon-btn icon-btn--sm" aria-label={t('boards.editNote', { text: note.text.slice(0, 40) })} onClick={() => setEditing(true)}>
            <Pencil size={14} aria-hidden="true" />
          </button>
        ) : null}
        {canDelete ? (
          <button type="button" className="icon-btn icon-btn--sm" aria-label={t('boards.deleteNote', { text: note.text.slice(0, 40) })} onClick={() => void deleteNote(note.id).catch(() => undefined)}>
            <Trash2 size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </li>
  )
}

function AddNote({ column }: { column: string }) {
  const { t } = useTranslation()
  const addNote = useRoom((s) => s.addNote)
  const [text, setText] = useState('')
  const [color, setColor] = useState<NoteColor>('yellow')
  const [busy, setBusy] = useState(false)
  const id = useId()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const clean = text.trim()
    if (!clean || busy) return
    setBusy(true)
    try {
      await addNote(column, clean, color)
      setText('')
    } catch {
      // The room shows the error code.
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="add-note" onSubmit={submit}>
      <label className="visually-hidden" htmlFor={id}>{t('boards.addTo', { column: t(`boards.columns.${column}`) })}</label>
      <textarea
        id={id}
        className={`add-note__input note-card--${color}`}
        rows={2}
        maxLength={NOTE_MAX}
        dir="auto"
        value={text}
        placeholder={t('boards.placeholder')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void submit(e)
          }
        }}
      />
      <div className="add-note__row">
        <div className="add-note__colors" role="radiogroup" aria-label={t('boards.color')}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={t(`boards.colors.${c}`)}
              className={`swatch swatch--${c}`}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <button type="submit" className="btn btn--default btn--sm" aria-disabled={!text.trim() || busy || undefined}>
          <span className="btn__icon" aria-hidden="true"><Plus size={14} /></span>
          <span className="btn__label">{t('boards.add')}</span>
        </button>
      </div>
    </form>
  )
}

/** The live board: columns of sticky notes, a few dots each to vote, drag or "Move to" to reorganise. */
export function Board({ activityId }: { activityId: string }) {
  const { t } = useTranslation()
  const { me, notes, moveNote, error } = useRoom()
  const columns = BOARD_COLUMNS[activityId] ?? []
  const [sort, setSort] = useState<'time' | 'votes'>('time')
  const [over, setOver] = useState<string | null>(null)
  const mine = notes.filter((n) => n.activityId === activityId)
  const used = me ? mine.filter((n) => n.voters.includes(me.id)).length : 0
  const left = Math.max(0, VOTES_PER_MEMBER - used)

  const onDrop = (column: string) => (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    setOver(null)
    const id = Number(e.dataTransfer.getData(DRAG_TYPE))
    const note = mine.find((n) => n.id === id)
    if (note && note.column !== column) void moveNote(id, column).catch(() => undefined)
  }

  return (
    <section className="panel board" aria-labelledby="board-title">
      <div className="panel__head">
        <h2 id="board-title" className="panel__title">{t(`activities.${activityId}.title`)}</h2>
        <div className="board__tools">
          <span className="board__dots" aria-live="polite">
            <span className="board__dot-row" aria-hidden="true">
              {Array.from({ length: VOTES_PER_MEMBER }, (_, i) => <span key={i} className={`note-card__dot${i < left ? '' : ' is-empty'}`} />)}
            </span>
            {t('boards.dotsLeft', { count: left })}
          </span>
          <button type="button" className="btn btn--subtle btn--sm" aria-pressed={sort === 'votes'} onClick={() => setSort((s) => (s === 'votes' ? 'time' : 'votes'))}>
            <span className="btn__label">{t('boards.sortByVotes')}</span>
          </button>
        </div>
      </div>
      {error ? <p className="field__error board__error" role="alert">{t(`circles.errors.${error}`, { defaultValue: t('circles.errors.failed') })}</p> : null}
      <div className={`board__columns board__columns--${columns.length}`}>
        {columns.map((column) => {
          const items = mine
            .filter((n) => n.column === column)
            .sort((a, b) => (sort === 'votes' ? b.voters.length - a.voters.length || a.id - b.id : a.id - b.id))
          const headId = `col-${column}`
          return (
            <section
              key={column}
              className={`board__col board__col--${column}${over === column ? ' is-over' : ''}`}
              aria-labelledby={headId}
              onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setOver(column) } }}
              onDragLeave={() => setOver((o) => (o === column ? null : o))}
              onDrop={onDrop(column)}
            >
              <h3 id={headId} className="board__head">
                {t(`boards.columns.${column}`)} <span className="board__count">{items.length}</span>
              </h3>
              <ul className="board__notes">
                {items.map((n) => <NoteCard key={n.id} note={n} columns={columns} />)}
              </ul>
              <AddNote column={column} />
            </section>
          )
        })}
      </div>
    </section>
  )
}
