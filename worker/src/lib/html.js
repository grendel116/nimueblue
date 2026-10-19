export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function isQualityArtwork(rawUrl) {
  if (!rawUrl) return false;
  const lower = rawUrl.toLowerCase();
  if (lower.includes("placeholder") || lower.includes("default_cover") || lower.includes("default-avatar")) {
    return false;
  }
  return true;
}

export function renderHtml(meta) {
  const { title, artist, album, artwork, proxiedArtwork, imageMime, audioUrl, webUrl, appRoute, type } = meta;
  const isArtistCard = type === "artist";
  const isLiveLocation = Boolean(artist && artist.toLowerCase().startsWith("live from"));
  const label = artist && !isLiveLocation && !isArtistCard ? `${artist} - ${title}` : title;
  const desc = `Listen to ${label} on NIMUEBLUE. Direct artist support with zero ads.`;
  const safeLabel = escapeHtml(label);
  const safeDesc = escapeHtml(desc);
  const safeImage = escapeHtml(proxiedArtwork);
  const safeTitle = escapeHtml(title);
  const safeArtist = escapeHtml(artist);
  const safeAlbum = escapeHtml(album);
  const safeWeb = escapeHtml(webUrl || "https://mirlo.space");
  const webLabel = type === "radio"
    ? "Station Website"
    : type === "podcast"
      ? "Episode Page"
      : type === "faircamp"
        ? "Visit Faircamp Catalog"
        : isArtistCard
          ? "Follow & Support on Mirlo"
          : "Listen & Buy on Mirlo";
  const ogType = type === "track" || type === "faircamp"
    ? "music.song"
    : type === "album"
      ? "music.album"
      : isArtistCard
        ? "profile"
        : "website";
  const safeMime = escapeHtml(imageMime || "image/jpeg");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeLabel} | NIMUEBLUE</title>
    <meta name="description" content="${safeDesc}" />

    <!-- OpenGraph / Social Cards -->
    <meta property="og:title" content="${safeLabel} | NIMUEBLUE" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:image:secure_url" content="${safeImage}" />
    <meta property="og:image:alt" content="${safeLabel}" />
    <meta property="og:image:type" content="${safeMime}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${safeImage}" />
    <meta name="twitter:title" content="${safeLabel} | NIMUEBLUE" />
    <meta name="twitter:description" content="${safeDesc}" />

    <link rel="icon" type="image/png" href="https://grendel116.github.io/nimueblue/logo.png" />

    <style>
      @font-face {
        font-family: "MedievalScroll";
        src: url("https://grendel116.github.io/nimueblue/Medieval-Scroll-of-Wisdom.ttf") format("truetype");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      :root {
        --bg: #070b14;
        --surface: #0d1424;
        --surface-card: #131e35;
        --border: rgba(0, 210, 255, 0.18);
        --border-hover: rgba(0, 210, 255, 0.45);
        --primary: #00d2ff;
        --primary-hover: #38e0ff;
        --primary-glow: rgba(0, 210, 255, 0.25);
        --gold: #facc15;
        --text: #f8fafc;
        --text-muted: #94a3b8;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background-color: var(--bg);
        background-image: radial-gradient(circle at 50% 0%, rgba(0, 210, 255, 0.14) 0%, transparent 65%),
                          radial-gradient(circle at 80% 80%, rgba(56, 189, 248, 0.06) 0%, transparent 50%);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.5;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      header {
        width: 100%;
        border-bottom: 1px solid var(--border);
        background: rgba(13, 20, 36, 0.85);
        backdrop-filter: blur(12px);
        position: sticky;
        top: 0;
        z-index: 10;
      }
      .nav-inner {
        max-width: 720px;
        margin: 0 auto;
        padding: 12px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 5px;
        text-decoration: none;
        color: var(--text);
      }
      .brand img {
        height: 28px;
        width: auto;
      }
      .brand-text { font-family: "MedievalScroll", sans-serif; font-size: 18px; font-weight: 400; letter-spacing: 0.8px; }
      .brand-highlight { color: var(--primary); }
      .nav-cta {
        font-size: 13px; font-weight: 600; color: var(--primary); text-decoration: none;
        padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border);
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .nav-cta:hover { background: rgba(0, 210, 255, 0.1); border-color: var(--primary); }
      main {
        width: 100%; max-width: 520px; padding: 32px 20px 48px;
        flex: 1; display: flex; flex-direction: column; align-items: center;
      }
      .card {
        width: 100%; background: var(--surface); border: 1px solid var(--border);
        border-radius: 24px; padding: 28px 24px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), 0 0 30px rgba(0, 210, 255, 0.06);
        display: flex; flex-direction: column; align-items: center; text-align: center;
      }
      .artwork-wrap {
        width: 220px; height: 220px; border-radius: ${isArtistCard ? "50%" : "20px"}; margin-bottom: 22px;
        position: relative; background: var(--surface-card); border: 1px solid var(--border);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6), 0 0 24px var(--primary-glow);
        overflow: hidden;
      }
      .artwork-img { width: 100%; height: 100%; object-fit: cover; display: ${artwork ? "block" : "none"}; }
      .artwork-placeholder {
        width: 100%; height: 100%; display: ${artwork ? "none" : "flex"};
        align-items: center; justify-content: center;
        background: radial-gradient(circle at center, #132235 0%, #060b13 100%);
      }
      .artwork-placeholder svg { width: 64px; height: 64px; fill: var(--primary); opacity: 0.85; }
      .track-title { font-family: "MedievalScroll", sans-serif; font-size: 24px; line-height: 1.15; color: var(--text); margin-bottom: 6px; word-break: break-word; }
      .track-artist { font-size: 15px; font-weight: 600; line-height: 1.25; color: var(--primary); margin-bottom: 20px; }
      .track-meta { font-size: 13px; color: var(--text-muted); margin-top: -12px; margin-bottom: 20px; display: ${album ? "block" : "none"}; }
      .player-box { width: 100%; margin-bottom: 24px; display: ${audioUrl ? "flex" : "none"}; align-items: center; gap: 14px; padding: 0 4px; }
      .play-btn {
        width: 44px; height: 44px; border-radius: 50%; background: var(--primary); color: #041019;
        border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        box-shadow: 0 4px 16px var(--primary-glow);
      }
      .play-btn svg { width: 20px; height: 20px; fill: currentColor; }
      .player-progress-wrap { flex: 1; display: flex; align-items: center; }
      .progress-hit-area { width: 100%; padding: 14px 0; cursor: pointer; touch-action: none; user-select: none; }
      .progress-bar-container { width: 100%; height: 8px; background: rgba(255, 255, 255, 0.12); border-radius: 999px; overflow: hidden; position: relative; }
      .progress-bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg, var(--primary), var(--gold)); border-radius: 999px; }
      .actions { width: 100%; display: flex; flex-direction: column; gap: 12px; }
      .btn {
        width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 10px;
        padding: 13px 20px; border-radius: 999px; text-decoration: none; font-size: 15px; font-weight: 700; cursor: pointer;
      }
      .btn-app { background: var(--primary); color: #041019; box-shadow: 0 6px 20px rgba(0, 210, 255, 0.28); border: none; }
      .btn-web { background: var(--surface-card); color: var(--text); border: 1px solid var(--border); }
      footer { width: 100%; text-align: center; padding: 24px 20px; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 13px; margin-top: auto; }
      footer a { color: var(--primary); text-decoration: none; }
    </style>
  </head>
  <body>
    <header>
      <div class="nav-inner">
        <a href="https://grendel116.github.io/nimueblue/" class="brand" title="NIMUEBLUE Home" aria-label="NimueBlue">
          <img src="https://grendel116.github.io/nimueblue/nimue-text-logo.svg" alt="NimueBlue Logo" height="28" />
        </a>
        <a href="https://grendel116.github.io/nimueblue/" class="nav-cta">About App</a>
      </div>
    </header>

    <main>
      <div class="card">
        <div class="artwork-wrap">
          <img id="cover-img" class="artwork-img" src="${safeImage}" alt="Artwork" />
          <div id="cover-placeholder" class="artwork-placeholder">
            <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
          </div>
        </div>

        <h1 class="track-title">${safeTitle}</h1>
        <div class="track-artist">${safeArtist}</div>
        <div class="track-meta">${safeAlbum}</div>

        <div class="player-box" id="player-container">
          <button class="play-btn" id="play-button" type="button" aria-label="Play audio preview" title="Play preview">
            <svg id="play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            <svg id="pause-icon" viewBox="0 0 24 24" style="display: none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
          </button>
          <div class="player-progress-wrap">
            <div class="progress-hit-area" id="progress-hit-area">
              <div class="progress-bar-container" id="progress-container">
                <div class="progress-bar-fill" id="progress-fill"></div>
              </div>
            </div>
          </div>
          <audio id="audio-player" playsinline preload="none"></audio>
        </div>

        <div class="actions">
          <a class="btn btn-app" id="btn-open-app" href="#">
            <span>Open in App</span>
          </a>
          <a class="btn btn-web" id="btn-open-web" href="${safeWeb}" target="_blank" rel="noopener noreferrer">
            <span>${webLabel}</span>
          </a>
        </div>
      </div>
    </main>

    <footer>
      <p><a href="https://grendel116.github.io/nimueblue/">NIMUEBLUE</a> — Free &amp; open source music player. <a href="https://github.com/grendel116/nimueblue">Source code</a> (AGPL-3.0)</p>
    </footer>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
    <script>
      (function() {
        const appRoute = ${JSON.stringify(appRoute || "/")};
        const rawAudio = ${JSON.stringify(audioUrl || "")};
        const SAMPLE_LIMIT = 10;
        let isPlaying = false, isScrubbing = false, playedSeconds = 0, initialAudioTime = null, animFrameId = null;

        const coverImg = document.getElementById("cover-img");
        const placeholder = document.getElementById("cover-placeholder");
        if (coverImg) {
          coverImg.onerror = function() {
            coverImg.style.display = "none";
            if (placeholder) placeholder.style.display = "flex";
          };
        }

        const btnApp = document.getElementById("btn-open-app");
        if (btnApp) {
          const clean = appRoute.startsWith("/") ? appRoute.slice(1) : appRoute;
          const webAppUrl = "https://grendel116.github.io/nimueblue/app/" + clean;
          btnApp.href = /android/i.test(navigator.userAgent)
            ? "intent://" + clean + "#Intent;scheme=nimueblue;package=space.mirlo.blue;S.browser_fallback_url=" + encodeURIComponent(webAppUrl) + ";end"
            : webAppUrl;
        }

        const audioPlayer = document.getElementById("audio-player");
        const playBtn = document.getElementById("play-button");
        const playIcon = document.getElementById("play-icon");
        const pauseIcon = document.getElementById("pause-icon");
        const progressFill = document.getElementById("progress-fill");
        const progressHitArea = document.getElementById("progress-hit-area");
        const progressContainer = document.getElementById("progress-container");

        let resolvedAudio = rawAudio;
        if (resolvedAudio && resolvedAudio.indexOf("mirlo.space/v1/tracks/") !== -1) {
          const parts = resolvedAudio.split("/v1/tracks/");
          if (parts[1]) resolvedAudio = window.location.origin + "/stream/" + parts[1];
        }

        let hls = null;
        if (audioPlayer && resolvedAudio) {
          if (resolvedAudio.includes(".m3u8")) {
            if (typeof Hls !== "undefined" && Hls.isSupported()) {
              hls = new Hls({ maxBufferLength: 15, enableWorker: true });
              hls.loadSource(resolvedAudio);
              hls.attachMedia(audioPlayer);
              hls.on(Hls.Events.ERROR, function(event, data) {
                console.warn("HLS Error:", data);
                if (data.fatal) {
                  switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      hls.startLoad();
                      break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                      hls.recoverMediaError();
                      break;
                    default:
                      hls.destroy();
                      break;
                  }
                }
              });
            } else if (audioPlayer.canPlayType("application/vnd.apple.mpegurl")) {
              audioPlayer.src = resolvedAudio;
            }
          } else {
            audioPlayer.src = resolvedAudio;
          }
        }

        function getElapsedSeconds() {
          if (initialAudioTime === null || isNaN(audioPlayer.currentTime)) return 0;
          return Math.max(0, audioPlayer.currentTime - initialAudioTime);
        }

        function updateProgress() {
          if (!isPlaying) return;
          if (!isScrubbing && !audioPlayer.paused) {
            const elapsed = getElapsedSeconds();
            if (elapsed >= SAMPLE_LIMIT) {
              audioPlayer.pause();
              setPlaying(false);
              playedSeconds = SAMPLE_LIMIT;
              progressFill.style.width = "100%";
              return;
            }
            playedSeconds = elapsed;
            progressFill.style.width = Math.min(100, (elapsed / SAMPLE_LIMIT) * 100) + "%";
          }
          animFrameId = requestAnimationFrame(updateProgress);
        }

        function setPlaying(p) {
          isPlaying = p;
          if (playIcon) playIcon.style.display = p ? "none" : "block";
          if (pauseIcon) pauseIcon.style.display = p ? "block" : "none";
          cancelAnimationFrame(animFrameId);
          if (p) {
            animFrameId = requestAnimationFrame(updateProgress);
          }
        }

        audioPlayer.addEventListener("playing", function() {
          if (initialAudioTime === null && !isNaN(audioPlayer.currentTime)) {
            initialAudioTime = audioPlayer.currentTime;
          }
          setPlaying(true);
        });
        audioPlayer.addEventListener("timeupdate", function() {
          if (initialAudioTime === null && !isNaN(audioPlayer.currentTime)) {
            initialAudioTime = audioPlayer.currentTime;
          }
        });
        audioPlayer.addEventListener("pause", function() { setPlaying(false); });
        audioPlayer.addEventListener("ended", function() {
          setPlaying(false);
          playedSeconds = SAMPLE_LIMIT;
          progressFill.style.width = "100%";
        });
        audioPlayer.addEventListener("error", function(err) {
          console.warn("Playback error:", err);
          setPlaying(false);
        });

        if (playBtn && audioPlayer) {
          playBtn.addEventListener("click", function() {
            if (!resolvedAudio) return;
            if (isPlaying) {
              audioPlayer.pause();
            } else {
              if (playedSeconds >= SAMPLE_LIMIT) {
                playedSeconds = 0;
                progressFill.style.width = "0%";
                try {
                  audioPlayer.currentTime = initialAudioTime !== null ? initialAudioTime : 0;
                } catch (e) {}
              }
              audioPlayer.play().catch(function(err) {
                console.warn("Audio play prevented:", err);
                setPlaying(false);
              });
            }
          });
        }

        function seekToClient(clientX) {
          const rect = progressContainer.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          playedSeconds = ratio * SAMPLE_LIMIT;
          progressFill.style.width = (ratio * 100) + "%";
          try {
            const base = initialAudioTime !== null ? initialAudioTime : 0;
            audioPlayer.currentTime = base + playedSeconds;
          } catch (e) {}
        }

        progressHitArea.addEventListener("pointerdown", function(e) {
          if (!resolvedAudio) return;
          isScrubbing = true;
          try { progressHitArea.setPointerCapture(e.pointerId); } catch (err) {}
          seekToClient(e.clientX);
        });
        progressHitArea.addEventListener("pointermove", function(e) {
          if (isScrubbing) seekToClient(e.clientX);
        });
        function onPointerEnd(e) {
          if (!isScrubbing) return;
          isScrubbing = false;
          try { progressHitArea.releasePointerCapture(e.pointerId); } catch (err) {}
          if (!isPlaying) {
            audioPlayer.play().catch(function() {});
          }
        }
        progressHitArea.addEventListener("pointerup", onPointerEnd);
        progressHitArea.addEventListener("pointercancel", onPointerEnd);
      })();
    </script>
  </body>
</html>`;
}
