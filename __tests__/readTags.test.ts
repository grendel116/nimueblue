import { readTags } from "@/scripts/readTags";
import { writeTags } from "@/scripts/writeTags";

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)),
  );
const readerOf = (data: Uint8Array) => (offset: number, length: number) =>
  data.subarray(offset, offset + length);

const syncSafe = (n: number) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n: number) => be32(n).reverse();

function id3Frame(id: string, payload: number[], version = 4) {
  return [...bytes(id), ...(version === 4 ? syncSafe(payload.length) : be32(payload.length)), 0, 0, ...payload];
}
const text = (s: string) => [3, ...bytes(s)];

function id3File(frames: number[][], version = 4) {
  const body = frames.flat();
  return bytes("ID3", [version, 0, 0], syncSafe(body.length), body, [0, 0, 0, 0]);
}

describe("readTags", () => {
  it("reads ID3v2.4 text frames, TLEN duration, and cover", () => {
    const image = [1, 2, 3, 4];
    const apic = [3, ...bytes("image/png"), 0, 3, ...bytes("front"), 0, ...image];
    const file = id3File([
      id3Frame("TIT2", text("Song")),
      id3Frame("TPE1", text("Band")),
      id3Frame("TALB", text("Record")),
      id3Frame("TRCK", text("3/12")),
      id3Frame("TLEN", text("185000")),
      id3Frame("APIC", apic),
    ]);
    const tags = readTags(readerOf(file));
    expect(tags).toMatchObject({
      title: "Song",
      artist: "Band",
      album: "Record",
      track: 3,
      duration: 185,
    });
    expect(tags.cover?.mime).toBe("image/png");
    expect(Array.from(tags.cover!.bytes)).toEqual(image);
  });

  it("reads MP3 Xing VBR and CBR duration when TLEN is absent", () => {
    // MPEG1 Layer 3, 128kbps (idx 9), 44100Hz (idx 0), stereo (channelMode 0 -> sideInfo 32)
    const mpegHeader = [0xff, 0xfb, 0x90, 0x00];
    const xingFrame = [
      ...mpegHeader,
      ...new Array(32).fill(0),
      ...bytes("Xing"),
      ...be32(1), // frames flag
      ...be32(3828), // ~100 seconds at 44100 Hz (1152 samples/frame)
      ...new Array(40).fill(0),
    ];
    const vbrFile = bytes(
      "ID3",
      [4, 0, 0],
      syncSafe(14),
      id3Frame("TIT2", text("VBR")),
      xingFrame,
    );
    expect(readTags(readerOf(vbrFile)).duration).toBe(100);

    // CBR fallback using fileSize (128 kbps = 16000 bytes/sec -> 160000 bytes = 10s)
    const cbrFrame = [...mpegHeader, ...new Array(60).fill(0)];
    expect(readTags(readerOf(bytes(cbrFrame)), 160000).duration).toBe(10);
  });

  it("reads ID3v2.3 utf-16 text", () => {
    const utf16 = [1, 0xff, 0xfe, ...[..."Hé"].flatMap((c) => [c.charCodeAt(0), 0])];
    const file = id3File([id3Frame("TIT2", utf16, 3)], 3);
    expect(readTags(readerOf(file)).title).toBe("Hé");
  });

  it("reads FLAC STREAMINFO duration, comments and picture", () => {
    const comment = (s: string) => [...le32(s.length), ...bytes(s)];
    const comments = [
      ...le32(3),
      ...bytes("abc"),
      ...le32(3),
      ...comment("TITLE=Song"),
      ...comment("artist=Band"),
      ...comment("TRACKNUMBER=2"),
    ];
    // 44100 Hz (0x0ac44) in 20 bits at byte 10..12, total samples = 44100 * 142 = 6262200
    const sr = 44100;
    const samples = sr * 142;
    const streamInfo = [
      ...new Array(10).fill(0),
      (sr >> 12) & 0xff,
      (sr >> 4) & 0xff,
      ((sr & 0x0f) << 4) | 0,
      0,
      ...be32(samples),
      ...new Array(16).fill(0),
    ];
    const picture = [
      ...be32(3),
      ...be32(9),
      ...bytes("image/png"),
      ...be32(0),
      ...be32(0),
      ...be32(0),
      ...be32(0),
      ...be32(0),
      ...be32(2),
      9,
      8,
    ];
    const block = (type: number, last: boolean, data: number[]) => [
      (last ? 0x80 : 0) | type,
      (data.length >> 16) & 255,
      (data.length >> 8) & 255,
      data.length & 255,
      ...data,
    ];
    const file = bytes(
      "fLaC",
      block(0, false, streamInfo),
      block(4, false, comments),
      block(6, true, picture),
    );
    const tags = readTags(readerOf(file));
    expect(tags).toMatchObject({ title: "Song", artist: "Band", track: 2, duration: 142 });
    expect(Array.from(tags.cover!.bytes)).toEqual([9, 8]);
  });

  it("reads Opus comments spanning pages and granule duration", () => {
    const comment = (s: string) => [...le32(s.length), ...bytes(s)];
    const packet = [
      ...bytes("OpusTags"),
      ...le32(2),
      ...bytes("ab"),
      ...le32(2),
      ...comment("TITLE=Song"),
      ...comment("ALBUM=Record"),
    ];
    const head = bytes("OpusHead", [1, 2, 3]);
    const page = (lacing: number[], data: number[], granule = 0) => [
      ...bytes("OggS"),
      0,
      0,
      ...le32(granule),
      ...le32(0),
      ...new Array(12).fill(0),
      lacing.length,
      ...lacing,
      ...data,
    ];
    // the comment packet is split over two pages (first page ends on a 255 byte segment)
    const padded = [...packet, ...new Array(300).fill(0)];
    const file = bytes(
      page([head.length], Array.from(head)),
      page([255], padded.slice(0, 255)),
      page([padded.length - 255], padded.slice(255), 48000 * 95),
    );
    expect(readTags(readerOf(file), file.length)).toMatchObject({
      title: "Song",
      album: "Record",
      duration: 95,
    });
  });

  it("reads M4A items and mvhd duration", () => {
    const atom = (type: string, body: ArrayLike<number>) => [
      ...be32(body.length + 8),
      ...bytes(type),
      ...Array.from(body),
    ];
    const item = (type: string, flags: number, payload: ArrayLike<number>) =>
      atom(type, atom("data", [...be32(flags), 0, 0, 0, 0, ...Array.from(payload)]));
    const mvhd = atom("mvhd", [
      0,
      0,
      0,
      0, // version 0 + flags
      ...be32(0),
      ...be32(0),
      ...be32(1000), // timescale
      ...be32(215000), // duration = 215s
    ]);
    const ilst = atom("ilst", [
      ...item("\u00a9nam", 1, bytes("Song")),
      ...item("\u00a9alb", 1, bytes("Record")),
      ...item("trkn", 0, [0, 0, 0, 5, 0, 9, 0, 0]),
      ...item("covr", 14, [7, 7]),
    ]);
    const moov = atom("moov", [...mvhd, ...atom("udta", atom("meta", [0, 0, 0, 0, ...ilst]))]);
    const file = bytes(atom("ftyp", bytes("M4A ", [0, 0, 0, 0])), moov);
    const tags = readTags(readerOf(file));
    expect(tags).toMatchObject({ title: "Song", album: "Record", track: 5, duration: 215 });
    expect(tags.cover?.mime).toBe("image/png");
  });

  it("reads WAV duration from fmt and data chunks", () => {
    const fmt = [
      ...bytes("fmt "),
      ...le32(16),
      1,
      0, // PCM
      2,
      0, // 2 channels
      ...le32(44100), // sample rate
      ...le32(176400), // byte rate
      4,
      0,
      16,
      0,
    ];
    const data = [...bytes("data"), ...le32(176400 * 60)];
    const wav = bytes("RIFF", le32(36 + 176400 * 60), "WAVE", fmt, data);
    expect(readTags(readerOf(wav))).toEqual({ duration: 60 });
  });

  it("returns nothing for unpopulated headers", () => {
    expect(readTags(readerOf(bytes("RIFF....WAVE")))).toEqual({});
  });

  it("writes and updates ID3v2.4 tags on MP3 while preserving cover art and audio", () => {
    const image = [1, 2, 3, 4];
    const apic = [3, ...bytes("image/png"), 0, 3, ...bytes("front"), 0, ...image];
    const original = id3File([
      id3Frame("TIT2", text("Old Title")),
      id3Frame("TPE1", text("Old Artist")),
      id3Frame("TALB", text("Old Album")),
      id3Frame("TRCK", text("1/10")),
      id3Frame("TLEN", text("120000")),
      id3Frame("APIC", apic),
    ]);
    const updated = writeTags(
      original,
      {
        title: "New Title",
        artist: "New Artist",
        album: "New Album",
        track: 7,
      },
      "07 New Title.mp3",
    );
    const parsed = readTags(readerOf(updated), updated.length);
    expect(parsed).toMatchObject({
      title: "New Title",
      artist: "New Artist",
      album: "New Album",
      track: 7,
      duration: 120,
    });
    expect(Array.from(parsed.cover!.bytes)).toEqual(image);
  });

  it("writes and updates Vorbis comments on FLAC while preserving STREAMINFO and PICTURE", () => {
    const comment = (s: string) => [...le32(s.length), ...bytes(s)];
    const comments = [
      ...le32(3),
      ...bytes("abc"),
      ...le32(3),
      ...comment("TITLE=Old Song"),
      ...comment("ARTIST=Old Band"),
      ...comment("GENRE=Electronic"),
    ];
    const sr = 44100;
    const samples = sr * 142;
    const streamInfo = [
      ...new Array(10).fill(0),
      (sr >> 12) & 0xff,
      (sr >> 4) & 0xff,
      ((sr & 0x0f) << 4) | 0,
      0,
      ...be32(samples),
      ...new Array(16).fill(0),
    ];
    const picture = [
      ...be32(3),
      ...be32(9),
      ...bytes("image/png"),
      ...be32(0),
      ...be32(0),
      ...be32(0),
      ...be32(0),
      ...be32(0),
      ...be32(2),
      9,
      8,
    ];
    const block = (type: number, last: boolean, data: number[]) => [
      (last ? 0x80 : 0) | type,
      (data.length >> 16) & 255,
      (data.length >> 8) & 255,
      data.length & 255,
      ...data,
    ];
    const original = bytes(
      "fLaC",
      block(0, false, streamInfo),
      block(4, false, comments),
      block(6, true, picture),
    );
    const updated = writeTags(
      original,
      {
        title: "Renamed Song",
        artist: "Renamed Band",
        album: "Renamed Album",
        track: 4,
      },
      "04 Renamed Song.flac",
    );
    const parsed = readTags(readerOf(updated), updated.length);
    expect(parsed).toMatchObject({
      title: "Renamed Song",
      artist: "Renamed Band",
      album: "Renamed Album",
      track: 4,
      duration: 142,
    });
    expect(Array.from(parsed.cover!.bytes)).toEqual([9, 8]);
  });
});
