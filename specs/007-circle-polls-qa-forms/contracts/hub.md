# Hub contract: polls, Q&A and forms in a circle (007)

Extends the circle hub (`/hubs/circle`, `CircleHub` / `ICircleClient`). `Enter` also joins the caller to `member:{memberId}`, the group used for `MyVote`, `MyUpvote` and `MyResponse` (all
of a member's tabs and devices). Every method re-resolves the caller's
membership; refusals are `HubException` codes. Animator-only methods refuse others with `animator-only`; methods for
participants refuse the animator with `animator-cannot-answer`. Any text is cleaned and safety-filtered
(`message-invalid`, `message-unsafe`). Rate limits answer `slow-down`.

## Poll (activity `poll` current)

| Method | Who | Effect | Errors |
|---|---|---|---|
| `CreatePoll(PollInput)` | animator | Draft poll; returns `PollView` | `poll-invalid`, `activity-invalid` |
| `UpdatePoll(Guid pollId, PollInput)` | animator | Edit a draft | `poll-not-draft` |
| `OpenPoll(Guid pollId)` | animator | Opens it; closes any other open poll | `poll-not-draft` |
| `ClosePoll(Guid pollId)` | animator | Closes it; final results to everyone | `poll-not-open` |
| `Vote(Guid pollId, string[] options)` | participant | Upsert own vote | `poll-not-open`, `invalid-options` |

`PollInput = { question, options: string[], multipleChoice, resultsLive }` (2–6 options; ids assigned by the server).

Events:

```ts
type PollView = { id: string; question: string; options: { id: string; text: string }[]; multipleChoice: boolean
  resultsLive: boolean; state: 'draft' | 'open' | 'closed'; myVote?: string[] }
type PollResults = { pollId: string; votes: number
  options: { id: string; count: number; percent: number; winner: boolean }[] }
```

| Event | To | When |
|---|---|---|
| `PollChanged(PollView)` | circle group (drafts: animator group only) | create/edit (draft), open, close |
| `PollResults(PollResults)` | circle group if `resultsLive` or closed, else animator group | after each vote (throttled 4/s) and on close |
| `PollCount(pollId, votes)` | circle group when results are hidden | after each vote (throttled 4/s) |
| `MyVote(pollId, options)` | the voter's connections | after their vote |

## Q&A (activity `qa` current)

| Method | Who | Effect | Errors |
|---|---|---|---|
| `SetQaAnonymous(bool allow)` | animator | Allows anonymous questions from now on | |
| `Ask(string text, bool anonymous)` | participant | New question | `anonymous-off`, `slow-down` (5/min) |
| `Upvote(long questionId)` | participant | Toggles own upvote | `own-question`, `question-closed` (hidden) |
| `AnswerQuestion(long questionId, string? answer)` | animator | Marks answered, optional answer ≤ 500 | `question-invalid` |
| `ReopenQuestion(long questionId)` | animator | Back to open | |
| `HideQuestion(long questionId, bool hidden)` | animator | Hide/unhide | |

```ts
type QaQuestionView = { id: number; text: string; author?: { memberId: string; name: string; character: string } // omitted when anonymous
  upvotes: number; state: 'open' | 'answered' | 'hidden'; answer?: string; createdAt: string; answeredAt?: string; mine: boolean; upvotedByMe: boolean }
```

| Event | To | When |
|---|---|---|
| `QaChanged(QaQuestionView)` | circle group; for a hidden question, the animator group only | ask, answer, reopen, unhide, upvote count change (throttled 4/s per question) |
| `QaRemoved(id)` | circle group | hidden: sent first to everyone, then `QaChanged(state: hidden)` to the animator group, which keeps the question in its moderation list |
| `QaSettings(allowAnonymous)` | circle group | animator changes it |

`mine` and `upvotedByMe` are computed per connection: broadcasts carry `mine: false, upvotedByMe: false`, and clients
merge with their own state (`MyUpvote(questionId, on)` to the voter's connections).

## Feedback form (activity `feedback` current)

| Method | Who | Effect | Errors |
|---|---|---|---|
| `CreateForm(FormInput)` / `CreateFormFromSaved(Guid savedFormId)` | animator | Draft form in the circle (copy) | `form-invalid`, `not-found` |
| `UpdateForm(Guid formId, FormInput)` | animator | Edit a draft | `form-not-draft` |
| `OpenForm(Guid formId)` / `CloseForm(Guid formId)` | animator | State changes; one open per circle | `form-not-draft`, `form-not-open` |
| `ShareFormSummary(Guid formId, bool shared)` | animator | Only when closed (clarification Q3) | `form-not-closed` |
| `SubmitForm(Guid formId, Dictionary<string, JsonElement> answers)` | participant | Upsert own response | `form-not-open`, `answers-invalid` (field codes: `required`, `out-of-range`, `too-long`, `message-unsafe`), `slow-down` (1/s) |

`FormInput = { title?, showNames, questions: FormQuestionInput[] }` per data-model.md.

| Event | To | When |
|---|---|---|
| `FormChanged(FormView)` | circle group (drafts: animator group only) | create/edit, open, close, share/unshare |
| `FormCount({ formId, responded, of, pending })` | animator group | after each response (throttled 4/s), on open |
| `MyResponse(formId, answers)` | the participant's connections | after their submit |
| `FormSummaryShared(FormSummaryView)` | circle group | the animator shares (summaries without free text) |

Privacy (FR-711/716/717): no raw votes or responses reach members; hidden poll results go to the animator group only;
anonymous questions never carry an author; free-text answers go only to the animator (via REST summary).

Ending: `StartActivity`/`EndActivity` close an open poll or form (answers kept) and broadcast `PollChanged`/`FormChanged`.
