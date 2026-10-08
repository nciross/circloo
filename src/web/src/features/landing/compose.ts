import { AUDIENCE, KIDS, LOCALE, fold, has, pick, words } from '../../lib/intent'
import type { Locale } from '../../i18n'

/**
 * The landing's composer (issue #247): one plain line in en/fr/es/ar becomes a circle to preview, deterministic and
 * local, so nothing leaves the browser. The new-circle page runs the same rules to prefill the form ("Describe it").
 * The model-backed version (Foundry) is a separate feature; this one never claims to be AI.
 */
export type Audience = 'family' | 'friends' | 'team'
export type NameKey = 'retro' | 'brainstorm' | 'decide' | 'present' | 'feedback' | 'kudos' | 'kids' | 'mood' | Audience

export interface Composition {
  /** A localised name template: `landing.made.names.<key>`. */
  name: NameKey
  audience: Audience
  people: number
  /** Activity ids from the catalog, an icebreaker first, four at most. */
  activities: string[]
  locale: Locale
}

export const PEOPLE_MIN = 2
export const PEOPLE_MAX = 100
export const MAX_PICKS = 4
const DEFAULT_PEOPLE: Record<Audience, number> = { family: 5, friends: 6, team: 8 }

/** Activity words, in catalog order so the picked list reads like the catalog. Terms are folded like the text. */
const ACTIVITY_WORDS: [string, string[]][] = [
  ['quick-question', ['icebreaker', 'icebreakers', 'brise', 'glace', 'rompehielos', 'الجليد', 'warmup', 'warm', 'echauffement', 'calentamiento', 'تسخين']],
  ['would-you-rather', ['rather', 'preferes', 'prefieres', 'تفضل']],
  ['joke-round', ['joke', 'jokes', 'blague', 'blagues', 'chiste', 'chistes', 'نكته', 'نكت', 'نكات', 'laugh', 'laughs', 'funny', 'rire', 'rigoler', 'drole', 'reir', 'risas', 'gracioso', 'ضحك', 'مضحك']],
  ['riddle-time', ['riddle', 'riddles', 'devinette', 'devinettes', 'enigme', 'enigmes', 'adivinanza', 'adivinanzas', 'لغز', 'الغاز']],
  ['two-truths', ['truths', 'verites', 'verdades', 'حقيقتان', 'حقيقتين']],
  ['one-word', ['energy', 'energizer', 'energizers', 'energie', 'energia', 'wake', 'reveil', 'طاقه', 'نشاط']],
  ['mood-weather', ['mood', 'moods', 'feel', 'feels', 'feeling', 'feelings', 'humeur', 'moral', 'animo', 'sentimos', 'مزاج', 'حال', 'weather', 'meteo', 'tiempo', 'طقس', 'checkin', 'check']],
  ['story-chain', ['story', 'stories', 'histoire', 'histoires', 'historia', 'cuento', 'قصه', 'قصص']],
  ['start-stop-continue', ['retro', 'retros', 'retrospective', 'retrospectives', 'retrospectiva', 'مراجعه', 'sprint', 'improve', 'ameliorer', 'mejorar', 'نحسن']],
  ['kudos', ['kudos', 'thanks', 'thank', 'merci', 'remercier', 'bravo', 'gracias', 'agradecer', 'شكر', 'شكرا', 'celebrate', 'celebrer', 'celebrar', 'احتفال', 'نحتفل']],
  ['quick-poll', ['decide', 'decision', 'decisions', 'decider', 'decidir', 'vote', 'votes', 'voter', 'votar', 'poll', 'sondage', 'encuesta', 'choose', 'choisir', 'elegir', 'تصويت', 'قرار', 'نقرر', 'نختار']],
  ['brainstorm', ['brainstorm', 'brainstorming', 'idea', 'ideas', 'idee', 'idees', 'lluvia', 'فكره', 'افكار', 'عصف']],
  ['canvas', ['canvas', 'whiteboard', 'board', 'tableau', 'toile', 'pizarra', 'lienzo', 'لوحه', 'سبوره']],
  ['feedback', ['feedback', 'avis', 'retours', 'opinion', 'opiniones', 'satisfaction', 'satisfaccion', 'راي', 'ملاحظات']],
  ['presentation', ['present', 'presentation', 'presentations', 'presenter', 'slides', 'diapos', 'presentacion', 'diapositivas', 'quiz', 'عرض', 'شرائح', 'اختبار']],
]
const ICEBREAKERS = new Set(['quick-question', 'would-you-rather', 'joke-round', 'riddle-time', 'two-truths'])
const TEAM_HINTS = ['standup', 'stand', 'meeting', 'reunion', 'colleagues', 'collegues', 'companeros', 'زملاء', 'اجتماع', 'فريقي', 'فريقنا', 'sprint', 'office', 'bureau', 'oficina', 'مكتب']
const FAMILY_HINTS = ['grandma', 'grandpa', 'mamie', 'papi', 'abuela', 'abuelo', 'جده', 'جد', 'cousins', 'cousin', 'primos', 'parents', 'padres', 'والدين', 'sunday', 'dimanche', 'domingo', 'الاحد', 'dinner', 'diner', 'cena', 'عشاء', 'lunch', 'dejeuner', 'comida', 'غداء']
const FRIENDS_HINTS = ['game', 'games', 'jeu', 'jeux', 'juego', 'juegos', 'لعبه', 'العاب', 'party', 'soiree', 'fiesta', 'سهره', 'night', 'nuit', 'noche', 'ليله']

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
  deux: 2, trois: 3, quatre: 4, cinq: 5, six_fr: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12,
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12,
  اثنان: 2, اثنين: 2, ثلاثه: 3, اربعه: 4, خمسه: 5, سته: 6, سبعه: 7, ثمانيه: 8, تسعه: 9, عشره: 10,
}

function peopleIn(text: string, w: Set<string>, audience: Audience): number {
  const digits = text.match(/\d{1,3}/u)
  if (digits) {
    const n = Number(digits[0])
    if (n >= PEOPLE_MIN && n <= PEOPLE_MAX) return n
  }
  for (const word of w) {
    const n = NUMBER_WORDS[word]
    if (n) return n
  }
  return DEFAULT_PEOPLE[audience]
}

const Q_AND_A = /\bq\s*(?:&|\/|and|et|y|و)\s*a\b/iu

export function compose(input: string, current: Locale): Composition {
  const text = input.trim()
  const w = words(fold(text))

  let activities = ACTIVITY_WORDS.filter(([, terms]) => has(w, terms)).map(([id]) => id)
  if (Q_AND_A.test(text)) activities.push('qa')
  const kids = has(w, KIDS)
  if (kids) activities = [...new Set(['joke-round', 'riddle-time', ...activities])]

  const named = pick(w, AUDIENCE)
  let audience: Audience | undefined = named === 'work' ? 'team' : named
  if (!audience && has(w, FAMILY_HINTS)) audience = 'family'
  if (!audience && has(w, TEAM_HINTS)) audience = 'team'
  if (!audience && has(w, FRIENDS_HINTS)) audience = 'friends'
  if (!audience && kids) audience = 'family'
  if (!audience) {
    audience = activities.some((a) => ['start-stop-continue', 'brainstorm', 'presentation', 'feedback', 'kudos', 'quick-poll', 'canvas', 'qa'].includes(a))
      ? 'team'
      : activities.includes('mood-weather') ? 'family' : 'friends'
  }

  if (activities.length === 0) {
    activities = audience === 'team' ? ['quick-question', 'start-stop-continue'] : audience === 'family' ? ['quick-question', 'mood-weather'] : ['joke-round', 'would-you-rather']
  } else if (!activities.some((a) => ICEBREAKERS.has(a))) {
    activities.unshift(audience === 'friends' ? 'joke-round' : 'quick-question')
  } else {
    // The icebreaker opens, whatever the order of the words.
    const first = activities.find((a) => ICEBREAKERS.has(a))!
    activities = [first, ...activities.filter((a) => a !== first)]
  }
  activities = activities.slice(0, MAX_PICKS)

  const name: NameKey = activities.includes('start-stop-continue') ? 'retro'
    : activities.includes('brainstorm') ? 'brainstorm'
    : activities.includes('quick-poll') ? 'decide'
    : activities.includes('presentation') ? 'present'
    : activities.includes('feedback') ? 'feedback'
    : activities.includes('kudos') ? 'kudos'
    : kids ? 'kids'
    : activities.includes('mood-weather') ? 'mood'
    : audience

  return { name, audience, people: peopleIn(text, w, audience), activities, locale: pick(w, LOCALE) ?? current }
}

/** Seats to draw on the preview ring: the first eight, and how many more there are. */
export function seatsFor(people: number): { shown: number; more: number } {
  const shown = Math.min(8, Math.max(PEOPLE_MIN, people))
  return { shown, more: Math.max(0, people - shown) }
}
