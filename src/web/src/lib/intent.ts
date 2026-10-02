import type { Audience, Kind, Tone } from '../api/sparks'
import type { Locale } from '../i18n'

/**
 * The Ask bar's planner. Turns plain words (en/fr/es/ar) into a short plan of steps the person
 * checks before anything runs. Deterministic and local: no text leaves the browser to plan.
 */
export type Step =
  | { type: 'go'; to: 'home' | 'icebreakers' | 'settings' }
  | { type: 'audience'; value: Audience }
  | { type: 'tone'; value: Tone }
  | { type: 'kind'; value: Kind }
  | { type: 'kidsSafe' }
  | { type: 'deal' }
  | { type: 'people'; names: string[] }
  | { type: 'start' }
  | { type: 'ask'; theme: string }
  | { type: 'locale'; value: Locale }
  | { type: 'theme'; value: 'light' | 'dark' }

const THEME_MAX = 60

/** Lowercase, strip Latin accents and Arabic diacritics, unify alef forms. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ًͯ-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .normalize('NFC')
}

const ARABIC_PREFIXES = ['وال', 'بال', 'لل', 'ال', 'و', 'ب', 'ل']

/** Words of the folded text, with Arabic articles and conjunctions peeled off as extra forms. */
function words(folded: string): Set<string> {
  const out = new Set<string>()
  for (const w of folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    out.add(w)
    for (const p of ARABIC_PREFIXES) if (w.startsWith(p) && w.length > p.length + 1) out.add(w.slice(p.length))
  }
  return out
}

type Lexicon<T extends string> = Record<T, string[]>

const AUDIENCE: Lexicon<Audience> = {
  family: ['family', 'families', 'famille', 'familia', 'عائله', 'اسره', 'عيله'],
  friends: ['friend', 'friends', 'ami', 'amis', 'amie', 'amies', 'copains', 'amigo', 'amigos', 'amigas', 'اصدقاء', 'صديق', 'اصحاب'],
  work: ['work', 'team', 'colleagues', 'coworkers', 'office', 'travail', 'equipe', 'collegues', 'boulot', 'trabajo', 'equipo', 'companeros', 'oficina', 'عمل', 'فريق', 'زملاء'],
}
const TONE: Lexicon<Tone> = {
  silly: ['silly', 'funny', 'fun', 'drole', 'rigolo', 'rigolote', 'marrant', 'gracioso', 'divertido', 'graciosa', 'مضحك', 'مضحكه', 'طريف'],
  cozy: ['cozy', 'cosy', 'warm', 'gentle', 'douillet', 'doux', 'chaleureux', 'acogedor', 'acogedora', 'calido', 'دافئ', 'دافئه', 'لطيف'],
  deep: ['deep', 'serious', 'profond', 'profonde', 'profundo', 'profunda', 'عميق', 'عميقه'],
}
const KIND: Lexicon<Kind> = {
  joke: ['joke', 'jokes', 'blague', 'blagues', 'chiste', 'chistes', 'نكته', 'نكت', 'نكات'],
  riddle: ['riddle', 'riddles', 'devinette', 'devinettes', 'enigme', 'adivinanza', 'adivinanzas', 'لغز', 'الغاز'],
  'would-you-rather': ['rather', 'preferes', 'prefieres', 'تفضل'],
  icebreaker: ['icebreaker', 'icebreakers', 'brise', 'rompehielos', 'question', 'questions', 'pregunta', 'preguntas', 'سؤال', 'اسئله', 'الجليد'],
}
const KIDS = ['kid', 'kids', 'child', 'children', 'enfant', 'enfants', 'nino', 'ninos', 'ninas', 'اطفال', 'طفل', 'صغار']
const LOCALE: Lexicon<Locale> = {
  en: ['english', 'anglais', 'ingles', 'الانجليزيه', 'انجليزي'],
  fr: ['french', 'francais', 'frances', 'الفرنسيه', 'فرنسي'],
  es: ['spanish', 'espagnol', 'espanol', 'الاسبانيه', 'اسباني'],
  ar: ['arabic', 'arabe', 'العربيه', 'عربي', 'عربيه'],
}
// Strong words name a theme on their own; weak ones (night, day) only next to a theme word, so "esta noche" stays a time.
const NIGHT_STRONG = ['dark', 'sombre', 'oscuro', 'oscura', 'داكن']
const NIGHT = ['night', 'nuit', 'noche', 'ليل', 'ليلي', 'ليليه']
const DAY_STRONG = ['light', 'clair', 'claro', 'clara', 'فاتح']
const DAY = ['day', 'jour', 'dia', 'نهار', 'نهاري', 'نهاريه']
const THEME_WORDS = ['mode', 'theme', 'swim', 'baignade', 'modo', 'tema', 'bano', 'سباحه', 'وضع', 'سمه']
// A "with …" that talks about cards or a whole audience ("with the family") is not a list of people.
const NOT_PEOPLE = ['card', 'cards', 'carte', 'cartes', 'tarjeta', 'tarjetas', 'بطاقه', 'بطاقات', 'ai', 'ia', 'ذكاء']
const SETTINGS = ['settings', 'parametres', 'reglages', 'ajustes', 'configuracion', 'اعدادات']
const HOME = ['home', 'accueil', 'inicio', 'رئيسيه']
const ROUND = ['round', 'tour', 'ronda', 'turns', 'جوله', 'meeting', 'reunion']
const DEAL = ['deal', 'draw', 'another', 'next', 'tire', 'tirer', 'autre', 'saca', 'otra', 'اسحب', 'اخرى']

// Terms are folded the same way as the text (hamza seats lose their hamza, for instance).
const pick = <T extends string>(w: Set<string>, lex: Lexicon<T>): T | undefined =>
  (Object.keys(lex) as T[]).find((k) => has(w, lex[k]))
const has = (w: Set<string>, list: string[]) => list.some((term) => w.has(fold(term)))

/** "with A, B and C" in four languages; names keep their original spelling. */
const PEOPLE_RE = /(?:^|\s)(?:with|avec|con|مع)\s+(.+?)(?=\s+(?:about|sur|sobre|عن)\s|$)/iu
const ABOUT_RE = /(?:^|\s)(?:about|sur|sobre|عن)\s+(.+)$/iu
const SPLIT_RE = /\s*(?:,|،|\band\b|\bet\b|\by\b|\s+و\s*)\s*/iu

export function plan(input: string): Step[] {
  const text = input.trim()
  if (!text) return []
  const folded = fold(text)
  const w = words(folded)
  const steps: Step[] = []

  const locale = pick(w, LOCALE)
  if (locale) steps.push({ type: 'locale', value: locale })
  const themed = has(w, THEME_WORDS)
  if (has(w, NIGHT_STRONG) || (themed && has(w, NIGHT))) steps.push({ type: 'theme', value: 'dark' })
  else if (has(w, DAY_STRONG) || (themed && has(w, DAY))) steps.push({ type: 'theme', value: 'light' })

  const audience = pick(w, AUDIENCE)
  const tone = pick(w, TONE)
  const kind = pick(w, KIND)
  const kids = has(w, KIDS)
  const withWhom = text.match(PEOPLE_RE)?.[1]
  const people = (withWhom && !has(words(fold(withWhom)), [...NOT_PEOPLE, ...Object.values(AUDIENCE).flat()]) ? withWhom : '')
    .split(SPLIT_RE)
    .map((n) => n.trim())
    .filter((n) => n.length > 0 && n.length <= 24)
    .slice(0, 30)
  const about = text.match(ABOUT_RE)?.[1]?.trim().replace(/[.!?؟]+$/u, '').slice(0, THEME_MAX)
  const round = has(w, ROUND) || people.length >= 2
  const deck = Boolean(audience || tone || kind || kids || has(w, DEAL) || about || round)

  if (deck) {
    steps.push({ type: 'go', to: 'icebreakers' })
    if (audience) steps.push({ type: 'audience', value: audience })
    if (tone) steps.push({ type: 'tone', value: tone })
    if (kind) steps.push({ type: 'kind', value: kind })
    if (kids) steps.push({ type: 'kidsSafe' })
    if (about) steps.push({ type: 'ask', theme: about })
    else steps.push({ type: 'deal' })
    if (people.length) steps.push({ type: 'people', names: people })
    if (round && people.length >= 2) steps.push({ type: 'start' })
  } else if (has(w, SETTINGS)) steps.push({ type: 'go', to: 'settings' })
  else if (has(w, HOME)) steps.push({ type: 'go', to: 'home' })

  return steps
}
