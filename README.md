# 🌀 circloo

> *The real zone to collaborate — where ideas go round and round until they become something great.* 🎡

[![Vibes](https://img.shields.io/badge/vibes-immaculate-ff69b4)](#)
[![Bugs](https://img.shields.io/badge/bugs-not%20yet%20(give%20us%20time)-orange)](#)
[![Coffee](https://img.shields.io/badge/powered%20by-coffee%20%E2%98%95-brown)](#)

---

## 🤔 What is circloo?

A private little universe for your people: friends, family or your whole company.

- 🌤️ **Feel together.** One-tap daily mood and motivation check-ins. See your circle's "weather".
- 🧠 **Work together.** Live shared boards (sticky notes, votes, retros), Klaxoon-style.
- 😂 **Laugh together.** Icebreakers and jokes in English, Français, العربية and Español.
- ✉️ **Join easily.** Sign up with just your email; invite friends by email *or* with a simple link/code.
- 🏢 **Enterprise-ready.** Plug in your company SSO (Entra ID, Google, Okta, any OIDC/SAML) with no code changes.

And the important stuff:

- 🔁 It's a circle. Everyone's in it. Nobody gets left in the corner (circles don't have corners).
- 🤝 It's built for collaboration — bring your ideas, your code and your worst puns.
- 🎉 Fun is a feature, not a bug.

## 🚀 Getting started

The `.ps1` scripts need PowerShell 7 (`pwsh`); each one has a bash twin (`.sh`).

```powershell
git clone https://github.com/nciross/circloo.git
cd circloo
./scripts/setup.ps1      # GitHub login, git hooks, labels (or ./scripts/setup.sh)
claude                   # approve the github MCP server + impeccable plugin
```

### Run it locally (costs zero)
Needs the .NET 10 SDK, Node 24, and Docker Desktop **or** Podman (`podman machine start`, then set `ASPIRE_CONTAINER_RUNTIME=podman`).

```powershell
cd src/web; npm ci; cd ../..
dotnet run --project src/Circloo.AppHost      # Postgres, Mailpit, Azurite, deck converter (~1.7 GB first pull), API, Vite: all local
```
Open the Aspire dashboard link it prints. Use the `web` endpoint for the app and the `mailpit` endpoint to read your sign-in codes. No email ever leaves your machine.

> Uploading a PowerPoint fails with "The API version … is not supported by Azurite"? An Azurite container from an older checkout is still running without `--skipApiVersionCheck`. Stop the AppHost, remove it once (`podman rm -f <storage-…>` or `docker rm -f <storage-…>`; the `circloo-azurite` volume keeps your slides) and start the AppHost again.

Tests: `dotnet test` (API against a real Postgres through Testcontainers) and, in `src/web`, `npm test`, plus `npx playwright test` with `E2E_BASE_URL` and `MAILPIT_URL` set.

Ship it to Azure (one resource group, one command) or make it vanish just as fast:

```powershell
./scripts/deploy.ps1  -Environment dev
./scripts/destroy.ps1 -Environment dev
```

### How we build
**No issue, no development.** Idea → GitHub issue → Spec-Kit spec & plan → task issues → code → PR `Closes #N`. Details in [docs/workflow](docs/workflow/issue-driven-development.md). Product: [PRODUCT.md](PRODUCT.md) · [PRD](docs/product/prd.md) · Design: [no AI look](docs/design/anti-ai-look.md) · Architecture: [overview](docs/architecture/overview.md).

## 🧭 The circloo commandments

1. **Thou shalt pull before thou pushest.** Merge conflicts are not a personality.
2. **Thou shalt write commit messages humans can read.** `fix stuff` is a cry for help, not a commit message.
3. **Thou shalt not push directly to `main`.** Branches are free. Use them.
4. **Thou shalt review PRs with kindness.** Roast the code, never the coder.
5. **Thou shalt have fun.** This one is mandatory and enforced by CI (eventually).

## 🌱 Contributing

1. Fork it / branch it 🍴
2. Make something cool ✨
3. Open a PR 📬
4. Celebrate 🥳

## 📜 Status

```
[██░░░░░░░░] 15% — the plan exists, the robots are briefed, the jokes are ready.
```

---

<p align="center"><i>Made with 💜 and an unreasonable amount of enthusiasm by the circloo crew.</i></p>
