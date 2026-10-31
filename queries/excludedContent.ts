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

// Matches a listed term as a whole word, so "top" catches "Top 40" and leaves "laptop"
const EXCLUDED_TERM_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${EXCLUDED_TERMS.join("|")})(?![\\p{L}\\p{N}])`,
  "iu",
);

// Commercial networks named like "- 0 N - 2000s on Radio" and "- 1 A - Schlager"
const DASHED_NETWORK_NAME = /(?:^|\s)-\s+\S{1,2}\s+\S{1,2}\s+-(?:\s|$)/;

// Advertising copy in a name, such as "CHARTS ---> Club Classics" or "STARTS HERE @ Technolovers.fm"
const ADVERTISING_NAME = /->|→|»|>>|@/;

// Names (titles, authors) are checked for formats, advertising copy, and excluded terms
export function isExcludedContent(names: (string | undefined)[], tags: string[] = []): boolean {
  const cleanNames = names.map((name) => name || "");
  return (
    cleanNames.some((name) => DASHED_NETWORK_NAME.test(name) || ADVERTISING_NAME.test(name)) ||
    [...cleanNames, ...tags].some((text) => EXCLUDED_TERM_PATTERN.test(text))
  );
}
