import * as api from "@/queries/fetch/fetchWrapper";
import { API_KEY } from "@/constants/api-key";
import { shuffle, trackStreamPath } from "@/scripts/utils";
import { isTrackDisabledSync } from "@/scripts/trackPlayUtils";
import { fetchFairplayerDiscoveryTracks } from "@/queries/fairplayer";

export const AUTOPLAY_SOURCE = "Discovery";

async function fetchMirloDiscoveryTracks(take: number): Promise<RNTrack[]> {
  const params = new URLSearchParams({
    take: String(take),
    orderBy: "random",
    distinctArtists: "true",
    isReleased: "released",
  });
  const { results } = await api.get<{ results: any[] }>(`/v1/trackGroups?${params}`, {});

  return (results || []).flatMap((album): RNTrack[] => {
    const previews = [...(album.tracks || [])]
      .filter((t: any) => t?.id && t.isPreview && !isTrackDisabledSync(Number(t.id)))
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    const t = previews.find((p: any) => p.isFeatured) ?? previews[0];
    if (!t) return [];
    return [
      {
        id: t.id,
        title: t.title,
        artist: album.artist?.name || "",
        artwork: album.cover?.sizes?.[600] || "",
        url: "",
        audio: { url: trackStreamPath(t.id), duration: undefined },
        queueIndex: 0,
        trackGroupId: album.id,
        trackGroup: {
          id: album.id,
          trackGroupId: album.id,
          title: album.title,
          artist: album.artist,
          artistId: album.artistId,
          urlSlug: album.urlSlug,
          cover: album.cover,
          releaseDate: album.releaseDate,
          userTrackGroupPurchases: [],
        },
        isPreview: true,
        order: t.order ?? 0,
        allowIndividualSale: Boolean(t.allowIndividualSale),
        headers: { "mirlo-api-key": API_KEY },
        autoplay: true,
      },
    ];
  });
}

// Fetches previews from a random set of Mirlo and verified Faircamp releases to continue
// playback after the current playlist runs out.
export async function fetchDiscoveryTracks(take: number): Promise<RNTrack[]> {
  if (take <= 0) return [];
  const faircampTarget = Math.max(1, Math.floor(take / 2));

  const [mirloResult, faircampResult] = await Promise.allSettled([
    fetchMirloDiscoveryTracks(take),
    fetchFairplayerDiscoveryTracks(faircampTarget),
  ]);

  const mirloTracks = mirloResult.status === "fulfilled" ? mirloResult.value : [];
  const faircampTracks =
    faircampResult.status === "fulfilled" ? faircampResult.value : [];

  if (mirloTracks.length === 0 && faircampTracks.length === 0) {
    if (mirloResult.status === "rejected") throw mirloResult.reason;
    return [];
  }

  const selectedFaircamp = faircampTracks.slice(0, faircampTarget);
  const remainingSlots = Math.max(0, take - selectedFaircamp.length);
  const selectedMirlo = shuffle(mirloTracks).slice(0, remainingSlots);

  return shuffle([...selectedMirlo, ...selectedFaircamp]);
}
