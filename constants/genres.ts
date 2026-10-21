import Ionicons from "@expo/vector-icons/Ionicons";

export type GenreDefinition = {
  id: string;
  name: string;
  subtitle: string;
  primaryTag: string;
  tags: string[];
  keywords: string[];
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  accentSoft: string;
};

export const GENRE_CATALOG: GenreDefinition[] = [
  {
    id: "electronic",
    name: "Electronic",
    subtitle: "IDM, Modular, Downtempo & Beats",
    primaryTag: "electronic",
    tags: ["electronic", "electronica", "idm", "electro", "downtempo", "glitch", "breakbeat"],
    keywords: ["electronic", "electronica", "idm", "electro", "downtempo", "glitch", "synth"],
    icon: "hardware-chip-outline",
    accent: "#00d2ff",
    accentSoft: "rgba(0, 210, 255, 0.14)",
  },
  {
    id: "ambient",
    name: "Ambient & Drone",
    subtitle: "Soundscapes, Deep Listening & Field",
    primaryTag: "ambient",
    tags: ["ambient", "drone", "soundscape", "dark-ambient", "field-recording", "new-age", "minimal"],
    keywords: ["ambient", "drone", "soundscape", "soundscapes", "atmospheric", "meditative", "chill"],
    icon: "planet-outline",
    accent: "#38bdf8",
    accentSoft: "rgba(56, 189, 248, 0.14)",
  },
  {
    id: "indie",
    name: "Indie & Alternative",
    subtitle: "Dream Pop, Shoegaze & Bedroom Pop",
    primaryTag: "indie",
    tags: ["indie", "alternative", "indie-rock", "indie-pop", "shoegaze", "dream-pop", "lo-fi"],
    keywords: ["indie", "alternative", "shoegaze", "dreampop", "dream-pop", "bedroom"],
    icon: "sparkles-outline",
    accent: "#818cf8",
    accentSoft: "rgba(129, 140, 248, 0.14)",
  },
  {
    id: "experimental",
    name: "Experimental",
    subtitle: "Avant-Garde, Noise & Electroacoustic",
    primaryTag: "experimental",
    tags: ["experimental", "avant-garde", "noise", "electroacoustic", "improvisation", "modular", "industrial"],
    keywords: ["experimental", "avant", "avant-garde", "noise", "electroacoustic", "improv", "industrial"],
    icon: "pulse-outline",
    accent: "#c084fc",
    accentSoft: "rgba(192, 132, 252, 0.14)",
  },
  {
    id: "folk",
    name: "Folk & Acoustic",
    subtitle: "Singer-Songwriter, Americana & Roots",
    primaryTag: "folk",
    tags: ["folk", "acoustic", "singer-songwriter", "americana", "indie-folk", "country", "bluegrass"],
    keywords: ["folk", "acoustic", "singer-songwriter", "songwriter", "americana", "roots", "guitar"],
    icon: "leaf-outline",
    accent: "#34d399",
    accentSoft: "rgba(52, 211, 153, 0.14)",
  },
  {
    id: "synth",
    name: "Synth & Wave",
    subtitle: "Synthwave, Darkwave, Disco & Coldwave",
    primaryTag: "synthwave",
    tags: ["synth", "synthwave", "synthpop", "darkwave", "coldwave", "disco", "nu-disco", "italo-disco", "retrowave"],
    keywords: ["synth", "synthwave", "synthpop", "darkwave", "coldwave", "disco", "retrowave", "new-wave"],
    icon: "radio-outline",
    accent: "#f472b6",
    accentSoft: "rgba(244, 114, 182, 0.14)",
  },
  {
    id: "hip-hop",
    name: "Hip-Hop & Beats",
    subtitle: "Rap, Instrumental Beats & Boom Bap",
    primaryTag: "hip-hop",
    tags: ["hip-hop", "beats", "rap", "instrumental-hip-hop", "boom-bap", "trip-hop", "lofi"],
    keywords: ["hip-hop", "hiphop", "hip hop", "beats", "rap", "boombap", "boom-bap", "trip-hop"],
    icon: "disc-outline",
    accent: "#fbbf24",
    accentSoft: "rgba(251, 191, 36, 0.14)",
  },
  {
    id: "punk",
    name: "Punk & DIY",
    subtitle: "Post-Punk, Hardcore, Garage & Emo",
    primaryTag: "punk",
    tags: ["punk", "post-punk", "hardcore", "diy", "emo", "garage", "anarcho-punk", "pop-punk"],
    keywords: ["punk", "post-punk", "hardcore", "diy", "emo", "garage", "screamo"],
    icon: "flash-outline",
    accent: "#fb7185",
    accentSoft: "rgba(251, 113, 133, 0.14)",
  },
  {
    id: "rock",
    name: "Rock & Metal",
    subtitle: "Post-Rock, Psychedelic, Metal & Prog",
    primaryTag: "rock",
    tags: ["rock", "post-rock", "psychedelic", "metal", "krautrock", "prog", "stoner", "math-rock"],
    keywords: ["rock", "post-rock", "psychedelic", "metal", "krautrock", "prog", "heavy"],
    icon: "flame-outline",
    accent: "#f87171",
    accentSoft: "rgba(248, 113, 113, 0.14)",
  },
  {
    id: "jazz",
    name: "Jazz, Soul & Funk",
    subtitle: "Improvisation, Groove, Fusion & R&B",
    primaryTag: "jazz",
    tags: ["jazz", "soul", "funk", "free-jazz", "nu-jazz", "rnb", "blues", "fusion"],
    keywords: ["jazz", "soul", "funk", "rnb", "r&b", "blues", "fusion", "groove"],
    icon: "musical-notes-outline",
    accent: "#60a5fa",
    accentSoft: "rgba(96, 165, 250, 0.14)",
  },
  {
    id: "club",
    name: "Club, House & Techno",
    subtitle: "Techno, House, Jungle, Dub & Bass",
    primaryTag: "techno",
    tags: ["techno", "house", "drum-and-bass", "jungle", "dub", "trance", "uk-garage", "footwork"],
    keywords: ["techno", "house", "club", "dance", "jungle", "dnb", "drum-and-bass", "dub", "bass"],
    icon: "infinite-outline",
    accent: "#2dd4bf",
    accentSoft: "rgba(45, 212, 191, 0.14)",
  },
  {
    id: "soundtrack",
    name: "Soundtrack & Classical",
    subtitle: "Modern Classical, Piano, Score & Chiptune",
    primaryTag: "soundtrack",
    tags: ["soundtrack", "classical", "modern-classical", "piano", "instrumental", "chiptune", "game-music", "orchestral"],
    keywords: ["soundtrack", "classical", "piano", "instrumental", "score", "chiptune", "orchestral", "cinematic"],
    icon: "film-outline",
    accent: "#a78bfa",
    accentSoft: "rgba(167, 139, 250, 0.14)",
  },
];

export function findGenreByTag(tagOrId?: string): GenreDefinition | undefined {
  if (!tagOrId) return undefined;
  const clean = tagOrId.toLowerCase().replace(/^#/, "").trim();
  if (!clean) return undefined;
  return (
    GENRE_CATALOG.find(
      (g) => g.id === clean || g.primaryTag === clean || g.name.toLowerCase() === clean,
    ) ||
    GENRE_CATALOG.find((g) => g.tags.includes(clean))
  );
}

export function matchGenres(query: string): GenreDefinition[] {
  const clean = query.toLowerCase().replace(/^#/, "").trim();
  if (!clean) return [];
  const tokens = clean.split(/[\s,/-]+/).filter(Boolean);

  return GENRE_CATALOG.filter((genre) => {
    const nameLower = genre.name.toLowerCase();
    const subLower = genre.subtitle.toLowerCase();
    if (
      genre.id.includes(clean) ||
      genre.primaryTag.includes(clean) ||
      nameLower.includes(clean) ||
      subLower.includes(clean)
    ) {
      return true;
    }
    if (genre.tags.some((t) => t.includes(clean) || clean.includes(t))) {
      return true;
    }
    if (genre.keywords.some((k) => k.includes(clean) || clean.includes(k))) {
      return true;
    }
    return tokens.length > 0 && tokens.every((tok) =>
      nameLower.includes(tok) ||
      subLower.includes(tok) ||
      genre.tags.some((t) => t.includes(tok)) ||
      genre.keywords.some((k) => k.includes(tok))
    );
  });
}

export function getGenreExpansionTags(tagOrGenre: string): string[] {
  const clean = tagOrGenre.toLowerCase().replace(/^#/, "").trim();
  if (!clean) return [];
  const exactGenre = GENRE_CATALOG.find(
    (g) => g.id === clean || g.primaryTag === clean || g.name.toLowerCase() === clean,
  );
  if (exactGenre) {
    return Array.from(new Set([clean, ...exactGenre.tags]));
  }
  const parentGenre = GENRE_CATALOG.find((g) => g.tags.includes(clean));
  if (parentGenre) {
    return Array.from(new Set([clean, parentGenre.primaryTag, ...parentGenre.tags.slice(0, 4)]));
  }
  return [clean];
}
