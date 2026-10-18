import { router } from "expo-router";
import * as api from "@/queries/fetch/fetchWrapper";
import { queryClient } from "@/queries/QueryClientWrapper";
import { queryAlbum, queryArtist } from "@/queries/queries";
import { fairplayerReleaseSlug, searchFairplayerAlbums } from "@/queries/fairplayer";
import { albumHref } from "@/scripts/routes";
import {
  DownloadedAlbum,
  getDownloadedTracks,
  groupTracksIntoAlbums,
  nameKey,
  sameAlbum,
  savedAlbumSlug,
  savedArtistSlug,
} from "@/scripts/downloadManager";

// An offline phone shouldn't wait long before opening the page made from the files
const LOOKUP_TIMEOUT_MS = 4000;

// The Mirlo or Faircamp page of an album, matched by title and artist; null when none matches
export async function findOnlineAlbum(wanted: {
  title?: string;
  artist?: string;
}): Promise<AlbumProps | null> {
  if (!wanted.title) return null;
  const [mirlo, faircamp] = await Promise.allSettled([
    api.getMany<AlbumProps>("/v1/trackGroups", {}, { title: wanted.title }),
    searchFairplayerAlbums(wanted.title),
  ]);
  const candidates = [
    ...(mirlo.status === "fulfilled" ? mirlo.value.results : []),
    ...(faircamp.status === "fulfilled" ? faircamp.value : []),
  ];
  return (
    candidates.find((c) => sameAlbum(wanted, { title: c.title, artist: c.artist?.name })) ?? null
  );
}

// Finds the Mirlo or Faircamp page of a song kept on the phone, and returns that page's copy
// of the song, which the share link is built from. Nothing comes back when no page matches
export async function findOnlineSong(track: RNTrack): Promise<RNTrack | undefined> {
  const page = await findOnlineAlbum({ title: track.trackGroup?.title, artist: track.artist });
  if (!page) return undefined;

  const { result } = await queryClient.fetchQuery(
    queryAlbum({ slug: page.urlSlug, id: String(page.artist?.urlSlug ?? page.artistId) }),
  );
  const songs = result.tracks ?? [];
  return songs.find((s) => nameKey(s.title) === nameKey(track.title)) ?? songs[0];
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Took too long")), LOOKUP_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function savedAlbum(albumKey: string): Promise<DownloadedAlbum | undefined> {
  return groupTracksIntoAlbums(await getDownloadedTracks()).find((a) => a.key === albumKey);
}

// A downloaded album's Mirlo or Faircamp page, only when that page loads right now. Offline,
// or with no match, nothing comes back and the album uses the page made from its files. Each
// album is matched once; loading the page here also has it ready when it opens
async function reachableOnlinePage(album: DownloadedAlbum): Promise<AlbumProps | null> {
  try {
    const page = await queryClient.fetchQuery({
      queryKey: ["onlineAlbum", nameKey(album.title), nameKey(album.artist)],
      queryFn: () => withTimeout(findOnlineAlbum({ title: album.title, artist: album.artist })),
      staleTime: Infinity,
    });
    const href = albumHref(page ?? undefined);
    if (!href) return null;
    await withTimeout(queryClient.fetchQuery(queryAlbum(href.params)));
    return page;
  } catch {
    return null;
  }
}

// Opens a downloaded album the way every other album opens: its Mirlo or Faircamp page, or the
// page made from its files when there is none or the phone is offline
export async function openDownloadedAlbum(albumKey: string): Promise<void> {
  const album = await savedAlbum(albumKey);
  if (!album) return;
  const page = await reachableOnlinePage(album);
  router.push(
    albumHref(page ?? undefined) ?? {
      pathname: "/artist/[id]/album/[slug]/album-tracks",
      params: { id: savedArtistSlug(album.artist), slug: savedAlbumSlug(album.key) },
    },
  );
}

// Opens the artist of a downloaded album the same way: the online artist page when it loads,
// otherwise the page listing the artist's saved albums
export async function openDownloadedArtist(albumKey: string): Promise<void> {
  const album = await savedAlbum(albumKey);
  if (!album) return;
  const page = await reachableOnlinePage(album);
  let id = savedArtistSlug(album.artist);
  if (page) {
    const onlineId = fairplayerReleaseSlug.artistPageRouteId(page);
    const loads = await withTimeout(queryClient.fetchQuery(queryArtist({ artistSlug: onlineId })))
      .then(() => true)
      .catch(() => false);
    if (loads) id = onlineId;
  }
  router.push({ pathname: "/artist/[id]/artist-page", params: { id } });
}
