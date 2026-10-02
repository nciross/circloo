# Hub contract: presenting in a circle (006)

Extends the existing circle hub (`/hubs/circle`, `CircleHub` / `ICircleClient`). Every method re-resolves the caller's
membership (`CurrentAsync`) and refuses with `HubException` codes, as boards do.

## Client → server

| Method | Who | Effect | Errors |
|---|---|---|---|
| `StartPresentation(Guid presentationId)` | animator | Requires a `ready` presentation owned by the animator's user; ends any active session; creates a session with the snapshot (visible slides only); sets `Circle.CurrentActivity = "presentation"`; broadcasts `Activity` + `PresentationState` | `animator-only`, `presentation-not-ready`, `presentation-empty` |
| `GoToSlide(int position)` | animator | Moves (0 ≤ position < count); `Phase = idle`, `Blank = false`; bumps `MaxPosition` | `out-of-range`, `no-session` |
| `SetBlank(bool blank)` | animator | Blank on/off | `no-session` |
| `OpenQuestion()` | animator | Current slide must be a question in `idle`; `Phase = answering`, `OpenedAt = now`, quiz `Deadline = now + timer`; schedules the quiz lock | `not-a-question`, `already-open` |
| `LockQuestion()` | animator | `answering → locked` | `not-answering` |
| `RevealResults()` | animator | Locks if needed; `Phase = revealed`; broadcasts `Results` | `not-open` |
| `ShowPodium()` | animator | Quiz slide in `revealed`, presentation `ShowPodium`; `Phase = podium`; broadcasts `Podium` | `podium-off`, `not-revealed` |
| `EndPresentation()` | animator | `EndedAt = now`; activity cleared; broadcasts `PresentationEnded` | `no-session` |
| `Answer(Guid slideId, string[] options)` | participant | Upsert under the rules of data-model.md; replies to the caller with `MyAnswer`; sends `AnswerCount` to animator + audience (and `Results` live for `showLive` polls) | `answers-closed`, `not-current-question`, `invalid-options`, `quiz-final`, `animator-cannot-answer` |
| `EnterAudience(Guid circleId)` | animator (user session) | Joins `circle:{id}` and `audience:{id}` groups without presence; returns current `PresentationView` | `animator-only` |

`Enter(circleId)` (existing) additionally returns/pushes the current `PresentationState` and, for participants,
`MyAnswer` for the open question, so reloads and late joiners land in place (FR-608).

## Server → client (`ICircleClient` additions)

```ts
type PresentationState = {
  sessionId: string; presentationName: string
  position: number; count: number; blank: boolean
  slide:
    | { kind: 'deck'; slideId: string; image: string }
    | { kind: 'poll' | 'quiz'; slideId: string; question: string; options: { id: string; text: string }[]
        multipleChoice: boolean; timerSeconds?: number; showFirst: boolean; showLive: boolean }
  phase: 'idle' | 'answering' | 'locked' | 'revealed' | 'podium'
  openedAt?: string; deadline?: string; serverNow: string   // clients correct countdown skew with serverNow
  results?: Results                                          // set when revealed (or live polls)
  podium?: Podium                                            // set in podium phase
}
type Results = {
  total: number
  options: { id: string; count: number; percent: number; winner: boolean; correct?: boolean }[]
  first?: { memberId: string; name: string; character: string; ms: number }   // only when showFirst
}
type Podium = { places: { rank: number; memberId: string; name: string; character: string; points: number }[] }
type AnswerCount = { answered: number; of: number; pending: string[] }        // member ids, animator/audience only
type MyAnswer = { slideId: string; options: string[]; correct?: boolean; points?: number; rank?: number }
```

| Event | To | When |
|---|---|---|
| `PresentationState(state)` | circle group | every change of slide, blank, phase, results, podium |
| `AnswerCount(count)` | animator connections + `audience:{id}` | after each answer, throttled to 4/s |
| `MyAnswer(answer)` | the answering connection(s) of that member | after their answer; after reveal (correct, points); after podium (rank) |
| `PresenterNotes(slideId, notes?, next?)` | animator connections only | on every move: notes of the current slide and a preview of the next one |
| `PresentationEnded()` | circle group | session ended or presentation deleted |

Privacy rules (FR-612/614): before reveal, nothing about counts reaches participants unless `showLive`; `first` is
omitted when `showFirst` is false; `pending` lists ids only to the animator and the audience screen; notes and the
next slide never reach participants or the audience.
