# NimueBlue

A music player for Faircamp, Chorus catalogs, independent radio, podcasts, and your own files.

<img src="docs/preview-v8.png" alt="NimueBlue home screen" width="300"/>

## Features

- Music from Mirlo's Chorus catalog, played in the app's native player.
- Verified Faircamp releases discovered through Fairplayer, playable from their
  original catalogs.
- Device-only likes and wishlist entries for Faircamp music.
- Independent radio from Radio-Browser and a curated station list.
- Podcasts from RSS feeds and the Castopod Index, plus curated shows.
- Downloads saved as standard audio files with embedded tags.
- Local music files, offline listening, and a customizable queue.
- No ads or tracking.

## Music federation

NimueBlue reads Mirlo's Chorus catalog at `/v1/sm/canimus.json` and discovers verified Faircamp catalogs listed in the [Fairplayer hub](https://fairplayer.band/hub/). Faircamp releases appear alongside Mirlo music in discovery and search, and play from the artists' original audio URLs. Fairplayer's [data-sharing protocol](https://interop.fairplayer.org/specs/catalog/data-sharing-protocol.html) defines how independent catalogs can share release metadata. Faircamp likes and wishlist entries are stored on the device because Faircamp releases do not have Mirlo account IDs. Mirlo purchases remain available through Mirlo to support artists and cooperative workers.

Other catalogs may be added when NimueBlue can play their audio directly and respect artist consent and access limits. Catalogs that require another platform's player are not included.

## Radio

Stations provide their own live streams, often through Icecast. NimueBlue combines curated stations with listings from [Radio-Browser](https://www.radio-browser.info/), and filters for working streams and suitable artwork.

## Podcasts

NimueBlue finds shows through the [Castopod Index](https://index.castopod.org/) and curated picks. Episodes play from the publisher's RSS feed.

## Quick Start

**Requirements:** Node.js 20 or later

```bash
npm install
```

Create `.env`:
```
EXPO_PUBLIC_API_ROOT=https://mirlo.space
EXPO_PUBLIC_API_KEY=
```

```bash
npm run web
```
Open `http://localhost:8081`.

Fairplayer discovery uses the Fairplayer proxy routes in the Cloudflare Worker.
The app's default worker URL is configured in `queries/shareHub.ts`. For local
worker development, start a second terminal and run:

```bash
npx wrangler dev --config worker/wrangler.toml --local --port 8787
```

Set `EXPO_PUBLIC_SHARE_HUB_URL=http://127.0.0.1:8787` in `.env.local` before
starting Expo to route Fairplayer requests through that local worker.

## Installation

**Android:** Download the latest APK from [Releases](https://github.com/grendel116/nimueblue/releases).

## Faircamp support

NimueBlue discovers verified Faircamp catalogs through the [Fairplayer
hub](https://fairplayer.band/hub/) and its public release directory. Releases
appear alongside Mirlo music in discovery and search, and play from the artist's
Faircamp site. Faircamp likes and wishlist entries are kept locally on the
device.

To build from source:
```bash
npx eas-cli login
npx eas-cli build -p android --profile preview
```

## Tests

```bash
npm test
```

## Credits & License

Based on the [Mirlo mobile app](https://github.com/funmusicplace/mirlo-mobile). Support artists at [mirlo.space](https://mirlo.space).

Released under the **AGPL-3.0** license. See [LICENSE](LICENSE) and [License.md](License.md).
