import { distributeFairChorusAlbums } from "@/queries/chorus";
import { shuffle } from "@/scripts/utils";

export const CAROUSEL_LIMIT = 12;

export function blendCarouselReleases(
  direct: AlbumProps[] = [],
  chorus: AlbumProps[] = [],
  fairplayer: AlbumProps[] = [],
  limit: number = CAROUSEL_LIMIT,
): AlbumProps[] {
  const seenIds = new Set<number>();
  const seenSlugs = new Set<string>();
  const artistCounts = new Map<string, number>();

  const shuffledDirect = shuffle(direct);
  const shuffledChorus = distributeFairChorusAlbums(shuffle(chorus), 2);
  const shuffledFairplayer = distributeFairChorusAlbums(shuffle(fairplayer), 2);

  const combinedCandidates = shuffle([
    ...shuffledDirect,
    ...shuffledChorus,
    ...shuffledFairplayer,
  ]);

  const blended: AlbumProps[] = [];
  for (const item of combinedCandidates) {
    if (!item) continue;
    const artistKey = (item.artist?.name || String(item.artistId || "")).toLowerCase().trim();
    const count = artistCounts.get(artistKey) || 0;
    if (count >= 2) continue;
    if (seenIds.has(item.id) || (item.urlSlug && seenSlugs.has(item.urlSlug))) continue;

    seenIds.add(item.id);
    if (item.urlSlug) seenSlugs.add(item.urlSlug);
    artistCounts.set(artistKey, count + 1);
    blended.push(item);
    if (blended.length >= limit) break;
  }

  return blended;
}
