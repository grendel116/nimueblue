// Updates embedded song metadata (title, artist, album, track number) inside MP3 (ID3v2) and
// FLAC (Vorbis comment) files while preserving cover art, audio frames, and other metadata.

export type TagUpdates = {
  title?: string;
  artist?: string;
  album?: string;
  track?: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

const syncSafe = (b: Uint8Array, at: number) =>
  ((b[at] & 0x7f) << 21) |
  ((b[at + 1] & 0x7f) << 14) |
  ((b[at + 2] & 0x7f) << 7) |
  (b[at + 3] & 0x7f);

function writeSyncSafe(value: number, out: Uint8Array, at: number): void {
  out[at] = (value >> 21) & 0x7f;
  out[at + 1] = (value >> 14) & 0x7f;
  out[at + 2] = (value >> 7) & 0x7f;
  out[at + 3] = value & 0x7f;
}

const bigEndian32 = (b: Uint8Array, at: number) =>
  ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

const littleEndian32 = (b: Uint8Array, at: number) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

function writeLittleEndian32(value: number, out: Uint8Array, at: number): void {
  out[at] = value & 0xff;
  out[at + 1] = (value >> 8) & 0xff;
  out[at + 2] = (value >> 16) & 0xff;
  out[at + 3] = (value >> 24) & 0xff;
}

type Id3Frame = {
  id: string;
  flags0: number;
  flags1: number;
  payload: Uint8Array;
};

function makeUtf8Frame(id: string, text: string): Id3Frame {
  const encoded = encoder.encode(text);
  const payload = new Uint8Array(1 + encoded.length);
  payload[0] = 3; // UTF-8
  payload.set(encoded, 1);
  return { id, flags0: 0, flags1: 0, payload };
}

function writeId3(bytes: Uint8Array, updates: TagUpdates): Uint8Array {
  const hasId3 =
    bytes.length >= 10 &&
    latin1(bytes.subarray(0, 3)) === "ID3" &&
    (bytes[3] === 2 || bytes[3] === 3 || bytes[3] === 4);
  const version = hasId3 ? bytes[3] : 4;
  const oldTagSize = hasId3 ? syncSafe(bytes, 6) : 0;
  const audioOffset = hasId3 ? Math.min(bytes.length, 10 + oldTagSize) : 0;

  const replacedIds = new Set<string>();
  if (updates.title !== undefined) replacedIds.add("TIT2");
  if (updates.artist !== undefined) {
    replacedIds.add("TPE1");
    replacedIds.add("TPE2");
  }
  if (updates.album !== undefined) replacedIds.add("TALB");
  if (updates.track !== undefined) replacedIds.add("TRCK");

  const keptFrames: Id3Frame[] = [];
  if (hasId3 && (version === 3 || version === 4)) {
    const body = bytes.subarray(10, audioOffset);
    let pos = 0;
    if (bytes[5] & 0x40) {
      pos = version === 4 ? syncSafe(body, 0) : bigEndian32(body, 0) + 4;
    }
    while (pos + 10 <= body.length && body[pos] !== 0) {
      const id = latin1(body.subarray(pos, pos + 4));
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const size = version === 4 ? syncSafe(body, pos + 4) : bigEndian32(body, pos + 4);
      if (size < 0 || pos + 10 + size > body.length) break;
      const flags0 = body[pos + 8];
      const flags1 = body[pos + 9];
      const payload = body.subarray(pos + 10, pos + 10 + size);
      pos += 10 + size;
      if (!replacedIds.has(id) && payload.length > 0) {
        keptFrames.push({ id, flags0, flags1, payload });
      }
    }
  }

  const newFrames: Id3Frame[] = [];
  if (updates.title !== undefined) newFrames.push(makeUtf8Frame("TIT2", updates.title));
  if (updates.artist !== undefined) {
    newFrames.push(makeUtf8Frame("TPE1", updates.artist));
    newFrames.push(makeUtf8Frame("TPE2", updates.artist));
  }
  if (updates.album !== undefined) newFrames.push(makeUtf8Frame("TALB", updates.album));
  if (updates.track !== undefined) newFrames.push(makeUtf8Frame("TRCK", String(updates.track)));

  const allFrames = [...newFrames, ...keptFrames];
  const framesByteLength = allFrames.reduce((sum, f) => sum + 10 + f.payload.length, 0);
  const finalTagSize = Math.max(framesByteLength, oldTagSize);
  const audioBytes = bytes.subarray(audioOffset);
  const out = new Uint8Array(10 + finalTagSize + audioBytes.length);

  // ID3v2.4 header
  out[0] = 0x49; // 'I'
  out[1] = 0x44; // 'D'
  out[2] = 0x33; // '3'
  out[3] = 4;
  out[4] = 0;
  out[5] = 0;
  writeSyncSafe(finalTagSize, out, 6);

  let offset = 10;
  for (const frame of allFrames) {
    for (let i = 0; i < 4; i++) out[offset + i] = frame.id.charCodeAt(i);
    writeSyncSafe(frame.payload.length, out, offset + 4);
    out[offset + 8] = frame.flags0;
    out[offset + 9] = frame.flags1;
    out.set(frame.payload, offset + 10);
    offset += 10 + frame.payload.length;
  }

  out.set(audioBytes, 10 + finalTagSize);
  return out;
}

function buildVorbisCommentBlock(
  existingBlock: Uint8Array | undefined,
  updates: TagUpdates,
): Uint8Array<ArrayBuffer> {
  let vendor: Uint8Array = encoder.encode("NimueBlue");
  const keptComments: string[] = [];

  const replacedKeys = new Set<string>();
  if (updates.title !== undefined) replacedKeys.add("TITLE");
  if (updates.artist !== undefined) {
    replacedKeys.add("ARTIST");
    replacedKeys.add("ALBUMARTIST");
  }
  if (updates.album !== undefined) replacedKeys.add("ALBUM");
  if (updates.track !== undefined) replacedKeys.add("TRACKNUMBER");

  if (existingBlock && existingBlock.length >= 8) {
    const vendorLen = littleEndian32(existingBlock, 0);
    if (4 + vendorLen + 4 <= existingBlock.length) {
      vendor = existingBlock.subarray(4, 4 + vendorLen);
      let pos = 4 + vendorLen;
      const count = littleEndian32(existingBlock, pos);
      pos += 4;
      for (let i = 0; i < count && pos + 4 <= existingBlock.length; i++) {
        const len = littleEndian32(existingBlock, pos);
        if (pos + 4 + len > existingBlock.length) break;
        const comment = decoder.decode(existingBlock.subarray(pos + 4, pos + 4 + len));
        pos += 4 + len;
        const eq = comment.indexOf("=");
        const key = eq >= 0 ? comment.slice(0, eq).toUpperCase() : "";
        if (!replacedKeys.has(key)) {
          keptComments.push(comment);
        }
      }
    }
  }

  const newComments: string[] = [...keptComments];
  if (updates.title !== undefined) newComments.push(`TITLE=${updates.title}`);
  if (updates.artist !== undefined) {
    newComments.push(`ARTIST=${updates.artist}`);
    newComments.push(`ALBUMARTIST=${updates.artist}`);
  }
  if (updates.album !== undefined) newComments.push(`ALBUM=${updates.album}`);
  if (updates.track !== undefined) newComments.push(`TRACKNUMBER=${updates.track}`);

  const encodedComments = newComments.map((c) => encoder.encode(c));
  const totalSize =
    4 +
    vendor.length +
    4 +
    encodedComments.reduce((sum, c) => sum + 4 + c.length, 0);

  const out = new Uint8Array(totalSize);
  writeLittleEndian32(vendor.length, out, 0);
  out.set(vendor, 4);
  let offset = 4 + vendor.length;
  writeLittleEndian32(encodedComments.length, out, offset);
  offset += 4;
  for (const c of encodedComments) {
    writeLittleEndian32(c.length, out, offset);
    out.set(c, offset + 4);
    offset += 4 + c.length;
  }
  return out;
}

function writeFlac(bytes: Uint8Array, updates: TagUpdates): Uint8Array {
  const blocks: { type: number; body: Uint8Array }[] = [];
  let offset = 4;
  let last = false;
  while (!last) {
    if (offset + 4 > bytes.length) return bytes;
    const header0 = bytes[offset];
    last = (header0 & 0x80) !== 0;
    const type = header0 & 0x7f;
    const length =
      (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (offset + 4 + length > bytes.length) return bytes;
    blocks.push({
      type,
      body: bytes.subarray(offset + 4, offset + 4 + length),
    });
    offset += 4 + length;
  }

  const audioBytes = bytes.subarray(offset);
  const existingIdx = blocks.findIndex((b) => b.type === 4);
  const commentBody = buildVorbisCommentBlock(
    existingIdx >= 0 ? blocks[existingIdx].body : undefined,
    updates,
  );

  // FLAC metadata block length is 24-bit max
  if (commentBody.length > 0xffffff) return bytes;

  if (existingIdx >= 0) {
    blocks[existingIdx] = { type: 4, body: commentBody };
  } else {
    const insertAt = blocks.length > 0 ? 1 : 0;
    blocks.splice(insertAt, 0, { type: 4, body: commentBody });
  }

  const metadataSize = blocks.reduce((sum, b) => sum + 4 + b.body.length, 0);
  const out = new Uint8Array(4 + metadataSize + audioBytes.length);
  out.set(bytes.subarray(0, 4), 0); // "fLaC"

  let pos = 4;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const isLast = i === blocks.length - 1;
    out[pos] = (isLast ? 0x80 : 0) | (b.type & 0x7f);
    out[pos + 1] = (b.body.length >> 16) & 0xff;
    out[pos + 2] = (b.body.length >> 8) & 0xff;
    out[pos + 3] = b.body.length & 0xff;
    out.set(b.body, pos + 4);
    pos += 4 + b.body.length;
  }

  out.set(audioBytes, pos);
  return out;
}

export function writeTags(
  bytes: Uint8Array,
  updates: TagUpdates,
  fileName?: string,
): Uint8Array {
  if (
    updates.title === undefined &&
    updates.artist === undefined &&
    updates.album === undefined &&
    updates.track === undefined
  ) {
    return bytes;
  }
  if (bytes.length < 4) return bytes;

  const magic4 = latin1(bytes.subarray(0, 4));
  if (magic4 === "fLaC") {
    return writeFlac(bytes, updates);
  }
  if (
    magic4.startsWith("ID3") ||
    (fileName && /\.mp3$/i.test(fileName) && magic4 !== "OggS" && magic4 !== "RIFF" && latin1(bytes.subarray(4, 8)) !== "ftyp")
  ) {
    return writeId3(bytes, updates);
  }
  return bytes;
}
