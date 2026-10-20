import {
  emptyQueue,
  play,
  addToQueue,
  advance,
  back,
  moveTo,
  playFromQueue,
  playFromUpcoming,
  moveItem,
  addDiscovery,
  playOrder,
  upcoming,
  shuffleNextUp,
  removeFromQueue,
  clearQueue,
  toSaved,
  fromSaved,
  type QueueState,
} from "../state/player/queueModel";

const song = (id: number, title = `Song ${id}`): RNTrack =>
  ({ id, title, url: `https://example.com/${id}.mp3` }) as RNTrack;

const album = [song(1), song(2), song(3), song(4)];
const titles = (list: RNTrack[]) => list.map((t) => t.title);
const ids = (list: RNTrack[]) => list.map((t) => t.id);

function playing(state: QueueState) {
  return state.current?.track.id;
}

describe("queue model", () => {
  test("adding with nothing playing puts the song in Your Queue without starting it", () => {
    const s = addToQueue(emptyQueue, song(9, "Radio"));
    expect(s.current).toBeUndefined();
    expect(titles(s.userQueue)).toEqual(["Radio"]);
    expect(playOrder(s).tracks).toEqual([]);
  });

  test("playing an album keeps Your Queue and makes the rest of the album Next Up", () => {
    let s = addToQueue(emptyQueue, song(9, "Radio"));
    s = play(s, album, 1, "Space Trash");
    expect(playing(s)).toBe(2);
    expect(titles(s.userQueue)).toEqual(["Radio"]);
    expect(ids(s.nextUp)).toEqual([3, 4]);
    expect(s.source).toBe("Space Trash");
    expect(ids(playOrder(s).tracks)).toEqual([2, 9, 3, 4]);
  });

  test("adding while playing goes to the bottom of Your Queue, never into Next Up", () => {
    let s = play(emptyQueue, album, 0, "Space Trash");
    s = addToQueue(s, song(9));
    s = addToQueue(s, song(10));
    expect(ids(s.userQueue)).toEqual([9, 10]);
    expect(ids(s.nextUp)).toEqual([2, 3, 4]);
  });

  test("Next plays Your Queue first, then Next Up, then Discovery", () => {
    let s = play(emptyQueue, album, 2, "Space Trash");
    s = addToQueue(s, song(9));
    s = addDiscovery(s, [song(20)], s.generation);
    const order: (number | undefined)[] = [];
    for (let i = 0; i < 3; i++) {
      s = advance(s);
      order.push(playing(s));
    }
    expect(order).toEqual([9, 4, 20]);
    expect(s.userQueue).toEqual([]);
  });

  test("a new album replaces Next Up while retaining Discovery and Your Queue", () => {
    let s = play(emptyQueue, album, 0, "Space Trash");
    s = addToQueue(s, song(9));
    s = addDiscovery(s, [song(20)], s.generation);
    s = play(s, [song(30), song(31)], 0, "Other EP");
    expect(ids(s.userQueue)).toEqual([9]);
    expect(ids(s.nextUp)).toEqual([31]);
    expect(ids(s.discovery)).toEqual([20]);
  });

  test("tapping a song further down Your Queue removes the songs above it", () => {
    let s = play(emptyQueue, album, 0, "Space Trash");
    s = addToQueue(s, song(9));
    s = addToQueue(s, song(10));
    s = addToQueue(s, song(11));
    s = playFromQueue(s, 2);
    expect(playing(s)).toBe(11);
    expect(s.userQueue).toEqual([]);
    expect(ids(s.nextUp)).toEqual([2, 3, 4]);
  });

  test("tapping a Your Queue song with nothing playing starts it", () => {
    let s = addToQueue(emptyQueue, song(9));
    s = addToQueue(s, song(10));
    s = playFromQueue(s, 0);
    expect(playing(s)).toBe(9);
    expect(ids(s.userQueue)).toEqual([10]);
  });

  test("tapping a Next Up song skips album songs above it and keeps Your Queue next", () => {
    let s = play(emptyQueue, album, 0, "Space Trash");
    s = addToQueue(s, song(9));
    s = playFromUpcoming(s, 1);
    expect(playing(s)).toBe(3);
    expect(ids(s.userQueue)).toEqual([9]);
    expect(ids(s.nextUp)).toEqual([4]);
    s = advance(s);
    expect(playing(s)).toBe(9);
  });

  test("tapping a Discovery song finishes the album and keeps Your Queue next", () => {
    let s = play(emptyQueue, album, 0, "Space Trash");
    s = addToQueue(s, song(9));
    s = addDiscovery(s, [song(20), song(21)], s.generation);
    s = playFromUpcoming(s, 4);
    expect(playing(s)).toBe(21);
    expect(s.nextUp).toEqual([]);
    expect(s.discovery).toEqual([]);
    expect(ids(s.userQueue)).toEqual([9]);
  });

  test("Previous returns the playing song to the top of its own section", () => {
    let s = play(emptyQueue, album, 0, "Space Trash");
    s = addToQueue(s, song(9));
    s = advance(s);
    expect(playing(s)).toBe(9);
    s = back(s);
    expect(playing(s)).toBe(1);
    expect(ids(s.userQueue)).toEqual([9]);
    expect(ids(s.nextUp)).toEqual([2, 3, 4]);
  });

  test("following the player by index matches stepping through the play order", () => {
    let s = play(emptyQueue, album, 0, "Space Trash");
    s = addToQueue(s, song(9));
    const order = playOrder(s).tracks;
    s = moveTo(s, 3);
    expect(playing(s)).toBe(order[3].id);
    expect(ids(playOrder(s).tracks)).toEqual(ids(order));
    s = moveTo(s, 1);
    expect(playing(s)).toBe(order[1].id);
    expect(ids(playOrder(s).tracks)).toEqual(ids(order));
  });

  test("dragging a Next Up song into Your Queue makes it yours", () => {
    let s = play(emptyQueue, album, 0, "Space Trash");
    s = moveItem(s, { section: "upcoming", index: 1 }, { section: "queue", index: 0 });
    expect(ids(s.userQueue)).toEqual([3]);
    expect(ids(s.nextUp)).toEqual([2, 4]);
  });

  test("dragging a Discovery song into Your Queue clears its Discovery mark", () => {
    let s = play(emptyQueue, album, 3, "Space Trash");
    s = addDiscovery(s, [song(20)], s.generation);
    s = moveItem(s, { section: "upcoming", index: 0 }, { section: "queue", index: 0 });
    expect(ids(s.userQueue)).toEqual([20]);
    expect(s.userQueue[0].autoplay).toBeUndefined();
    expect(s.discovery).toEqual([]);
  });

  test("dragging out of Your Queue returns the song to Next Up", () => {
    let s = play(emptyQueue, album, 0, "Space Trash");
    s = addToQueue(s, song(9));
    s = moveItem(s, { section: "queue", index: 0 }, { section: "upcoming", index: 1 });
    expect(s.userQueue).toEqual([]);
    expect(ids(s.nextUp)).toEqual([2, 9, 3, 4]);
  });

  test("upcoming lists Next Up before Discovery, with Discovery marked", () => {
    let s = play(emptyQueue, album, 2, "Space Trash");
    s = addDiscovery(s, [song(20)], s.generation);
    expect(ids(upcoming(s))).toEqual([4, 20]);
    expect(upcoming(s)[1].autoplay).toBe(true);
  });

  test("shuffle mixes Next Up only and turning it off restores the album order", () => {
    let s = play(emptyQueue, album, 0, "Space Trash");
    s = addToQueue(s, song(9));
    s = shuffleNextUp(s, true, (list) => [...list].reverse());
    expect(ids(s.nextUp)).toEqual([4, 3, 2]);
    expect(ids(s.userQueue)).toEqual([9]);
    s = shuffleNextUp(s, false, (list) => list);
    expect(ids(s.nextUp)).toEqual([2, 3, 4]);
  });

  test("remove and clear touch Your Queue only", () => {
    let s = play(emptyQueue, album, 0, "Space Trash");
    s = addToQueue(s, song(9));
    s = addToQueue(s, song(10));
    s = removeFromQueue(s, 0);
    expect(ids(s.userQueue)).toEqual([10]);
    s = clearQueue(s);
    expect(s.userQueue).toEqual([]);
    expect(ids(s.nextUp)).toEqual([2, 3, 4]);
  });

  test("the same song can sit in Your Queue twice", () => {
    let s = addToQueue(emptyQueue, song(9));
    s = addToQueue(s, song(9));
    expect(s.userQueue).toHaveLength(2);
    expect(s.userQueue[0]._queueKey).not.toBe(s.userQueue[1]._queueKey);
  });

  test("Your Queue and the rest survive closing the app", () => {
    let s = play(emptyQueue, album, 1, "Space Trash");
    s = addToQueue(s, song(9));
    const restored = fromSaved(toSaved(s));
    expect(ids(restored.userQueue)).toEqual([9]);
    expect(restored.current?.track.id).toBe(2);
    expect(ids(restored.nextUp)).toEqual([3, 4]);
    expect(restored.source).toBe("Space Trash");
    expect(fromSaved("not json")).toEqual(emptyQueue);
  });

  test("play increments generation and addDiscovery rejects stale generation results", () => {
    let s = play(emptyQueue, album, 0, "Source A");
    const initialGen = s.generation;
    s = addDiscovery(s, [song(50)], initialGen);
    expect(ids(s.discovery)).toEqual([50]);

    // Switching to Source B retains existing discovery but bumps generation
    s = play(s, [song(60), song(61)], 0, "Source B");
    expect(s.generation).toBe(initialGen + 1);
    expect(ids(s.discovery)).toEqual([50]);

    // Late in-flight discovery result from Source A is dropped
    s = addDiscovery(s, [song(51)], initialGen);
    expect(ids(s.discovery)).toEqual([50]);

    // Fresh discovery result matching Source B's generation is accepted
    s = addDiscovery(s, [song(52)], s.generation);
    expect(ids(s.discovery)).toEqual([50, 52]);
  });

  test("addDiscovery drops tracks already in queue or nextUp", () => {
    let s = play(emptyQueue, album, 0, "Space Trash");
    s = addToQueue(s, song(9));
    // Try adding song 9 (in userQueue) and song 2 (in nextUp) to discovery
    s = addDiscovery(s, [song(9), song(2), song(99)], s.generation);
    expect(ids(s.discovery)).toEqual([99]);
  });
});
