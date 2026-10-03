# Quickstart: validate polls, Q&A and forms (007)

## Prerequisites

- Local stack: `dotnet run --project src/Circloo.AppHost` (Postgres, Mailpit, API, Vite). No cloud service needed.
- Three browsers or devices: the animator (signed in) and two participants (guests via the join link). One of them in
  Arabic.

## A. Poll (US1)

1. Create a circle with **Poll**, **Q&A** and **Feedback form** enabled; open the room; two guests join.
2. Start **Poll**: question "Where do we eat?", options Pizza / Sushi / Tacos, single choice, results live → Open.
3. Guests vote Pizza and Sushi: bars move on all three screens within a second; percentages show 50 / 50 / 0.
4. One guest changes to Pizza: 100 / 0 / 0, still "2 votes".
5. New poll with "show results when the vote closes": guests see only "n votes"; the animator sees the bars.
6. Close: everyone sees the final result, the most chosen marked by icon and label; voting again says it is closed.

Expected: one vote per person in the database (`PollVote` unique), percentages always 100 in total.

## B. Q&A (US2)

1. Start **Q&A**, allow anonymous questions.
2. Guest 1 asks "Can we move the retro to Friday?"; guest 2 asks anonymously "Who owns the budget?".
3. Guest 2 upvotes question 1; question 1 moves to the top; guest 1 cannot upvote their own question.
4. The animator answers question 1 with "Yes, Friday 10:00": it moves to Answered for everyone.
5. A question with unkind words is refused with a kind message and never appears.
6. The animator hides question 2: it disappears for the guests.

## C. Feedback form (US3)

1. Open **My forms** (`/app/forms`), build "Session feedback": rating 1–5 (stars), recommend 0–10, single choice
   (Too short / Just right / Too long), yes/no "Would you come again?", long text "Anything else?" (optional). Save.
2. In the room start **Feedback form**, pick "Session feedback", open it.
3. Guests answer (one skips the optional text); a required question left empty is pointed out next to it.
4. The animator sees "2 of 2 responded", the rating average and distribution, the recommend score with promoters /
   passives / detractors, choice percentages, and the free-text answers without names.
5. Close, then **Share the summary**: guests see every summary except free text.

## D. Results (US4)

1. With a connected integration (or the local stand-in), **Send results**: the export lists the poll results, the
   Q&A questions with upvotes and answers (anonymous stays anonymous), and the form summary.

## Automated checks

- `dotnet test` (unit: percentages, form summary, validation; integration: hub rules, uniqueness under parallel calls,
  privacy of hidden results and anonymous authors).
- `npm test` in `src/web` and `npx playwright test e2e/decide.spec.ts` (en desktop + ar phone, axe).
