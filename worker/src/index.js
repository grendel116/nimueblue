import { CORS_HEADERS, MIRLO_PROXY_CORS } from "./data/metadata.js";
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
