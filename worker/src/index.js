import { CORS_HEADERS, MIRLO_PROXY_CORS } from "./data/metadata.js";
import { GUANGDONG_LOGO_B64 } from "./data/guangdongLogo.js";
import { handleProxy } from "./routes/proxy.js";
import { handleFairplayer } from "./routes/fairplayer.js";
import { handleShare } from "./routes/share.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: url.pathname.startsWith("/mirlo/") ? MIRLO_PROXY_CORS : CORS_HEADERS,
      });
    }

    if (url.pathname === "/guangdong-music-fm.png") {
      const binary = Uint8Array.from(atob(GUANGDONG_LOGO_B64), (c) => c.charCodeAt(0));
      return new Response(binary, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400, s-maxage=604800",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Proxy routes: /mirlo/*, /feed-proxy, /api/podcasts, /image, /stream/*
    const proxyResponse = await handleProxy(request, url, CORS_HEADERS);
    if (proxyResponse) return proxyResponse;

    // Fairplayer routes: /fairplayer/* (album, artist, page, hub, search, etc.)
    if (url.pathname.startsWith("/fairplayer/")) {
      return handleFairplayer(request, url, CORS_HEADERS);
    }

    // Social share & web preview player routes: /t/*, /art/*, /r/*, /p/*
    return handleShare(request, url);
  },
};
