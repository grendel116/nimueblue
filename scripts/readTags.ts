// Reads song details (title, artist, album, track number, duration, cover) from the tags and
// headers inside MP3, FLAC, Ogg (Vorbis and Opus), MP4/M4A, and WAV files. Other formats return no tags.

export type Tags = {
  title?: string;
  artist?: string;
  album?: string;
  track?: number;
  duration?: number;
  cover?: { bytes: Uint8Array; mime: string };
};

// Returns up to `length` bytes starting at `offset` (fewer at the end of the file)
export type ByteReader = (offset: number, length: number) => Uint8Array;

const MAX_TAG_BYTES = 12 * 1024 * 1024;

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

function utf8(b: Uint8Array): string {
  return new TextDecoder("utf-8").decode(b);
}

function utf16(b: Uint8Array, bigEndian: boolean): string {
  let out = "";
  for (let i = 0; i + 1 < b.length; i += 2) {
    out += String.fromCharCode(bigEndian ? (b[i] << 8) | b[i + 1] : b[i] | (b[i + 1] << 8));
  }
  return out;
}

// ID3 text encodings: 0 latin1, 1 utf-16 with byte order mark, 2 utf-16 big endian, 3 utf-8
function decodeText(encoding: number, b: Uint8Array): string {
  let text: string;
  if (encoding === 1 && b.length >= 2) {
    const bigEndian = b[0] === 0xfe && b[1] === 0xff;
    text = utf16(b.subarray(2), bigEndian);
  } else if (encoding === 1 || encoding === 2) {
    text = utf16(b, encoding === 2);
  } else if (encoding === 3) {
    text = utf8(b);
  } else {
    text = latin1(b);
  }
  return text.split("\0")[0].trim();
}

// Position of the zero terminator that ends a string in the given encoding
function terminatorAt(b: Uint8Array, from: number, encoding: number): number {
  const wide = encoding === 1 || encoding === 2;
  for (let i = from; i < b.length; i += wide ? 2 : 1) {
    if (b[i] === 0 && (!wide || b[i + 1] === 0)) return i;
  }
  return b.length;
}

const syncSafe = (b: Uint8Array, at: number) =>
  ((b[at] & 0x7f) << 21) | ((b[at + 1] & 0x7f) << 14) | ((b[at + 2] & 0x7f) << 7) | (b[at + 3] & 0x7f);

const bigEndian32 = (b: Uint8Array, at: number) =>
  ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

const littleEndian32 = (b: Uint8Array, at: number) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

const littleEndian16 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8)) >>> 0;

const trackNumber = (text: string) => {
  const n = parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const MPEG_VERSIONS = [2.5, 0, 2, 1];
const MPEG_SAMPLE_RATES: Record<number, number[]> = {
  1: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  2.5: [11025, 12000, 8000],
};
const MPEG1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_L3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

// Reads duration from the first MPEG Layer III frame after `audioOffset`: Xing/Info VBR header,
// VBRI header, or CBR frame bitrate with the total file size
function readMp3Duration(read: ByteReader, audioOffset: number, fileSize?: number): number | undefined {
  const probe = read(audioOffset, 4096);
  for (let i = 0; i + 40 <= probe.length; i++) {
    if (probe[i] !== 0xff || (probe[i + 1] & 0xe0) !== 0xe0) continue;
    const versionBits = (probe[i + 1] >> 3) & 3;
    const layerBits = (probe[i + 1] >> 1) & 3;
    const bitrateIdx = (probe[i + 2] >> 4) & 0x0f;
    const sampleIdx = (probe[i + 2] >> 2) & 3;
    const channelMode = (probe[i + 3] >> 6) & 3;
    const version = MPEG_VERSIONS[versionBits];
    if (!version || layerBits !== 1 || bitrateIdx === 0 || bitrateIdx === 15 || sampleIdx === 3) continue;

    const sampleRate = MPEG_SAMPLE_RATES[version]?.[sampleIdx];
    if (!sampleRate) continue;
    const samplesPerFrame = version === 1 ? 1152 : 576;
    const sideInfo = version === 1 ? (channelMode === 3 ? 17 : 32) : channelMode === 3 ? 9 : 17;
    const xingAt = i + 4 + sideInfo;
    if (xingAt + 12 <= probe.length) {
      const xingId = latin1(probe.subarray(xingAt, xingAt + 4));
      if ((xingId === "Xing" || xingId === "Info") && (probe[xingAt + 7] & 1) !== 0) {
        const frames = bigEndian32(probe, xingAt + 8);
        if (frames > 0) return Math.round((frames * samplesPerFrame) / sampleRate);
      }
    }
    const vbriAt = i + 36;
    if (vbriAt + 18 <= probe.length && latin1(probe.subarray(vbriAt, vbriAt + 4)) === "VBRI") {
      const frames = bigEndian32(probe, vbriAt + 14);
      if (frames > 0) return Math.round((frames * samplesPerFrame) / sampleRate);
    }
    const kbps = (version === 1 ? MPEG1_L3_BITRATES : MPEG2_L3_BITRATES)[bitrateIdx];
    if (kbps && fileSize && fileSize > audioOffset + i) {
      return Math.round(((fileSize - audioOffset - i) * 8) / (kbps * 1000));
    }
    break;
  }
  return undefined;
}

function readId3(read: ByteReader, fileSize?: number): Tags {
  const header = read(0, 10);
  const tags: Tags = {};
  const version = header[3];
  const hasId3 =
    header.length >= 10 && latin1(header.subarray(0, 3)) === "ID3" && (version === 3 || version === 4);
  const tagSize = hasId3 ? syncSafe(header, 6) : 0;

  if (hasId3) {
    const body = read(10, Math.min(tagSize, MAX_TAG_BYTES));
    let pos = 0;
    if (header[5] & 0x40) {
      pos = version === 4 ? syncSafe(body, 0) : bigEndian32(body, 0) + 4;
    }

    let tpe1: string | undefined;
    let tpe2: string | undefined;
    while (pos + 10 <= body.length && body[pos] !== 0) {
      const id = latin1(body.subarray(pos, pos + 4));
      const size = version === 4 ? syncSafe(body, pos + 4) : bigEndian32(body, pos + 4);
      const frame = body.subarray(pos + 10, pos + 10 + size);
      pos += 10 + size;
      if (frame.length === 0) continue;

      const encoding = frame[0];
      if (id === "TIT2") tags.title = decodeText(encoding, frame.subarray(1));
      else if (id === "TPE1") tpe1 = decodeText(encoding, frame.subarray(1));
      else if (id === "TPE2") tpe2 = decodeText(encoding, frame.subarray(1));
      else if (id === "TALB") tags.album = decodeText(encoding, frame.subarray(1));
      else if (id === "TRCK") tags.track = trackNumber(decodeText(encoding, frame.subarray(1)));
      else if (id === "TLEN") {
        const ms = parseInt(decodeText(encoding, frame.subarray(1)), 10);
        if (Number.isFinite(ms) && ms > 0) tags.duration = Math.round(ms / 1000);
      } else if (id === "APIC" && !tags.cover) {
        // encoding, mime type, picture type, description, then the image
        const mimeEnd = terminatorAt(frame, 1, 0);
        const descEnd = terminatorAt(frame, mimeEnd + 2, encoding);
        const wide = encoding === 1 || encoding === 2;
        const bytes = frame.subarray(descEnd + (wide ? 2 : 1));
        if (bytes.length > 0) tags.cover = { bytes, mime: latin1(frame.subarray(1, mimeEnd)) };
      }
    }
    const cleanArtist = (tpe2 || tpe1)?.trim();
    if (cleanArtist) tags.artist = cleanArtist;
  }

  tags.duration ??= readMp3Duration(read, hasId3 ? 10 + tagSize : 0, fileSize);
  return tags;
}

// "NAME=value" comments in the Vorbis format, starting at the vendor string
function applyVorbisComments(block: Uint8Array, start: number, tags: Tags): void {
  let pos = start + 4 + littleEndian32(block, start);
  const count = littleEndian32(block, pos);
  pos += 4;
  let trackArtist: string | undefined;
  let albumArtist: string | undefined;
  for (let i = 0; i < count && pos + 4 <= block.length; i++) {
    const size = littleEndian32(block, pos);
    const comment = utf8(block.subarray(pos + 4, pos + 4 + size));
    pos += 4 + size;
    const split = comment.indexOf("=");
    const name = comment.slice(0, split).toUpperCase();
    const value = comment.slice(split + 1).trim();
    if (name === "TITLE") tags.title = value;
    else if (name === "ARTIST") trackArtist = value;
    else if (name === "ALBUMARTIST") albumArtist = value;
    else if (name === "ALBUM") tags.album = value;
    else if (name === "TRACKNUMBER") tags.track = trackNumber(value);
    else if (name === "METADATA_BLOCK_PICTURE" && !tags.cover) tags.cover = flacPicture(base64Bytes(value));
  }
  const cleanArtist = (albumArtist || trackArtist)?.trim();
  if (cleanArtist) tags.artist = cleanArtist;
}

function base64Bytes(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

// A FLAC picture block: type, mime, description, width, height, depth, colors, then the image
function flacPicture(block: Uint8Array): Tags["cover"] {
  const mimeSize = bigEndian32(block, 4);
  const mime = latin1(block.subarray(8, 8 + mimeSize));
  let pos = 8 + mimeSize;
  pos += 4 + bigEndian32(block, pos) + 16;
  const bytes = block.subarray(pos + 4, pos + 4 + bigEndian32(block, pos));
  return bytes.length > 0 ? { bytes, mime } : undefined;
}

function readFlac(read: ByteReader): Tags {
  const tags: Tags = {};
  let offset = 4;
  let last = false;
  while (!last) {
    const header = read(offset, 4);
    if (header.length < 4) break;
    last = (header[0] & 0x80) !== 0;
    const type = header[0] & 0x7f;
    const length = (header[1] << 16) | (header[2] << 8) | header[3];
    const start = offset + 4;
    offset = start + length;
    if (type === 0 && length >= 18) {
      // STREAMINFO: 20-bit sample rate and 36-bit total sample count starting at byte 10
      const info = read(start, 18);
      if (info.length >= 18) {
        const sampleRate = (info[10] << 12) | (info[11] << 4) | (info[12] >> 4);
        const totalSamples = (info[13] & 0x0f) * 0x100000000 + bigEndian32(info, 14);
        if (sampleRate > 0 && totalSamples > 0) tags.duration = Math.round(totalSamples / sampleRate);
      }
      continue;
    }
    if ((type !== 4 && type !== 6) || length > MAX_TAG_BYTES) continue;

    const block = read(start, length);
    if (type === 4) applyVorbisComments(block, 0, tags);
    else if (!tags.cover) tags.cover = flacPicture(block);
  }
  return tags;
}

// Ogg files (Vorbis or Opus): the first packet holds the sample rate, the second packet holds the
// comments, and the last page's granule position gives total samples
function readOgg(read: ByteReader, fileSize?: number): Tags {
  const tags: Tags = {};
  const packets: number[][] = [[]];
  let offset = 0;
  let maxGranule = 0;
  while (packets.length < 3 && offset < MAX_TAG_BYTES) {
    const page = read(offset, 27);
    if (page.length < 27 || latin1(page.subarray(0, 4)) !== "OggS") break;
    const gLow = littleEndian32(page, 6);
    const gHigh = littleEndian32(page, 10);
    if (gHigh !== 0xffffffff || gLow !== 0xffffffff) {
      maxGranule = Math.max(maxGranule, gHigh * 0x100000000 + gLow);
    }
    const lacing = read(offset + 27, page[26]);
    let at = offset + 27 + lacing.length;
    for (const size of lacing) {
      packets[packets.length - 1].push(...read(at, size));
      at += size;
      if (size < 255) packets.push([]);
    }
    offset = at;
  }

  const head = Uint8Array.from(packets[0] ?? []);
  const comments = Uint8Array.from(packets[1] ?? []);
  let sampleRate = 0;
  if (latin1(comments.subarray(0, 8)) === "OpusTags") {
    applyVorbisComments(comments, 8, tags);
    sampleRate = 48000;
  } else if (comments[0] === 3 && latin1(comments.subarray(1, 7)) === "vorbis") {
    applyVorbisComments(comments, 7, tags);
    if (head.length >= 16) sampleRate = littleEndian32(head, 12);
  }

  if (sampleRate > 0) {
    const tailOffset = fileSize && fileSize > 65536 ? fileSize - 65536 : offset;
    const tail = read(tailOffset, 65536);
    for (let i = tail.length - 27; i >= 0; i--) {
      if (tail[i] === 0x4f && tail[i + 1] === 0x67 && tail[i + 2] === 0x67 && tail[i + 3] === 0x53) {
        const gLow = littleEndian32(tail, i + 6);
        const gHigh = littleEndian32(tail, i + 10);
        if (gHigh !== 0xffffffff || gLow !== 0xffffffff) {
          maxGranule = Math.max(maxGranule, gHigh * 0x100000000 + gLow);
          break;
        }
      }
    }
    if (maxGranule > 0) tags.duration = Math.round(maxGranule / sampleRate);
  }
  return tags;
}

// MP4/M4A files: duration sits in moov > mvhd, and tags sit in moov > udta > meta > ilst
function atomsIn(b: Uint8Array, start: number, end: number) {
  const atoms: { type: string; body: Uint8Array }[] = [];
  for (let pos = start; pos + 8 <= end; ) {
    const size = bigEndian32(b, pos);
    if (size < 8) break;
    atoms.push({ type: latin1(b.subarray(pos + 4, pos + 8)), body: b.subarray(pos + 8, pos + size) });
    pos += size;
  }
  return atoms;
}

function readMp4(read: ByteReader): Tags {
  const tags: Tags = {};
  let moov: Uint8Array | undefined;
  for (let offset = 0; !moov; ) {
    const header = read(offset, 8);
    if (header.length < 8) break;
    const size = bigEndian32(header, 0);
    if (size < 8) break;
    if (latin1(header.subarray(4, 8)) === "moov" && size <= MAX_TAG_BYTES) moov = read(offset + 8, size - 8);
    offset += size;
  }
  if (!moov) return tags;

  const child = (body: Uint8Array, type: string, skip = 0) => {
    const atom = atomsIn(body, skip, body.length).find((a) => a.type === type);
    return atom?.body;
  };

  const mvhd = child(moov, "mvhd");
  if (mvhd && mvhd.length >= 20) {
    const v = mvhd[0];
    const timescale = v === 1 && mvhd.length >= 28 ? bigEndian32(mvhd, 20) : bigEndian32(mvhd, 12);
    const total =
      v === 1 && mvhd.length >= 32
        ? bigEndian32(mvhd, 24) * 0x100000000 + bigEndian32(mvhd, 28)
        : bigEndian32(mvhd, 16);
    if (timescale > 0 && total > 0) tags.duration = Math.round(total / timescale);
  }

  const udta = child(moov, "udta");
  const meta = udta && child(udta, "meta");
  const ilst = meta && child(meta, "ilst", 4);
  if (!ilst) return tags;

  for (const item of atomsIn(ilst, 0, ilst.length)) {
    const data = child(item.body, "data");
    if (!data || data.length < 8) continue;
    const flags = bigEndian32(data, 0) & 0xffffff;
    const payload = data.subarray(8);
    if (item.type === "\u00a9nam") tags.title = utf8(payload);
    else if (item.type === "\u00a9ART") tags.artist = utf8(payload);
    else if (item.type === "\u00a9alb") tags.album = utf8(payload);
    else if (item.type === "trkn") tags.track = trackNumber(String((payload[2] << 8) | payload[3]));
    else if (item.type === "covr" && payload.length > 0) {
      tags.cover = { bytes: payload, mime: flags === 14 ? "image/png" : "image/jpeg" };
    }
  }
  return tags;
}

function readWav(read: ByteReader, fileSize?: number): Tags {
  const header = read(0, 128);
  if (header.length < 36 || latin1(header.subarray(8, 12)) !== "WAVE") return {};
  let pos = 12;
  let byteRate = 0;
  let dataBytes = 0;
  while (pos + 8 <= header.length) {
    const id = latin1(header.subarray(pos, pos + 4));
    const size = littleEndian32(header, pos + 4);
    if (id === "fmt " && pos + 20 <= header.length) {
      const sampleRate = littleEndian32(header, pos + 12);
      const declaredRate = littleEndian32(header, pos + 16);
      const channels = littleEndian16(header, pos + 10);
      const bits = littleEndian16(header, pos + 22);
      byteRate = declaredRate || (sampleRate * channels * bits) / 8;
    } else if (id === "data") {
      dataBytes = size;
      break;
    }
    pos += 8 + size + (size & 1);
  }
  const totalBytes = dataBytes || (fileSize && fileSize > 44 ? fileSize - 44 : 0);
  if (byteRate > 0 && totalBytes > 0) {
    return { duration: Math.round(totalBytes / byteRate) };
  }
  return {};
}

// Tags for a file's bytes; a file we can't read, or one without tags, gives an empty result
export function readTags(read: ByteReader, fileSize?: number): Tags {
  try {
    const first = read(0, 12);
    const magic = latin1(first.subarray(0, 4));
    if (magic === "fLaC") return readFlac(read);
    if (magic === "OggS") return readOgg(read, fileSize);
    if (latin1(first.subarray(4, 8)) === "ftyp") return readMp4(read);
    if (magic === "RIFF" && latin1(first.subarray(8, 12)) === "WAVE") return readWav(read, fileSize);
    if (magic.startsWith("ID3") || (first.length >= 2 && first[0] === 0xff && (first[1] & 0xe0) === 0xe0)) {
      return readId3(read, fileSize);
    }
  } catch {}
  return {};
}
