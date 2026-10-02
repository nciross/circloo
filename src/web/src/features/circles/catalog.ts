import {
  Award, BookOpen, CloudSun, Laugh, ListChecks, MessageCircleQuestion, Puzzle, Scale, Split, ThumbsUp, Type, Vote, VenetianMask,
  type LucideIcon,
} from 'lucide-react'

export type Category = 'icebreakers' | 'energizers' | 'retro' | 'decide'

export interface Activity {
  id: string
  category: Category
  icon: LucideIcon
}

/** Mirrors the server catalog (Circloo.Api/Circles/ActivityCatalog.cs); titles and blurbs live in i18n `activities.*`. */
export const ACTIVITIES: Activity[] = [
  { id: 'quick-question', category: 'icebreakers', icon: MessageCircleQuestion },
  { id: 'would-you-rather', category: 'icebreakers', icon: Scale },
  { id: 'joke-round', category: 'icebreakers', icon: Laugh },
  { id: 'riddle-time', category: 'icebreakers', icon: Puzzle },
  { id: 'two-truths', category: 'icebreakers', icon: VenetianMask },
  { id: 'one-word', category: 'energizers', icon: Type },
  { id: 'mood-weather', category: 'energizers', icon: CloudSun },
  { id: 'story-chain', category: 'energizers', icon: BookOpen },
  { id: 'start-stop-continue', category: 'retro', icon: ListChecks },
  { id: 'went-well', category: 'retro', icon: ThumbsUp },
  { id: 'kudos', category: 'retro', icon: Award },
  { id: 'quick-poll', category: 'decide', icon: Vote },
  { id: 'agree-or-not', category: 'decide', icon: Split },
]

export const CATEGORIES: Category[] = ['icebreakers', 'energizers', 'retro', 'decide']
export const MAX_ACTIVITIES = 8

export const activityById = (id: string | null | undefined) => ACTIVITIES.find((a) => a.id === id)
