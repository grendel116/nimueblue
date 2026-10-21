// The queue as the listener sees it. The app owns these sections; the audio player only
// receives their play order: history, the song playing, Your Queue, Next Up, then Discovery.
// Tracks arrive already prepared for the player (see toPlayerTrack)

export type Section = "queue" | "nextUp" | "discovery";

export type Played = { track: RNTrack; from: Section };

export interface QueueState {
  // Songs already played (or skipped past), oldest first, each remembering its section
  history: Played[];
  current?: Played;
  userQueue: RNTrack[];
  nextUp: RNTrack[];
  discovery: RNTrack[];
  // Name of what Next Up came from, and its songs in their own order for un-shuffling
  source: string;
  sourceOrder: RNTrack[];
  // Bumped whenever a new source starts, so late Discovery results for an old one are dropped
  generation: number;
}

export function isSameTrack(a: RNTrack, b: RNTrack): boolean {
  if (a.id !== undefined && b.id !== undefined) return a.id === b.id;
  if (a.liveStation && b.liveStation) return a.liveStation === b.liveStation;
  if (a.podcastEpisodeId && b.podcastEpisodeId) return a.podcastEpisodeId === b.podcastEpisodeId;
  return Boolean(a.url) && a.url === b.url;
}

export function isSameTrackOrKey(a?: RNTrack, b?: RNTrack): boolean {
  if (!a || !b) return false;
  if (a._queueKey && b._queueKey && a._queueKey === b._queueKey) return true;
  return isSameTrack(a, b);
}

export const HISTORY_LIMIT = 50;

export const emptyQueue: QueueState = {
  history: [],
  userQueue: [],
  nextUp: [],
  discovery: [],
  source: "",
  sourceOrder: [],
  generation: 0,
};

/**
 * Strips heavy metadata (full artist bios, 7 cover sizes, circular album tracks)
 * from track objects before entering the queue. Keeps JSON payloads small and prevents
 * JS thread choking during queue updates.
 */
export function toNormalizedTrack(t: RNTrack): RNTrack {
  if (!t) return t;
  const cover = t.trackGroup?.cover as any;
  const artwork =
    t.artwork ||
    cover?.sizes?.[300] ||
    cover?.sizes?.[600] ||
    cover?.sizes?.[120] ||
    (typeof cover === "string" ? cover : cover?.url) ||
    undefined;

  const artistName =
    (typeof t.artist === "string" && t.artist) ||
    (t.artist as any)?.name ||
    t.trackArtists?.[0]?.artistName ||
    t.trackGroup?.artist?.name ||
    "Unknown Artist";

  const cleanGroup = t.trackGroup
    ? {
        id: t.trackGroup.id ?? t.trackGroupId ?? 0,
        title: t.trackGroup.title || "",
        urlSlug: t.trackGroup.urlSlug || "",
        releaseDate: t.trackGroup.releaseDate || "",
        trackGroupId: t.trackGroup.trackGroupId ?? t.trackGroupId ?? 0,
        artistId: t.trackGroup.artistId ?? t.trackGroup.artist?.id ?? 0,
        artist: {
          id: t.trackGroup.artist?.id ?? 0,
          name: artistName,
          urlSlug: t.trackGroup.artist?.urlSlug || "",
          bio: "",
          activityPub: false,
          userId: t.trackGroup.artist?.userId ?? 0,
          enabled: true,
        },
        cover: {
          sizes: {
            60: artwork || "",
            120: artwork || "",
            300: artwork || "",
            600: artwork || "",
            960: artwork || "",
            1200: artwork || "",
            1500: artwork || "",
          },
        },
        source: t.trackGroup.source,
        sourceUrl: t.trackGroup.sourceUrl,
      }
    : undefined;

  return {
    ...t,
    artwork,
    artist: artistName,
    trackGroup: cleanGroup as any,
    trackArtists: undefined,
  };
}

let nextEntryId = 1;

// A fresh queue entry: its own key so the same song can sit in the queue twice
function entry(track: RNTrack, autoplay?: true): RNTrack {
  const norm = toNormalizedTrack(track);
  return {
    ...norm,
    _queueKey: track._queueKey || `q${Date.now().toString(36)}-${nextEntryId++}`,
    autoplay: autoplay || norm.autoplay,
  };
}

function keepRecent(history: Played[]): Played[] {
  return history.length > HISTORY_LIMIT ? history.slice(history.length - HISTORY_LIMIT) : history;
}

// The order the audio player holds, and where the song playing sits in it
export function playOrder(state: QueueState, options?: { isOnline?: boolean }): { tracks: RNTrack[]; index: number } {
  if (!state.current) return { tracks: [], index: -1 };
  const discoveryTracks = options?.isOnline === false ? [] : state.discovery;
  return {
    tracks: [
      ...state.history.map((h) => h.track),
      state.current.track,
      ...state.userQueue,
      ...state.nextUp,
      ...discoveryTracks,
    ],
    index: state.history.length,
  };
}

// What the queue screen shows below Your Queue: Next Up, then Discovery
export function upcoming(state: QueueState): RNTrack[] {
  return [...state.nextUp, ...state.discovery];
}

// Starts `tracks[startIndex]`; the songs after it become Next Up. Your Queue and Discovery stay
export function play(
  state: QueueState,
  tracks: RNTrack[],
  startIndex: number,
  source: string,
  sourceOrder: RNTrack[] = tracks,
): QueueState {
  const prepared = tracks.map((t) => entry(t));
  const start = Math.min(Math.max(0, startIndex), prepared.length - 1);
  if (start < 0) return state;

  const currentTrack = prepared[start];
  const nextUp = prepared.slice(start + 1);
  const nextUpIds = new Set(nextUp.map((t) => t.id).filter((id) => id !== undefined));
  const nextUpUrls = new Set(nextUp.map((t) => t.url).filter(Boolean));
  if (currentTrack.id !== undefined) nextUpIds.add(currentTrack.id);
  if (currentTrack.url) nextUpUrls.add(currentTrack.url);

  // Preserve already-fetched Discovery tracks, filtering out any songs now playing or in Next Up
  const retainedDiscovery = state.discovery.filter(
    (t) =>
      (t.id === undefined || !nextUpIds.has(t.id)) &&
      (!t.url || !nextUpUrls.has(t.url))
  );

  return {
    ...state,
    history: keepRecent(state.current ? [...state.history, state.current] : state.history),
    current: { track: currentTrack, from: "nextUp" },
    nextUp,
    discovery: retainedDiscovery,
    source,
    sourceOrder,
    generation: state.generation + 1,
  };
}

// Puts a song at the bottom of Your Queue, whether or not anything is playing
export function addToQueue(state: QueueState, track: RNTrack): QueueState {
  return { ...state, userQueue: [...state.userQueue, entry(track)] };
}

export function removeFromQueue(state: QueueState, index: number): QueueState {
  if (index < 0 || index >= state.userQueue.length) return state;
  return { ...state, userQueue: state.userQueue.filter((_, i) => i !== index) };
}

export function clearQueue(state: QueueState): QueueState {
  return { ...state, userQueue: [] };
}

// The song after the current one, in play order, with the section it comes from
function takeNext(state: QueueState, isOnline = true): { track: RNTrack; from: Section; rest: QueueState } | undefined {
  if (state.userQueue.length > 0) {
    return { track: state.userQueue[0], from: "queue", rest: { ...state, userQueue: state.userQueue.slice(1) } };
  }
  if (state.nextUp.length > 0) {
    return { track: state.nextUp[0], from: "nextUp", rest: { ...state, nextUp: state.nextUp.slice(1) } };
  }
  if (isOnline && state.discovery.length > 0) {
    return { track: state.discovery[0], from: "discovery", rest: { ...state, discovery: state.discovery.slice(1) } };
  }
  return undefined;
}

// Moves forward `steps` songs in play order. Songs passed over join the history, so
// skipping deep into Your Queue removes the songs above it from Your Queue.
// With nothing playing, the first step starts the top of Your Queue
export function advance(state: QueueState, steps = 1, isOnline = true): QueueState {
  let next = state;
  for (let i = 0; i < steps; i++) {
    const taken = takeNext(next, isOnline);
    if (!taken) break;
    next = {
      ...taken.rest,
      history: keepRecent(next.current ? [...next.history, next.current] : next.history),
      current: { track: taken.track, from: taken.from },
    };
  }
  return next;
}

// Goes back one song: the song playing returns to the top of the section it came from
export function back(state: QueueState): QueueState {
  if (!state.current || state.history.length === 0) return state;
  const previous = state.history[state.history.length - 1];
  const returning = state.current;
  const restored = {
    ...state,
    history: state.history.slice(0, -1),
    current: previous,
  };
  if (returning.from === "queue") return { ...restored, userQueue: [returning.track, ...state.userQueue] };
  if (returning.from === "discovery") return { ...restored, discovery: [returning.track, ...state.discovery] };
  return { ...restored, nextUp: [returning.track, ...state.nextUp] };
}

// Follows the audio player to a new position in the play order
export function moveTo(state: QueueState, target: number | RNTrack, isOnline = true): QueueState {
  if (!state.current) return state;
  let index: number;
  if (typeof target === "number") {
    index = target;
  } else {
    if (isSameTrackOrKey(state.current.track, target)) return state;
    const { tracks } = playOrder(state, { isOnline });
    const foundIndex = tracks.findIndex((t) => isSameTrackOrKey(t, target));
    if (foundIndex === -1) return state;
    index = foundIndex;
  }
  let next = state;
  while (next.current && next.history.length > index && next.history.length > 0) next = back(next);
  if (next.current && index > next.history.length) next = advance(next, index - next.history.length, isOnline);
  return next;
}

// Plays a song from Your Queue now; the songs above it leave Your Queue
export function playFromQueue(state: QueueState, index: number): QueueState {
  if (index < 0 || index >= state.userQueue.length) return state;
  return advance(state, index + 1);
}

// Plays a song from Next Up or Discovery now. The songs above it in those sections are
// skipped; Your Queue stays and plays next
export function playFromUpcoming(state: QueueState, index: number): QueueState {
  const list = upcoming(state);
  if (index < 0 || index >= list.length) return state;
  const skipped: Played[] = list.slice(0, index).map((track, i) => ({
    track,
    from: i < state.nextUp.length ? "nextUp" : "discovery",
  }));
  const inNextUp = index < state.nextUp.length;
  return {
    ...state,
    history: keepRecent([...state.history, ...(state.current ? [state.current] : []), ...skipped]),
    current: { track: list[index], from: inNextUp ? "nextUp" : "discovery" },
    nextUp: inNextUp ? state.nextUp.slice(index + 1) : [],
    discovery: inNextUp ? state.discovery : state.discovery.slice(index - state.nextUp.length + 1),
  };
}

export type Slot = { section: "queue" | "upcoming"; index: number };

// Drag and drop between Your Queue and the list below it. Songs dropped into Your Queue
// become yours; songs dropped below it join Next Up, or Discovery if dropped among those
export function moveItem(state: QueueState, from: Slot, to: Slot): QueueState {
  if (from.section === to.section && from.index === to.index) return state;
  let { userQueue, nextUp, discovery } = state;
  let track: RNTrack | undefined;
  if (from.section === "queue") {
    track = userQueue[from.index];
    userQueue = userQueue.filter((_, i) => i !== from.index);
  } else if (from.index < nextUp.length) {
    track = nextUp[from.index];
    nextUp = nextUp.filter((_, i) => i !== from.index);
  } else {
    const d = from.index - nextUp.length;
    track = discovery[d];
    discovery = discovery.filter((_, i) => i !== d);
  }
  if (!track) return state;

  const fromDiscovery = from.section === "upcoming" && Boolean(track.autoplay);
  const intoNextUp = to.index < nextUp.length || (to.index === nextUp.length && !fromDiscovery);

  if (to.section === "queue") {
    const at = Math.min(Math.max(0, to.index), userQueue.length);
    userQueue = [...userQueue.slice(0, at), { ...track, autoplay: undefined }, ...userQueue.slice(at)];
  } else if (intoNextUp) {
    const at = Math.max(0, to.index);
    nextUp = [...nextUp.slice(0, at), { ...track, autoplay: undefined }, ...nextUp.slice(at)];
  } else {
    const at = Math.min(Math.max(0, to.index - nextUp.length), discovery.length);
    discovery = [...discovery.slice(0, at), { ...track, autoplay: true }, ...discovery.slice(at)];
  }
  return { ...state, userQueue, nextUp, discovery };
}

// Adds Discovery songs after Next Up, unless a newer source has started since they were asked for
export function addDiscovery(state: QueueState, tracks: RNTrack[], generation: number): QueueState {
  if (generation !== state.generation || tracks.length === 0) return state;
  const known = allTracks(state);
  const knownIds = new Set(known.map((t) => t.id).filter((id) => id !== undefined));
  const knownUrls = new Set(known.map((t) => t.url).filter(Boolean));
  const novel = tracks.filter(
    (t) => (t.id === undefined || !knownIds.has(t.id)) && (!t.url || !knownUrls.has(t.url)),
  );
  if (novel.length === 0) return state;
  return { ...state, discovery: [...state.discovery, ...novel.map((t) => entry(t, true))] };
}

export function clearDiscovery(state: QueueState): QueueState {
  return state.discovery.length === 0 ? state : { ...state, discovery: [] };
}

// Shuffle mixes Next Up only; turning it off puts Next Up back in the source's order
export function shuffleNextUp(state: QueueState, on: boolean, mix: (t: RNTrack[]) => RNTrack[]): QueueState {
  if (state.nextUp.length < 2) return state;
  if (on) return { ...state, nextUp: mix(state.nextUp) };
  const position = (t: RNTrack) => {
    const i = state.sourceOrder.findIndex(
      (o) => (o.id !== undefined && o.id === t.id) || (Boolean(o.url) && o.url === t.url),
    );
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return { ...state, nextUp: [...state.nextUp].sort((a, b) => position(a) - position(b)) };
}

// Drops songs everywhere except the one playing, e.g. a deleted download
export function removeWhere(state: QueueState, gone: (t: RNTrack) => boolean): QueueState {
  const keep = (list: RNTrack[]) => list.filter((t) => !gone(t));
  return {
    ...state,
    history: state.history.filter((h) => !gone(h.track)),
    userQueue: keep(state.userQueue),
    nextUp: keep(state.nextUp),
    discovery: keep(state.discovery),
  };
}

// Every song known to the queue, for leaving duplicates out of Discovery
export function allTracks(state: QueueState): RNTrack[] {
  return [
    ...state.history.map((h) => h.track),
    ...(state.current ? [state.current.track] : []),
    ...state.userQueue,
    ...state.nextUp,
    ...state.discovery,
  ];
}

// What's saved between launches
export function toSaved(state: QueueState): string {
  const { sourceOrder: _order, generation: _gen, ...saved } = state;
  return JSON.stringify(saved);
}

export function fromSaved(raw: string | null): QueueState {
  if (!raw) return emptyQueue;
  try {
    const saved = JSON.parse(raw) as Partial<QueueState>;
    return {
      ...emptyQueue,
      history: Array.isArray(saved.history)
        ? saved.history.map((h) => ({ ...h, track: toNormalizedTrack(h.track) }))
        : [],
      current: saved.current
        ? { ...saved.current, track: toNormalizedTrack(saved.current.track) }
        : undefined,
      userQueue: Array.isArray(saved.userQueue)
        ? saved.userQueue.map((t) => toNormalizedTrack(t))
        : [],
      nextUp: Array.isArray(saved.nextUp)
        ? saved.nextUp.map((t) => toNormalizedTrack(t))
        : [],
      discovery: Array.isArray(saved.discovery)
        ? saved.discovery.map((t) => toNormalizedTrack(t))
        : [],
      source: typeof saved.source === "string" ? saved.source : "",
    };
  } catch {
    return emptyQueue;
  }
}
