---
description: "Tasks for 003 live circles"
---

# Tasks: Live circles

**Input**: `specs/003-live-circles/` · **Tests**: required (constitution VI)

## Phase 1: Foundational
- [ ] T301 Circle, CircleMember, CircleMessage entities + migration; guest cookie scheme behind a policy scheme; default policy requires the user claim; activity catalog data (API + 4 locales) (#67)
- [ ] T302 Circle API: create, mine, get, close, join-info, join (guest or user), rate limits, audit, tests (#68)

## Phase 2: Real time
- [ ] T303 SignalR circle hub: membership-checked groups, presence, activity start/end, messages, close; tests (#69)
- [ ] T304 circloo coach: streaming chat over IChatClient with activity prompts, seed responder for dev, safety, allowance, tests (#70)

## Phase 3: Web
- [ ] T305 Character cast (12 SVG characters sharing the logo eyes) and the line-drawn thinking panda (#71)
- [ ] T306 Animator flow: Home "My circles", create circle (name + activities by category), share link, room with ring, activity picker, chat with circloo (#72)
- [ ] T307 Participant flow: public join page (name + required character, taken characters), participant room, chat (#73)
- [ ] T308 Playwright: animator creates, participant joins in a second context, presence, activity, chat, AI reply; axe in en and ar (#74)

## Dependencies
T301 → T302 → T303 → T304. T305 is independent. T306 and T307 need T302–T305. T308 last.
