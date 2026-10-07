# Remotion video

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i --loglevel=error
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).

## circloo tour

`Tour-en`, `Tour-fr`, `Tour-ar` and `Tour-es` render the 20-second product tour used on the landing page.

```bash
npm i
npx remotion studio                     # preview and edit
npx remotion render Tour-en ../src/web/public/video/circloo-tour-en.mp4 --codec=h264 --crf=27
npx remotion still Tour-en ../src/web/public/video/circloo-tour-en.jpg --frame=70 --image-format=jpeg
```

Characters and Pirikoo are imported from `src/web`, so the video always matches the app.
Remotion is free for teams of up to 3 people; larger companies need a Remotion company license.

## Story clips (landing page)

`Clip-<step>-<lang>` renders the short silent clips of the landing page's story section: `circle`, `chat`, `canvas`,
`board`, `send` and `pirikoo`, without captions (the page tells the story beside them). `circle` and `send` have no
words, so they are rendered once and shared by every language.

```bash
node render-clips.mjs              # every clip and poster → ../src/web/public/video/story (960×540, ~1.6 MB in all)
node render-clips.mjs canvas chat  # only these steps
```

When you add words to a wordless scene, remove it from `WORDLESS` here and in `src/web/src/features/landing/Player.tsx`.
