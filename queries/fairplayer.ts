import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { audioTrackType, coverSizes, shuffle } from "@/scripts/utils";
import { SHARE_HUB_URL } from "@/queries/shareHub";

const FAIRPLAYER_ROOT = "https://fairplayer.band";
const FAIRPLAYER_ID_PREFIX = "fairplayer-";
const FAIRPLAYER_ARTIST_PREFIX = "fairplayer-artist-";

// Domains with expired/invalid TLS certificates, non-standard ports, insecure HTTP, or dead 404 audio streams
const BLOCKED_FAIRCAMP_DOMAINS = new Set<string>([
  "faircamp.txels.art",
  "txels.art",
  "music.strangetextures.com",
  "strangetextures.com",
  "faircamp.omar.apps.dj",
  "cult.kidlightbulbs.com",
  "sknot.fr",
  "amicpublic.remor.net",
  "carmevives.remor.net",
  "garrafa.remor.net",
  "maldol.remor.net",
  "sknam.nham.co.uk",
  "tallhouserecordingco.com",
]);

const quarantinedFaircampDomains = new Set<string>();

function normalizeDomain(hostname: string): string {
  return hostname.toLowerCase().trim().replace(/^www\./, "").replace(/\.$/, "");
}

function isIpOrLocalhost(domain: string): boolean {
  if (!domain || domain === "localhost" || domain.endsWith(".local") || domain.endsWith(".internal")) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain) || domain.includes(":")) {
    return true;
  }
  return false;
}

export function isFaircampDomainBlocked(domainOrUrl?: string): boolean {
  if (!domainOrUrl) return true;
  let domain = domainOrUrl.trim();
  if (domain.includes("://")) {
    try {
      const parsed = new URL(domain);
      if (parsed.protocol !== "https:") return true;
      if (parsed.port && parsed.port !== "443") return true;
      if (parsed.username || parsed.password) return true;
      domain = parsed.hostname;
    } catch {
      return true;
    }
  }
  const normalized = normalizeDomain(domain);
  if (!normalized || !normalized.includes(".") || isIpOrLocalhost(normalized)) {
    return true;
  }
  if (BLOCKED_FAIRCAMP_DOMAINS.has(normalized) || quarantinedFaircampDomains.has(normalized)) {
    return true;
  }
  for (const blocked of BLOCKED_FAIRCAMP_DOMAINS) {
    if (normalized.endsWith(`.${blocked}`)) return true;
  }
  for (const quarantined of quarantinedFaircampDomains) {
    if (normalized.endsWith(`.${quarantined}`)) return true;
  }
  return false;
}

export function blockFaircampDomain(domainOrUrl?: string): void {
  if (!domainOrUrl) return;
  let domain = domainOrUrl.trim();
  if (domain.includes("://")) {
    try {
      domain = new URL(domain).hostname;
    } catch {
      return;
    }
  }
  const normalized = normalizeDomain(domain);
  if (!normalized) return;
  quarantinedFaircampDomains.add(normalized);

  for (const [slug, album] of knownAlbumsBySlug.entries()) {
    const releaseId = decodeReleaseSlug(slug);
    const albumDomain = releaseId ? getFaircampDomain(releaseId) : undefined;
    if (!albumDomain || albumDomain === normalized || albumDomain.endsWith(`.${normalized}`)) {
      knownAlbumsBySlug.delete(slug);
      if (album.artistId) {
        knownArtistsById.delete(album.artistId);
      }
    }
  }
}

const knownAlbumsBySlug = new Map<string, AlbumProps>();
const knownArtistsById = new Map<number, { name: string; sourceUrl?: string }>();

export function isKnownFairplayerArtistId(artistId: number): boolean {
  return knownArtistsById.has(artistId);
}

type HtmlNode = {
  nodeName: string;
  tagName?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: HtmlNode[];
  value?: string;
};

type FairplayerSearchItem = {
  type?: string;
  name?: string;
  url?: string;
  uid?: string;
  artist?: string;
  description?: string;
  links?: string[];
  images?: {
    default?: {
      src?: string;
    };
  };
};

type FairplayerSearchResponse = {
  items?: FairplayerSearchItem[];
};

function htmlChildren(node: HtmlNode): HtmlNode[] {
  return node.childNodes || [];
}

function findElements(
  root: HtmlNode,
  predicate: (node: HtmlNode) => boolean,
): HtmlNode[] {
  const matches: HtmlNode[] = [];
  const visit = (node: HtmlNode) => {
    if (predicate(node)) matches.push(node);
    for (const child of htmlChildren(node)) visit(child);
  };
  visit(root);
  return matches;
}

function getAttribute(node: HtmlNode, name: string): string | undefined {
  return node.attrs?.find((attribute) => attribute.name === name)?.value;
}

function getText(node: HtmlNode): string {
  if (node.nodeName === "#text") return node.value || "";
  return htmlChildren(node).map(getText).join("").replace(/\s+/g, " ").trim();
}

function hasClass(node: HtmlNode, className: string): boolean {
  return (getAttribute(node, "class") || "").split(/\s+/).includes(className);
}

const voidHtmlTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function parseHtml(html: string): HtmlNode {
  const root: HtmlNode = { nodeName: "#document", childNodes: [] };
  const stack: HtmlNode[] = [root];
  const tagRegex =
    /<!--[\s\S]*?-->|<(\/?)([a-zA-Z0-9_:-]+)((?:\s+[^=>\s/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^>\s]+))?)*)\s*(\/?)>|([^<]+)/gi;
  const attrRegex = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    const [, isClosing, tagName, attrString, isSelfClosing, text] = match;
    if (text) {
      if (text.length > 0) {
        const textNode: HtmlNode = {
          nodeName: "#text",
          value: decodeHtmlEntities(text),
        };
        stack[stack.length - 1].childNodes?.push(textNode);
      }
      continue;
    }
    if (!tagName) continue;
    const lowerTag = tagName.toLowerCase();
    if (isClosing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === lowerTag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const attrs: { name: string; value: string }[] = [];
    if (attrString) {
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRegex.exec(attrString)) !== null) {
        const name = attrMatch[1];
        if (!name) continue;
        const rawVal =
          attrMatch[2] !== undefined
            ? attrMatch[2]
            : attrMatch[3] !== undefined
              ? attrMatch[3]
              : attrMatch[4] !== undefined
                ? attrMatch[4]
                : "";
        attrs.push({
          name: name.toLowerCase(),
          value: decodeHtmlEntities(rawVal),
        });
      }
    }
    const node: HtmlNode = {
      nodeName: lowerTag,
      tagName: lowerTag,
      attrs,
      childNodes: [],
    };
    stack[stack.length - 1].childNodes?.push(node);
    if (!isSelfClosing && !voidHtmlTags.has(lowerTag)) {
      stack.push(node);
    }
  }
  return root;
}

function resolveRelativeUrl(rawHref: string | undefined, baseUrl: string): string {
  if (!rawHref) return "";
  try {
    return new URL(rawHref, baseUrl).href;
  } catch {
    return "";
  }
}

function serializeHtmlNodeToMarkdown(node: HtmlNode, baseUrl: string): string {
  if (node.nodeName === "#text") {
    return (node.value || "").replace(/[ \t\r\n]+/g, " ");
  }
  const tag = node.tagName?.toLowerCase();
  if (!tag || tag === "script" || tag === "style" || tag === "svg") return "";
  if (tag === "br") return "\n";
  if (tag === "div" && hasClass(node, "divider")) return "\n\n";

  const childrenMd = htmlChildren(node)
    .map((child) => serializeHtmlNodeToMarkdown(child, baseUrl))
    .join("");

  if (tag === "a") {
    const href = resolveRelativeUrl(getAttribute(node, "href"), baseUrl);
    const label = childrenMd.trim();
    if (!label) return "";
    if (!href || href.startsWith("javascript:")) return label;
    return `[${label}](${href})`;
  }
  if (tag === "strong" || tag === "b") {
    const inner = childrenMd.trim();
    return inner ? `**${inner}**` : "";
  }
  if (tag === "em" || tag === "i") {
    const inner = childrenMd.trim();
    return inner ? `*${inner}*` : "";
  }
  if (tag === "li") {
    const inner = childrenMd.trim();
    return inner ? `- ${inner}\n` : "";
  }
  if (tag === "p" || tag === "ul" || tag === "ol" || tag === "section") {
    const inner = childrenMd.trim();
    if (!inner) return "";
    if (/faircamp\.webr\.ing/i.test(inner)) return "";
    return `${inner}\n\n`;
  }
  return childrenMd;
}

function normalizeParagraphLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== ".")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type FaircampPageTrack = {
  order: number;
  title: string;
  url: string;
};

export type FaircampPageDetails = {
  abstractText: string;
  aboutMarkdown: string;
  bannerUrl: string;
  links: ArtistLink[];
  tracks?: FaircampPageTrack[];
};

export function parseFaircampPageDetails(
  html: string,
  pageUrl: string,
): FaircampPageDetails {
  const root = parseHtml(html);

  // 1. Short abstract description under <div class="abstract">
  let abstractText = "";
  const abstractNode = findElements(
    root,
    (node) => node.tagName === "div" && hasClass(node, "abstract"),
  )[0];
  if (abstractNode) {
    for (const child of htmlChildren(abstractNode)) {
      if (
        child.tagName === "div" &&
        !hasClass(child, "actions") &&
        !hasClass(child, "release_artists")
      ) {
        const text = getText(child);
        if (text) {
          abstractText = text;
          break;
        }
      }
    }
  }
  if (!abstractText) {
    const ogDesc = findElements(
      root,
      (node) =>
        node.tagName === "meta" &&
        getAttribute(node, "property") === "og:description",
    )[0];
    const ogTitle = findElements(
      root,
      (node) =>
        node.tagName === "meta" &&
        getAttribute(node, "property") === "og:title",
    )[0];
    const descContent = (getAttribute(ogDesc || { nodeName: "" }, "content") || "").trim();
    const titleContent = (getAttribute(ogTitle || { nodeName: "" }, "content") || "").trim();
    if (descContent && descContent !== titleContent) {
      abstractText = descContent;
    }
  }

  // 2. Full About / More section under <div class="page_more"><div class="text">
  let aboutMarkdown = "";
  const pageMoreNode = findElements(
    root,
    (node) => node.tagName === "div" && hasClass(node, "page_more"),
  )[0];
  if (pageMoreNode) {
    const textNode =
      findElements(
        pageMoreNode,
        (node) => node.tagName === "div" && hasClass(node, "text"),
      )[0] || pageMoreNode;
    aboutMarkdown = normalizeParagraphLines(
      serializeHtmlNodeToMarkdown(textNode, pageUrl),
    );
  }

  // 3. Banner image from <img class="home_image"> or og:image
  let bannerUrl = "";
  const homeImg = findElements(
    root,
    (node) => node.tagName === "img" && hasClass(node, "home_image"),
  )[0];
  if (homeImg) {
    bannerUrl = resolveRelativeUrl(getAttribute(homeImg, "src"), pageUrl);
  }
  if (!bannerUrl) {
    const ogImage = findElements(
      root,
      (node) =>
        node.tagName === "meta" &&
        getAttribute(node, "property") === "og:image",
    )[0];
    bannerUrl = resolveRelativeUrl(
      getAttribute(ogImage || { nodeName: "" }, "content"),
      pageUrl,
    );
  }

  // 4. External links configured on the Faircamp page
  const links: ArtistLink[] = [];
  const actionLinks = findElements(
    root,
    (node) =>
      node.tagName === "a" &&
      getAttribute(node, "target") === "_blank" &&
      Boolean(getAttribute(node, "href")),
  );
  for (const linkNode of actionLinks) {
    const hasExternalTitle = findElements(
      linkNode,
      (child) => child.tagName === "title" && getText(child) === "External Link",
    ).length > 0;
    const rel = getAttribute(linkNode, "rel") || "";
    if (!hasExternalTitle && !/\bme\b/i.test(rel)) continue;
    const href = resolveRelativeUrl(getAttribute(linkNode, "href"), pageUrl);
    if (!href || !href.startsWith("https://")) continue;
    const spanNode = findElements(linkNode, (child) => child.tagName === "span")[0];
    const label = spanNode ? getText(spanNode) : getAttribute(linkNode, "title") || "";
    links.push({ url: href, ...(label ? { linkLabel: label } : {}) });
  }

  const navLinks = findElements(
    root,
    (node) => node.tagName === "nav" && getAttribute(node, "id") === "links",
  )[0];
  if (navLinks) {
    for (const anchor of findElements(navLinks, (n) => n.tagName === "a")) {
      const href = resolveRelativeUrl(getAttribute(anchor, "href"), pageUrl);
      if (!href || !href.startsWith("https://")) continue;
      if (/faircamp\.webr\.ing|simonrepp\.com/i.test(href)) continue;
      const label = getAttribute(anchor, "title") || getText(anchor);
      links.push({ url: href, ...(label ? { linkLabel: label } : {}) });
    }
  }

  // 5. Audio tracks parsed directly from the Faircamp release page
  const pageTracks: FaircampPageTrack[] = [];
  const trackTitles: string[] = [];
  const titleAnchors = findElements(
    root,
    (node) => node.tagName === "a" && hasClass(node, "title"),
  );
  for (const anchor of titleAnchors) {
    const text = getText(anchor).trim();
    if (text) trackTitles.push(text);
  }

  const audioNodes = findElements(root, (node) => node.tagName === "audio");
  audioNodes.forEach((audioNode, idx) => {
    const sources = findElements(audioNode, (node) => node.tagName === "source");
    let chosenSrc = "";
    for (const source of sources) {
      const src = getAttribute(source, "src");
      if (!src) continue;
      if (!chosenSrc || /\.opus(?:[?#]|$)/i.test(src)) {
        chosenSrc = src;
        if (/\.opus(?:[?#]|$)/i.test(src)) break;
      }
    }
    if (chosenSrc) {
      const resolved = resolveRelativeUrl(chosenSrc, pageUrl);
      if (resolved && resolved.startsWith("https://")) {
        pageTracks.push({
          order: idx + 1,
          title: trackTitles[idx] || `Track ${idx + 1}`,
          url: resolved,
        });
      }
    }
  });

  return {
    abstractText: normalizeParagraphLines(abstractText),
    aboutMarkdown,
    bannerUrl,
    links,
    tracks: pageTracks,
  };
}

export function combineFaircampAbout(
  abstractText?: string,
  aboutMarkdown?: string,
  catalogUrl?: string,
): string {
  const parts: string[] = [];
  const cleanAbstract = (abstractText || "").trim();
  const cleanMore = (aboutMarkdown || "").trim();

  if (cleanAbstract) {
    parts.push(cleanAbstract);
  }
  if (
    cleanMore &&
    cleanMore.toLowerCase() !== cleanAbstract.toLowerCase() &&
    !cleanMore.toLowerCase().startsWith(cleanAbstract.toLowerCase())
  ) {
    parts.push(cleanMore);
  } else if (cleanMore && !cleanAbstract) {
    parts.push(cleanMore);
  }

  if (catalogUrl) {
    parts.push(`Faircamp catalog: ${catalogUrl}`);
  }
  return parts.join("\n\n");
}

// A Faircamp page's HTML, read through the share hub (Faircamp sites send no CORS headers)
async function fetchFaircampHtml(pageUrl: string, signal?: AbortSignal): Promise<string> {
  if (!pageUrl.startsWith("https://")) throw new Error("Faircamp pages are https only");
  const endpoint = fairplayerEndpoint("/fairplayer/page");
  endpoint.searchParams.set("url", pageUrl);
  const response = await fetch(endpoint.toString(), {
    headers: { Accept: "text/html" },
    signal,
  });
  if (!response.ok) throw new Error(`Couldn't open the Faircamp page (${response.status})`);
  return response.text();
}

async function fetchFaircampPageDetails(
  pageUrl: string | undefined,
  signal?: AbortSignal,
): Promise<FaircampPageDetails | undefined> {
  if (!pageUrl) return undefined;
  try {
    const html = await fetchFaircampHtml(pageUrl, signal);
    if (!html.includes("<")) return undefined;
    return parseFaircampPageDetails(html, pageUrl);
  } catch {
    return undefined;
  }
}

function getFaircampReleaseId(urlOrPath: string): string | undefined {
  if (!urlOrPath || !urlOrPath.includes("/player/release/")) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(urlOrPath, FAIRPLAYER_ROOT);
  } catch {
    return undefined;
  }

  if (parsed.origin !== FAIRPLAYER_ROOT) return undefined;
  const match = parsed.pathname.match(/^\/player\/release\/([^/]+)\/?$/);
  if (!match) return undefined;

  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }

  return getFaircampDomain(id) ? id : undefined;
}

function encodeReleaseSlug(releaseId: string): string {
  return `${FAIRPLAYER_ID_PREFIX}${encodeURIComponent(releaseId)}`;
}

function decodeReleaseSlug(slug: string): string | undefined {
  if (!slug) return undefined;
  let normalizedSlug = slug;
  while (normalizedSlug.includes("%") && /%[0-9a-fA-F]{2}/.test(normalizedSlug)) {
    try {
      const next = decodeURIComponent(normalizedSlug);
      if (next === normalizedSlug) break;
      normalizedSlug = next;
    } catch {
      break;
    }
  }
  if (!normalizedSlug.startsWith(FAIRPLAYER_ID_PREFIX) || normalizedSlug.startsWith(FAIRPLAYER_ARTIST_PREFIX)) {
    return undefined;
  }
  return normalizedSlug.slice(FAIRPLAYER_ID_PREFIX.length);
}

function encodeArtistSlug(artistName: string): string {
  return `${FAIRPLAYER_ARTIST_PREFIX}${encodeURIComponent(artistName.trim())}`;
}

function decodeArtistSlug(slug: string): string | undefined {
  if (!slug) return undefined;
  let normalizedSlug = slug;
  while (normalizedSlug.includes("%") && /%[0-9a-fA-F]{2}/.test(normalizedSlug)) {
    try {
      const next = decodeURIComponent(normalizedSlug);
      if (next === normalizedSlug) break;
      normalizedSlug = next;
    } catch {
      break;
    }
  }
  if (!normalizedSlug.startsWith(FAIRPLAYER_ARTIST_PREFIX)) return undefined;
  const decoded = normalizedSlug.slice(FAIRPLAYER_ARTIST_PREFIX.length).trim();
  return decoded || undefined;
}

function hashId(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

function getFaircampSiteUrl(releaseId: string): string {
  const match = releaseId.match(/^[^@/]+@([^@/]+)$/);
  if (!match) return FAIRPLAYER_ROOT;

  const [host, subpath] = match[1].split(":");
  try {
    const origin = new URL(`https://${host}`).origin;
    const cleanSubpath = subpath ? `/${subpath.replace(/^\/+/, "")}` : "";
    return `${origin}${cleanSubpath}`.replace(/\/+$/, "");
  } catch {
    return FAIRPLAYER_ROOT;
  }
}

export function getFaircampReleaseUrl(releaseId: string, catalogUrl?: string): string {
  const match = releaseId.match(/^([^@/]+)@([^@/]+)$/);
  if (!match) return catalogUrl || FAIRPLAYER_ROOT;
  const releaseSlug = match[1];
  let base = (catalogUrl || getFaircampSiteUrl(releaseId)).replace(/\/+$/, "");
  const [, subpath] = match[1].split(":");
  if (subpath && !base.toLowerCase().endsWith(`/${subpath.toLowerCase()}`)) {
    base = `${base}/${subpath.replace(/^\/+/, "")}`;
  }
  return `${base}/${encodeURIComponent(releaseSlug)}/`;
}

function deriveReleaseUrlFromAudioUrl(audioUrl: string): string | undefined {
  try {
    const parsed = new URL(audioUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    // Faircamp audio URLs are `<catalog>/<release-slug>/<track-num>/<codec>/<file>`
    // or `<catalog>/<release-slug>/<file>`
    const codecIdx = segments.findIndex((s) =>
      /^(opus|mp3|flac|vorbis|ogg|wav|aac|alac|m4a)(-\d+)?$/i.test(s),
    );
    if (codecIdx >= 2 && /^\d+$/.test(segments[codecIdx - 1])) {
      return `${parsed.origin}/${segments.slice(0, codecIdx - 1).join("/")}/`;
    }
    if (codecIdx >= 1) {
      return `${parsed.origin}/${segments.slice(0, codecIdx).join("/")}/`;
    }
    if (segments.length >= 2) {
      return `${parsed.origin}/${segments.slice(0, -1).join("/")}/`;
    }
  } catch {}
  return undefined;
}

function getFaircampDomain(releaseId: string): string | undefined {
  const match = releaseId.match(/^[^@/]+@([^@/]+)$/);
  if (!match) return undefined;
  const hostPart = match[1].split(":")[0];

  try {
    const url = new URL(`https://${hostPart}`);
    if (url.username || url.password || url.pathname !== "/") return undefined;
    if (url.port && url.port !== "443") return undefined;
    const domain = normalizeDomain(url.hostname);
    if (isFaircampDomainBlocked(domain)) return undefined;
    return domain;
  } catch {
    return undefined;
  }
}

function recordKnownAlbum(album: AlbumProps, catalogUrl?: string): void {
  if (album.urlSlug) {
    const existing = knownAlbumsBySlug.get(album.urlSlug);
    if (!existing || (album.tracks && album.tracks.length > 0)) {
      knownAlbumsBySlug.set(album.urlSlug, album);
    }
  }
  if (album.artistId && album.artist?.name) {
    const existingArtist = knownArtistsById.get(album.artistId);
    knownArtistsById.set(album.artistId, {
      name: album.artist.name,
      sourceUrl: catalogUrl || existingArtist?.sourceUrl || album.sourceUrl,
    });
  }
}

function toAlbumProps(
  releaseId: string,
  title: string,
  artistName: string,
  coverUrl: string,
): AlbumProps {
  const artistId = hashId(`faircamp:${artistName.toLowerCase()}`);
  const albumId = hashId(`faircamp:${releaseId.toLowerCase()}`);
  const siteUrl = getFaircampReleaseUrl(releaseId);
  const cover = { sizes: coverSizes(coverUrl) };

  const album: AlbumProps = {
    id: albumId,
    trackGroupId: albumId,
    title,
    artistId,
    artist: {
      id: artistId,
      name: artistName,
      urlSlug: "fairplayer",
      bio: "",
      activityPub: false,
      enabled: true,
      createdAt: "",
      trackGroups: [],
      userId: 0,
    },
    urlSlug: encodeReleaseSlug(releaseId),
    releaseDate: "",
    about: "",
    source: "Faircamp",
    sourceUrl: siteUrl,
    cover,
    tracks: [],
  };
  recordKnownAlbum(album);
  return album;
}

export function parseFairplayerReleaseCards(
  html: string,
  verifiedCatalogs?: Map<string, string>,
): AlbumProps[] {
  const cardPattern =
    /<a\b[^>]*\bhx-get\s*=\s*["']([^"']*\/player\/release\/[^"']*)["'][^>]*>[\s\S]*?<\/a>/gi;
  const matchedSnippets: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = cardPattern.exec(html)) !== null) {
    const releaseId = getFaircampReleaseId(match[1] || "");
    if (!releaseId) continue;
    if (verifiedCatalogs) {
      const domain = getFaircampDomain(releaseId);
      if (!domain || !verifiedCatalogs.has(domain)) continue;
    }
    matchedSnippets.push(match[0]);
  }

  if (matchedSnippets.length === 0) return [];

  const root = parseHtml(matchedSnippets.join(""));
  const anchors = findElements(
    root,
    (node) => node.tagName === "a" && Boolean(getAttribute(node, "hx-get")),
  );
  const albums: AlbumProps[] = [];

  for (const card of anchors) {
    const releaseId = getFaircampReleaseId(getAttribute(card, "hx-get") || "");
    if (!releaseId) continue;

    const paragraphs = findElements(card, (node) => node.tagName === "p");
    const title =
      paragraphs.map((node) => getAttribute(node, "title")).find(Boolean) ||
      getText(paragraphs[0] || card);
    const artistName = getText(paragraphs[1] || { nodeName: "#text" });
    const coverUrl =
      getAttribute(
        findElements(card, (node) => node.tagName === "img")[0] || {
          nodeName: "",
        },
        "src",
      ) || "";

    if (!title || !artistName) continue;
    const album = toAlbumProps(releaseId, title, artistName, coverUrl);
    if (verifiedCatalogs) {
      const domain = getFaircampDomain(releaseId);
      if (domain && verifiedCatalogs.has(domain)) {
        const catalogUrl = verifiedCatalogs.get(domain);
        album.sourceUrl = getFaircampReleaseUrl(releaseId, catalogUrl);
        recordKnownAlbum(album, catalogUrl);
      }
    }
    albums.push(album);
  }

  return albums;
}

export function parseFairplayerSearchResults(raw: unknown): AlbumProps[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("Fairplayer search returned an invalid response.");
  }
  const items = (raw as FairplayerSearchResponse).items;
  if (!Array.isArray(items)) {
    throw new Error("Fairplayer search response did not include an item list.");
  }

  return items.flatMap((item) => {
    if (item.type !== "album" || !item.url || !item.name || !item.artist)
      return [];
    const releaseId = getFaircampReleaseId(item.url);
    if (!releaseId) return [];
    return [
      toAlbumProps(
        releaseId,
        item.name,
        item.artist,
        item.images?.default?.src || "",
      ),
    ];
  });
}

export function parseVerifiedFaircampCatalogs(
  html: string,
): Map<string, string> {
  const linkPattern = /<a\b[^>]*\bhref\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi;
  const matchedLinks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    const snippet = match[0];
    if (
      /faircamp/i.test(snippet) &&
      (/bg-success/i.test(snippet) || /verifi(?:ed|cat)/i.test(snippet))
    ) {
      matchedLinks.push(snippet);
    }
  }

  if (matchedLinks.length === 0) return new Map<string, string>();

  const root = parseHtml(matchedLinks.join(""));
  const catalogLinks = findElements(
    root,
    (node) =>
      node.tagName === "a" &&
      Boolean(getAttribute(node, "href")) &&
      /faircamp/i.test(getText(node)) &&
      findElements(
        node,
        (child) =>
          /verifi(?:ed|cat)/i.test(getAttribute(child, "title") || "") ||
          hasClass(child, "bg-success"),
      ).length > 0,
  );
  const catalogs = new Map<string, string>();

  for (const link of catalogLinks) {
    try {
      const parsed = new URL(getAttribute(link, "href") || "");
      if (
        parsed.protocol === "https:" &&
        (!parsed.port || parsed.port === "443") &&
        !parsed.username &&
        !parsed.password
      ) {
        const domain = normalizeDomain(parsed.hostname);
        if (!isFaircampDomainBlocked(domain)) {
          catalogs.set(domain, parsed.href);
        }
      }
    } catch {
      continue;
    }
  }
  return catalogs;
}

function fairplayerEndpoint(path: string): URL {
  const url = new URL(path, SHARE_HUB_URL);
  if (url.origin !== new URL(SHARE_HUB_URL).origin) {
    throw new Error("Invalid Fairplayer proxy URL.");
  }
  return url;
}

let cachedVerifiedCatalogs: {
  fetchRef: typeof fetch;
  promise: Promise<Map<string, string>>;
  expiresAt: number;
} | null = null;

export async function fetchVerifiedFaircampCatalogs(
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const now = Date.now();
  if (
    cachedVerifiedCatalogs &&
    cachedVerifiedCatalogs.fetchRef === global.fetch &&
    cachedVerifiedCatalogs.expiresAt > now
  ) {
    return cachedVerifiedCatalogs.promise;
  }

  const currentFetch = global.fetch;
  const promise = (async () => {
    const html = await fetchFairplayerText(
      "/fairplayer/hub",
      "text/html",
      signal,
    );
    const catalogs = parseVerifiedFaircampCatalogs(html);
    if (catalogs.size === 0) {
      throw new Error(
        "Fairplayer hub did not list any verified Faircamp catalogs.",
      );
    }
    return catalogs;
  })();

  cachedVerifiedCatalogs = {
    fetchRef: currentFetch,
    promise,
    expiresAt: now + 5 * 60 * 1000,
  };

  promise.catch(() => {
    if (cachedVerifiedCatalogs?.promise === promise) {
      cachedVerifiedCatalogs = null;
    }
  });

  return promise;
}

async function fetchFairplayerText(
  path: string,
  accept: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(fairplayerEndpoint(path).toString(), {
    headers: { Accept: accept },
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Fairplayer request failed: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

async function fetchFairplayerJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const text = await fetchFairplayerText(path, "application/json", signal);
  return JSON.parse(text) as T;
}

export async function fetchFairplayerSongReleaseSlug(
  trackId: string,
  signal?: AbortSignal,
): Promise<string> {
  const syntheticTrack = trackId.match(/^(.+)#(\d+)$/);
  if (syntheticTrack) {
    const releaseId = syntheticTrack[1];
    if (!getFaircampDomain(releaseId)) {
      throw new Error("Invalid Fairplayer release identifier.");
    }
    return encodeReleaseSlug(releaseId);
  }
  if (!/^\d+$/.test(trackId)) {
    throw new Error("Invalid Fairplayer track identifier.");
  }
  const html = await fetchFairplayerText(
    `/fairplayer/player/song/${trackId}`,
    "text/html",
    signal,
  );
  const song = findElements(
    parseHtml(html),
    (node) =>
      node.tagName === "div" &&
      hasClass(node, "song") &&
      getAttribute(node, "data-id") === trackId,
  )[0];
  const releaseId = getFaircampReleaseId(
    getAttribute(song || { nodeName: "" }, "data-releaseurl") || "",
  );
  if (!releaseId) {
    throw new Error(`Fairplayer track has no valid release: ${trackId}`);
  }
  return encodeReleaseSlug(releaseId);
}

async function fetchVerifiedDirectoryAlbums(
  signal?: AbortSignal,
): Promise<AlbumProps[]> {
  const [html, verifiedCatalogs] = await Promise.all([
    fetchFairplayerText("/fairplayer/player/all/releases", "text/html", signal),
    fetchVerifiedFaircampCatalogs(signal),
  ]);
  const verifiedAlbums = parseFairplayerReleaseCards(html, verifiedCatalogs);

  if (verifiedAlbums.length === 0 && verifiedCatalogs.size > 0) {
    throw new Error(
      "Fairplayer release directory did not include verified Faircamp releases.",
    );
  }

  return verifiedAlbums;
}

export async function fetchFairplayerAlbums(
  take: number = 40,
  signal?: AbortSignal,
): Promise<AlbumProps[]> {
  const verifiedAlbums = (await fetchVerifiedDirectoryAlbums(signal)).filter(
    (album) => {
      const releaseId = decodeReleaseSlug(album.urlSlug);
      const domain = releaseId ? getFaircampDomain(releaseId) : undefined;
      return Boolean(domain && !isFaircampDomainBlocked(domain));
    },
  );

  const shuffled = shuffle(verifiedAlbums);
  const artistsSeen = new Map<string, number>();
  const fairAlbums = shuffled.filter((album) => {
    const key = album.artist.name.toLowerCase().trim();
    const count = artistsSeen.get(key) || 0;
    if (count >= 2) return false;
    artistsSeen.set(key, count + 1);
    return true;
  });

  return fairAlbums.slice(0, take);
}

async function fetchFairplayerSearchJson(
  searchTerm: string,
  signal?: AbortSignal,
): Promise<FairplayerSearchResponse> {
  const endpoint = fairplayerEndpoint("/fairplayer/search");
  endpoint.searchParams.set("q", searchTerm.trim());
  const response = await fetch(endpoint.toString(), {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Fairplayer search failed: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as FairplayerSearchResponse;
}

export async function searchFairplayerAlbums(
  searchTerm: string,
  signal?: AbortSignal,
): Promise<AlbumProps[]> {
  const [rawSearch, verifiedCatalogs] = await Promise.all([
    fetchFairplayerSearchJson(searchTerm, signal),
    fetchVerifiedFaircampCatalogs(signal),
  ]);
  return parseFairplayerSearchResults(rawSearch).filter((album) => {
    const releaseId = decodeReleaseSlug(album.urlSlug);
    const domain = releaseId ? getFaircampDomain(releaseId) : undefined;
    if (!releaseId || !domain || !verifiedCatalogs.has(domain)) return false;
    const catalogUrl = verifiedCatalogs.get(domain);
    album.sourceUrl = getFaircampReleaseUrl(releaseId, catalogUrl);
    recordKnownAlbum(album, catalogUrl);
    return true;
  });
}

export function parseFairplayerRelease(
  html: string,
  releaseSlug: string,
): AlbumProps {
  const releaseId = decodeReleaseSlug(releaseSlug);
  const releaseDomain = releaseId ? getFaircampDomain(releaseId) : undefined;
  if (!releaseId || !releaseDomain) {
    throw new Error("Invalid Faircamp release identifier.");
  }

  const root = parseHtml(html);
  const songs = findElements(
    root,
    (node) => node.tagName === "div" && hasClass(node, "song"),
  );

  if (songs.length === 0) {
    throw new Error(`Fairplayer release has no playable tracks: ${releaseId}`);
  }

  const albumTitle =
    getText(
      findElements(root, (node) => node.tagName === "h1")[0] || {
        nodeName: "#text",
      },
    ) || releaseId;
  const artistName = getAttribute(songs[0], "data-artist") || albumTitle;
  const artwork = getAttribute(songs[0], "data-image") || "";
  const album = toAlbumProps(releaseId, albumTitle, artistName, artwork);
  const derivedReleaseUrl = deriveReleaseUrlFromAudioUrl(
    getAttribute(songs[0], "data-url") || "",
  );
  if (derivedReleaseUrl) {
    album.sourceUrl = derivedReleaseUrl;
  }
  album.about =
    findElements(
      root,
      (node) =>
        node.tagName === "div" &&
        hasClass(node, "line-clamp-4") &&
        hasClass(node, "text-lg") &&
        findElements(node, (child) => child.tagName === "p").length > 0,
    )
      .map(getText)
      .find(Boolean) || "";

  // Summary without tracks so track.trackGroup never creates a circular reference
  const { tracks: _omittedTracks, ...trackGroupSummary } = album;

  album.tracks = songs.flatMap((song, index) => {
    const url = getAttribute(song, "data-url");
    const trackTitle = getAttribute(song, "data-title");
    if (!url || !trackTitle) return [];

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return [];
    }
    if (
      parsedUrl.protocol !== "https:" ||
      (parsedUrl.port && parsedUrl.port !== "443") ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      return [];
    }
    const trackDomain = normalizeDomain(parsedUrl.hostname);
    if (
      isFaircampDomainBlocked(trackDomain) ||
      (trackDomain !== releaseDomain && !trackDomain.endsWith(`.${releaseDomain}`))
    ) {
      return [];
    }

    const sourceTrackId = getAttribute(song, "data-id");
    const trackIdValue = sourceTrackId || `${releaseId}-${index}`;
    const numericTrackId = Number(trackIdValue);
    const trackId = Number.isSafeInteger(numericTrackId)
      ? numericTrackId
      : hashId(trackIdValue);
    const durationValue = Number(getAttribute(song, "data-duration"));
    const duration =
      Number.isFinite(durationValue) && durationValue > 0
        ? durationValue
        : undefined;

    const track: RNTrack = {
      id: trackId,
      title: trackTitle,
      artist: artistName,
      artwork,
      url,
      queueIndex: index,
      trackGroupId: album.id,
      order: index + 1,
      duration,
      isPreview: true,
      allowIndividualSale: false,
      headers: {},
      type: audioTrackType(url),
      source: "Faircamp",
      fairplayerTrackId:
        sourceTrackId && /^\d+$/.test(sourceTrackId)
          ? sourceTrackId
          : `${releaseId}#${index + 1}`,
      sourceUrl: album.sourceUrl,
      audio: { url, duration },
      trackGroup: { ...trackGroupSummary },
    };
    return [track];
  });

  if (album.tracks.length === 0) {
    throw new Error(
      `Fairplayer release contains no valid audio tracks: ${releaseId}`,
    );
  }

  recordKnownAlbum(album);
  return album;
}

export type FairplayerAlbumBundle = {
  releaseId: string;
  releaseHtml: string;
  catalogUrl?: string;
  releaseUrl?: string;
  pageHtml?: string | null;
  album?: AlbumProps;
};

export async function fetchFairplayerAlbum(
  releaseSlug: string,
  signal?: AbortSignal,
): Promise<AlbumProps> {
  const releaseId = decodeReleaseSlug(releaseSlug);
  const domain = releaseId ? getFaircampDomain(releaseId) : undefined;
  if (!releaseId || !domain) {
    throw new Error("Invalid Faircamp release identifier.");
  }

  const endpoint = fairplayerEndpoint("/fairplayer/album");
  endpoint.searchParams.set("releaseId", releaseId);
  const response = await fetch(endpoint.toString(), {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `Fairplayer request failed: ${response.status} ${response.statusText}`,
    );
  }

  const bundle = (await response.json()) as FairplayerAlbumBundle;
  // The worker's album carries the songs; the release page below adds the full about text
  const album = bundle.album ?? parseFairplayerRelease(bundle.releaseHtml, releaseSlug);
  if (bundle.releaseUrl) {
    album.sourceUrl = bundle.releaseUrl;
  } else if (bundle.catalogUrl) {
    album.sourceUrl = getFaircampReleaseUrl(releaseId, bundle.catalogUrl);
  }

  if (bundle.pageHtml && album.sourceUrl) {
    const pageDetails = parseFaircampPageDetails(
      bundle.pageHtml,
      album.sourceUrl,
    );
    if (pageDetails) {
      const richAbout = combineFaircampAbout(
        pageDetails.abstractText || album.about,
        pageDetails.aboutMarkdown,
      );
      if (richAbout) {
        album.about = richAbout;
      }

      if (pageDetails.tracks && pageDetails.tracks.length > 0 && album.tracks) {
        album.tracks.forEach((track) => {
          const trackTitle = (track.title || "").trim().toLowerCase();
          const matched = pageDetails.tracks!.find(
            (pt) => pt.title.toLowerCase() === trackTitle,
          );
          if (matched && matched.url) {
            track.url = matched.url;
            if (track.audio) {
              track.audio.url = matched.url;
            }
          }
        });
      }
    }
  }

  album.tracks?.forEach((track) => {
    track.sourceUrl = album.sourceUrl;
    if (track.trackGroup) {
      track.trackGroup.sourceUrl = album.sourceUrl;
    }
  });
  recordKnownAlbum(album, bundle.catalogUrl);
  return album;
}

function resolveFaircampArtistPageUrl(
  artistUid: string | undefined,
  catalogUrl: string | undefined,
): string | undefined {
  if (!artistUid) return catalogUrl;
  const match = artistUid.match(/^([^@]*)@([^@]+)$/);
  if (!match) return catalogUrl;
  const artistPathSlug = match[1].trim();
  const hostWithSubpath = match[2].trim();
  const [host, subpath] = hostWithSubpath.split(":");
  const base = (
    catalogUrl ||
    `https://${host}${subpath ? `/${subpath.replace(/^\/+/, "")}` : ""}`
  ).replace(/\/+$/, "");
  if (!artistPathSlug || artistPathSlug.startsWith("band-")) {
    return `${base}/`;
  }
  return `${base}/${encodeURIComponent(artistPathSlug)}/`;
}

export async function fetchFairplayerArtist(
  artistSlugOrId: string,
  signal?: AbortSignal,
): Promise<Artist | undefined> {
  const trimmed = String(artistSlugOrId || "").trim();
  if (!trimmed) return undefined;

  let artistName = decodeArtistSlug(trimmed);
  const numericId = /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;

  if (!artistName && numericId !== undefined) {
    artistName = knownArtistsById.get(numericId)?.name;
  }

  if (!artistName) {
    try {
      const res = await fetchFairplayerJson<{
        id?: number;
        name?: string;
        urlSlug?: string;
        avatar?: string;
      }>(`/fairplayer/artist?query=${encodeURIComponent(trimmed)}`, signal);
      if (res?.name) {
        artistName = res.name;
        knownArtistsById.set(numericId || hashId(`faircamp:${res.name.toLowerCase().trim()}`), { name: res.name });
      }
    } catch {
      // Fall through if endpoint is unavailable
    }
  }

  if (!artistName) return undefined;

  const targetLower = artistName.toLowerCase().trim();
  const targetArtistId = hashId(`faircamp:${targetLower}`);

  let searchedAlbums: AlbumProps[] = [];
  let matchedArtistItem: FairplayerSearchItem | undefined;
  let verifiedCatalogs = new Map<string, string>();

  try {
    const [rawSearch, catalogs] = await Promise.all([
      fetchFairplayerSearchJson(artistName, signal),
      fetchVerifiedFaircampCatalogs(signal),
    ]);
    verifiedCatalogs = catalogs;

    matchedArtistItem = (rawSearch.items || []).find((item) => {
      if (item.type !== "artist" || !item.name) return false;
      if (item.name.toLowerCase().trim() !== targetLower) return false;
      const uidDomain = item.uid ? getFaircampDomain(item.uid.replace(/^@/, "root@")) : undefined;
      return !uidDomain || verifiedCatalogs.has(uidDomain);
    });

    searchedAlbums = parseFairplayerSearchResults(rawSearch).filter((album) => {
      const releaseId = decodeReleaseSlug(album.urlSlug);
      const domain = releaseId ? getFaircampDomain(releaseId) : undefined;
      if (!releaseId || !domain || !verifiedCatalogs.has(domain)) return false;
      const catalogUrl = verifiedCatalogs.get(domain);
      album.sourceUrl = getFaircampReleaseUrl(releaseId, catalogUrl);
      recordKnownAlbum(album, catalogUrl);
      return true;
    });
  } catch {
    // Use known albums if search fails
  }

  if (matchedArtistItem?.uid) {
    try {
      const artistPageHtml = await fetchFairplayerText(
        `/fairplayer/player/artist/${encodeURIComponent(matchedArtistItem.uid)}`,
        "text/html",
        signal,
      );
      for (const album of parseFairplayerReleaseCards(artistPageHtml, verifiedCatalogs)) {
        searchedAlbums.push(album);
      }
    } catch {
      // Ignore artist page fetch failure if worker or upstream is unavailable
    }
  }

  if (searchedAlbums.length === 0 && knownAlbumsBySlug.size === 0) {
    try {
      await fetchFairplayerAlbums(200, signal);
    } catch {
      // Ignore directory failure
    }
  }

  const mergedBySlug = new Map<string, AlbumProps>();
  for (const album of [...searchedAlbums, ...knownAlbumsBySlug.values()]) {
    if (
      album.artistId === targetArtistId ||
      album.artist?.name?.toLowerCase().trim() === targetLower
    ) {
      mergedBySlug.set(album.urlSlug, album);
    }
  }

  const trackGroups = Array.from(mergedBySlug.values());
  const primaryAlbum = trackGroups[0];
  const resolvedName =
    matchedArtistItem?.name || primaryAlbum?.artist?.name || artistName;
  const primaryReleaseId = primaryAlbum ? decodeReleaseSlug(primaryAlbum.urlSlug) : undefined;
  const artistUidDomain = matchedArtistItem?.uid
    ? getFaircampDomain(matchedArtistItem.uid.replace(/^@/, "root@"))
    : undefined;
  const catalogUrl =
    (artistUidDomain ? verifiedCatalogs.get(artistUidDomain) : undefined) ||
    knownArtistsById.get(targetArtistId)?.sourceUrl ||
    (primaryReleaseId ? getFaircampSiteUrl(primaryReleaseId) : primaryAlbum?.sourceUrl);

  const artistPageUrl = resolveFaircampArtistPageUrl(
    matchedArtistItem?.uid,
    catalogUrl,
  );
  const pageDetails = await fetchFaircampPageDetails(artistPageUrl, signal);

  const avatarUri =
    matchedArtistItem?.images?.default?.src ||
    primaryAlbum?.cover?.sizes?.[600] ||
    "";
  const bannerUri = pageDetails?.bannerUrl || "";

  const bio =
    combineFaircampAbout(
      pageDetails?.abstractText || matchedArtistItem?.description,
      pageDetails?.aboutMarkdown,
      catalogUrl,
    ) || `${resolvedName} on Faircamp.`;

  return {
    id: targetArtistId,
    name: resolvedName,
    urlSlug: encodeArtistSlug(resolvedName),
    bio,
    avatar: avatarUri
      ? {
          url: avatarUri,
          sizes: coverSizes(avatarUri),
          updatedAt: "",
        }
      : undefined,
    background:
      bannerUri && bannerUri !== avatarUri
        ? {
            url: bannerUri,
            sizes: {
              625: bannerUri,
              1024: bannerUri,
              1920: bannerUri,
            },
            updatedAt: "",
          }
        : undefined,
    linksJson: pageDetails?.links?.length ? pageDetails.links : undefined,
    supportUrl: catalogUrl,
    activityPub: false,
    enabled: true,
    createdAt: "",
    trackGroups,
    userId: 0,
  };
}

export async function fetchFairplayerDiscoveryTracks(
  take: number = 2,
  signal?: AbortSignal,
): Promise<RNTrack[]> {
  if (take <= 0) return [];
  const albums = await fetchFairplayerAlbums(Math.max(take * 3, 12), signal);
  const pickedAlbums = shuffle(albums).slice(0, take);

  const settled = await Promise.allSettled(
    pickedAlbums.map((album) => fetchFairplayerAlbum(album.urlSlug, signal)),
  );

  const tracks: RNTrack[] = [];
  for (const res of settled) {
    if (res.status === "fulfilled" && res.value.tracks?.length) {
      const albumTracks = res.value.tracks;
      const randomTrack =
        albumTracks[Math.floor(Math.random() * albumTracks.length)];
      if (randomTrack) {
        tracks.push({
          ...randomTrack,
          autoplay: true,
        });
      }
    }
  }
  return tracks;
}

export function queryFairplayerAlbums(take: number = 40) {
  return queryOptions({
    queryKey: ["fairplayerAlbums", take],
    queryFn: ({ signal }) => fetchFairplayerAlbums(take, signal),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export const fairplayerReleaseSlug = {
  encode: encodeReleaseSlug,
  decode: decodeReleaseSlug,
  encodeArtist: encodeArtistSlug,
  decodeArtist: decodeArtistSlug,
  siteUrl: (slug?: string) => {
    const releaseId = slug ? decodeReleaseSlug(slug) : undefined;
    return releaseId ? getFaircampReleaseUrl(releaseId) : undefined;
  },
  artistRouteId: (slug: string) =>
    decodeReleaseSlug(slug) ? "fairplayer" : undefined,
  artistPageRouteId: (trackGroup?: {
    artistId?: number | string;
    artist?: { name?: string; urlSlug?: string };
    urlSlug?: string;
    source?: string;
  }) => {
    if (!trackGroup) return "";
    const isFaircamp =
      trackGroup.source === "Faircamp" ||
      Boolean(decodeReleaseSlug(String(trackGroup.urlSlug || "")));
    if (isFaircamp && trackGroup.artist?.name) {
      return encodeArtistSlug(trackGroup.artist.name);
    }
    return String(trackGroup.artistId || trackGroup.artist?.urlSlug || "");
  },
};


export type FairplayerCatalogSearchResult = {
  albums: AlbumProps[];
  artists: {
    id: number;
    name: string;
    urlSlug: string;
    avatarUrl?: string;
    description?: string;
  }[];
  tracks: {
    id: string | number;
    title: string;
    artistName: string;
    artistSlug: string;
    albumSlug: string;
    imageUrl?: string;
    track?: RNTrack;
  }[];
};

export async function searchFairplayerCatalog(
  searchTerm: string,
  signal?: AbortSignal,
): Promise<FairplayerCatalogSearchResult> {
  const query = searchTerm.trim().toLowerCase();
  if (query.length < 2) {
    return { albums: [], artists: [], tracks: [] };
  }

  let rawSearch: FairplayerSearchResponse = { items: [] };
  let verifiedCatalogs = new Map<string, string>();

  try {
    [rawSearch, verifiedCatalogs] = await Promise.all([
      fetchFairplayerSearchJson(searchTerm, signal),
      fetchVerifiedFaircampCatalogs(signal),
    ]);
  } catch {
    // Fall back to known in-memory verified albums if network search fails
  }

  const albumsBySlug = new Map<string, AlbumProps>();
  const artistsBySlug = new Map<
    string,
    { id: number; name: string; urlSlug: string; avatarUrl?: string; description?: string }
  >();
  const tracksOut: FairplayerCatalogSearchResult["tracks"] = [];
  const seenTrackKeys = new Set<string>();

  let remoteAlbums: AlbumProps[] = [];
  try {
    remoteAlbums = parseFairplayerSearchResults(rawSearch).filter((album) => {
      const releaseId = decodeReleaseSlug(album.urlSlug);
      const domain = releaseId ? getFaircampDomain(releaseId) : undefined;
      if (!releaseId || !domain || !verifiedCatalogs.has(domain)) return false;
      const catalogUrl = verifiedCatalogs.get(domain);
      album.sourceUrl = getFaircampReleaseUrl(releaseId, catalogUrl);
      recordKnownAlbum(album, catalogUrl);
      return true;
    });
  } catch {
    remoteAlbums = [];
  }

  for (const album of remoteAlbums) {
    albumsBySlug.set(album.urlSlug, album);
  }

  for (const known of knownAlbumsBySlug.values()) {
    const titleLower = (known.title || "").toLowerCase();
    const artistLower = (known.artist?.name || "").toLowerCase();
    const aboutLower = (known.about || "").toLowerCase();
    if (
      titleLower.includes(query) ||
      artistLower.includes(query) ||
      aboutLower.includes(query)
    ) {
      if (!albumsBySlug.has(known.urlSlug)) {
        albumsBySlug.set(known.urlSlug, known);
      }
    }
    if (known.tracks?.length) {
      for (const tr of known.tracks) {
        if (
          tr.title?.toLowerCase().includes(query) ||
          artistLower.includes(query)
        ) {
          const key = `${known.urlSlug}:${tr.title.toLowerCase()}`;
          if (!seenTrackKeys.has(key)) {
            seenTrackKeys.add(key);
            tracksOut.push({
              id: tr.id,
              title: tr.title,
              artistName: known.artist.name,
              artistSlug: "fairplayer",
              albumSlug: known.urlSlug,
              imageUrl: known.cover?.sizes?.[120] || tr.artwork,
              track: tr,
            });
          }
        }
      }
    }
  }

  const items = Array.isArray(rawSearch.items) ? rawSearch.items : [];
  for (const item of items) {
    if (item.type === "artist" && item.name) {
      const uidDomain = item.uid
        ? getFaircampDomain(item.uid.replace(/^@/, "root@"))
        : undefined;
      if (uidDomain && verifiedCatalogs.size > 0 && !verifiedCatalogs.has(uidDomain)) {
        continue;
      }
      const slug = encodeArtistSlug(item.name);
      if (!artistsBySlug.has(slug)) {
        artistsBySlug.set(slug, {
          id: hashId(`faircamp:${item.name.toLowerCase().trim()}`),
          name: item.name.trim(),
          urlSlug: slug,
          avatarUrl: item.images?.default?.src,
          description: item.description,
        });
      }
    } else if ((item.type === "track" || item.type === "song") && item.name && item.artist) {
      const artistLower = item.artist.toLowerCase().trim();
      const matchedAlbum =
        [...albumsBySlug.values()].find(
          (a) => a.artist?.name?.toLowerCase().trim() === artistLower,
        ) ||
        [...knownAlbumsBySlug.values()].find(
          (a) => a.artist?.name?.toLowerCase().trim() === artistLower,
        );
      const releaseIdFromUrl = item.url ? getFaircampReleaseId(item.url) : undefined;
      const albumSlug =
        (releaseIdFromUrl ? encodeReleaseSlug(releaseIdFromUrl) : undefined) ||
        matchedAlbum?.urlSlug;

      if (albumSlug) {
        const key = `${albumSlug}:${item.name.toLowerCase().trim()}`;
        if (!seenTrackKeys.has(key)) {
          seenTrackKeys.add(key);
          tracksOut.push({
            id: hashId(`faircamp-track:${key}`),
            title: item.name.trim(),
            artistName: item.artist.trim(),
            artistSlug: "fairplayer",
            albumSlug,
            imageUrl:
              item.images?.default?.src ||
              matchedAlbum?.cover?.sizes?.[120],
          });
        }
      }
    }
  }

  for (const album of albumsBySlug.values()) {
    if (album.artist?.name) {
      const artistSlug = encodeArtistSlug(album.artist.name);
      if (
        album.artist.name.toLowerCase().includes(query) &&
        !artistsBySlug.has(artistSlug)
      ) {
        artistsBySlug.set(artistSlug, {
          id: album.artistId,
          name: album.artist.name,
          urlSlug: artistSlug,
          avatarUrl: album.cover?.sizes?.[120],
        });
      }
    }
  }

  return {
    albums: Array.from(albumsBySlug.values()),
    artists: Array.from(artistsBySlug.values()),
    tracks: tracksOut,
  };
}
