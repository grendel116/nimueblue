# NimueBlue Social Sharing & Image Proxy Worker

This worker allows every track, radio station, and podcast shared from NimueBlue to generate rich OpenGraph preview cards on **Threads**, **Bluesky**, **Twitter/X**, **WhatsApp**, and **iMessage**.

It also fixes upstream Mirlo issue [#2494](https://github.com/funmusicplace/mirlo/issues/2494) by delivering album artwork with proper `Content-Type: image/webp` headers instead of `application/octet-stream`.

Podcast discovery reads Castopod Index's public catalog through `/api/podcasts`. It matches topic terms in show titles, descriptions, author names, and categories, then requires a valid publisher RSS URL and quality artwork. Podcast share links include episode audio and artwork when available, or use the latest audio enclosure in the show's RSS feed. Music, radio, and podcast share pages limit playback to 10 seconds. Curated shows remain available independently. To recommend a show that is missing from the index, submit its public RSS feed, show page, and artwork through a [NimueBlue issue](https://github.com/grendel116/nimueblue/issues). Radio and podcast preview requests without a usable artwork URL return `404` instead of showing a generic image.

Faircamp catalog requests use fixed Fairplayer routes under `/fairplayer/` to provide browser CORS access. The proxy exposes Fairplayer's public hub, release listing, search, individual release pages, numeric song pages, and a single-pass `/fairplayer/album` bundle endpoint that caches full album details, liner notes, and shop pages at the edge; it does not accept arbitrary upstream URLs. Faircamp track shares use the same compact `/t/f{track-id}` format as other track shares, verify the catalog against Fairplayer's hub, and render the selected song, its artwork MIME type, and a 10-second preview.

---

## 1-Minute Deployment Options

### Option A: Cloudflare Web Dashboard (No CLI or install needed)
1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com/) (free account).
2. Go to **Workers & Pages** -> **Create Application** -> **Create Worker**.
3. Name it `nimueblue-share` and click **Deploy**.
4. Click **Edit Code**, paste the contents of [`src/index.js`](src/index.js), and click **Deploy**.
5. Copy your worker's public URL (e.g., `https://nimueblue-share.nimueblue.workers.dev`).

### Option B: From Command Line
From the project root:
```bash
npx wrangler login
cd worker
npx wrangler deploy
```

---

## Linking into NimueBlue

Once deployed, set your worker URL in `.env`:
```env
EXPO_PUBLIC_SHARE_HUB_URL="https://nimueblue-share.nimueblue.workers.dev/listen/"
```
Or paste the URL directly into `components/ShareTrackButton.tsx`.

The web app at https://grendel116.github.io/nimueblue/app/ reaches Mirlo through `/mirlo/*`, which carries login tokens as `x-mirlo-jwt` / `x-mirlo-refresh` headers, and reads podcast RSS through `/feed-proxy?url=`. Build it with `npm run build:web`, which writes `docs/app` and `docs/404.html`.
