// Words that keep a station or podcast out of the lineup when they appear in its name or tags:
// commercial chart formats ("#100 BEST IBIZA DEEP HOUSE", "top 40", "singlecharts"), K-Pop, and Forbes
export const EXCLUDED_TERMS = [
  "100",
  "top",
  "chart",
  "charts",
  "singlecharts",
  "partycharts",
  "hot ac",
  "k-pop",
  "kpop",
  "k pop",
  "korean pop",
  "forbes",
];

// Fascist, white-nationalist and Christian-nationalist movements and their media. Each entry names
// the movement, its organizations or its outlets; the bare word "America" is not blocked, so
// Americana, Latin America and "Native America" stay in. A pattern is a regular expression source.
export const FASCIST_MOVEMENT_PATTERNS = [
  // Nazism and its descendants. "anti-nazi" and "antifascist" titles stay in
  "(?<!anti[-\\s]?)nazis?",
  "neo[-\\s]?nazis?",
  "national[-\\s]socialis[mt]",
  "(?<!anti[-\\s]?)fascis[mt]s?",
  "white[-\\s](?:nationalis[mt]s?|supremac(?:y|ists?)|power|pride|genocide)",
  "alt[-\\s]?right",
  "identitarian",
  "race[-\\s]realis[mt]",
  "stormfront",
  "third[-\\s]position",
  // Christian nationalism
  "christian[-\\s](?:nationalis[mt]s?|reconstructionis[mt]|dominionis[mt])",
  "dominionis[mt]",
  "new[-\\s]apostolic[-\\s]reformation",
  "seven[-\\s]mountains?",
  "christian[-\\s]identity",
  "god[,\\s]+guns?[,\\s]+(?:and[-\\s]+)?(?:country|glory)",
  "one[-\\s]nation[-\\s]under[-\\s]god",
  // American nationalism and militia politics
  "american[-\\s](?:nationalis[mt]s?|patriots?|first|freedom[-\\s](?:radio|network|news))",
  "patriot[-\\s](?:radio|news|network|talk|nation|front)",
  "america[-\\s]first",
  "make[-\\s]america[-\\s]great",
  "maga",
  "proud[-\\s]boys",
  "oath[-\\s]keepers",
  "three[-\\s]percenters?",
  "boogaloo",
  "qanon",
  "turning[-\\s]point[-\\s](?:usa|action)",
  // Outlets and hosts of the American far right
  "infowars",
  "breitbart",
  "newsmax",
  "daily[-\\s]wire",
  "the[-\\s]blaze",
  "oann",
  "one[-\\s]america[-\\s]news",
  "(?:alex[-\\s]jones|steve[-\\s]bannon|charlie[-\\s]kirk|tucker[-\\s]carlson|rush[-\\s]limbaugh|glenn[-\\s]beck|sean[-\\s]hannity|michael[-\\s]savage|laura[-\\s]ingraham)",
];

// Matches a listed term as a whole word, so "top" catches "Top 40" and leaves "laptop"
const EXCLUDED_TERM_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${EXCLUDED_TERMS.join("|")})(?![\\p{L}\\p{N}])`,
  "iu",
);

// Matches a movement as whole words, in a name, a tag or a description
const FASCIST_MOVEMENT_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${FASCIST_MOVEMENT_PATTERNS.join("|")})(?![\\p{L}\\p{N}])`,
  "iu",
);

// Commercial networks named like "- 0 N - 2000s on Radio" and "- 1 A - Schlager"
const DASHED_NETWORK_NAME = /(?:^|\s)-\s+\S{1,2}\s+\S{1,2}\s+-(?:\s|$)/;

// Advertising copy in a name, such as "CHARTS ---> Club Classics" or "STARTS HERE @ Technolovers.fm"
const ADVERTISING_NAME = /->|→|»|>>|@/;

// Names (titles, authors) are checked for formats, advertising copy, and excluded terms;
// names and tags are both checked for fascist movements
export function isExcludedContent(names: (string | undefined)[], tags: string[] = []): boolean {
  const cleanNames = names.map((name) => name || "");
  return (
    cleanNames.some((name) => DASHED_NETWORK_NAME.test(name) || ADVERTISING_NAME.test(name)) ||
    [...cleanNames, ...tags].some(
      (text) => EXCLUDED_TERM_PATTERN.test(text) || FASCIST_MOVEMENT_PATTERN.test(text),
    )
  );
}
