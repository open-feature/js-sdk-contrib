import { encode as cborgEncode } from 'cborg';

// deterministic CBOR (cborg, RFC 8949 core-det: shortest-float + sorted keys) + murmur3 over the bytes; matches the Go/Python/Java reference impls per the Harden Hashing Consistency ADR (byte-parity vectors in cbor.spec.ts). cborg is edge/browser-safe; we do our own number normalization first, like the reference impls.

const MAX_UINT64 = BigInt('18446744073709551615'); // 2^64 - 1
const MIN_INT64 = BigInt('-9223372036854775808'); // -2^63

// ADR number normalization: whole numbers in [-2^63, 2^64-1] -> CBOR integer (major type 0/1), else float (major type 7); -0.0/0.0 -> 0; BigInt for exact encoding (JS loses precision above 2^53, which isn't reachable from JSON anyway).
export function normalizeForCbor(value: unknown): unknown {
  if (typeof value === 'number') {
    // NaN / +/-Infinity are undefined behavior per the ADR; leave to the encoder.
    if (!Number.isFinite(value)) {
      return value;
    }
    // -0 and 0 both normalize to unsigned integer 0.
    if (value === 0) {
      return BigInt(0);
    }
    if (Number.isInteger(value)) {
      const asBig = BigInt(value);
      if (asBig >= MIN_INT64 && asBig <= MAX_UINT64) {
        return asBig;
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeForCbor);
  }
  if (value !== null && typeof value === 'object') {
    // null-prototype object so own keys like `__proto__` become data, not an inherited setter (which would drop the key and diverge from other languages).
    const out: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = normalizeForCbor((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  // string | boolean | null | bigint pass through unchanged.
  return value;
}

// Encode a bucketing value to deterministic CBOR bytes.
export function encodeDeterministicCbor(value: unknown): Uint8Array {
  return cborgEncode(normalizeForCbor(value));
}

// murmur3_x86_32 with seed 0 over bytes[start, end), as Go's murmur3.Sum32(bytes) and Python's mmh3.hash(bytes) read raw bytes. It reads the bytes in place, so no string of them is built.
function murmur3Bytes(bytes: Uint8Array, start: number, end: number): number {
  let h = 0;
  const tail = end - ((end - start) & 3);
  for (let i = start; i < tail; i += 4) {
    let k = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    h ^= Math.imul(k, 0x1b873593);
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  const remaining = end - tail;
  if (remaining > 0) {
    let k = bytes[tail];
    if (remaining > 1) {
      k ^= bytes[tail + 1] << 8;
    }
    if (remaining > 2) {
      k ^= bytes[tail + 2] << 16;
    }
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    h ^= Math.imul(k, 0x1b873593);
  }
  h ^= end - start;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const textEncoder = new TextEncoder();
// Room for a text-string head with a 4-byte length (one byte and 4 length bytes), which covers UTF-8 up to 4 GiB, far beyond any bucketing value.
const TEXT_HEAD_ROOM = 5;
// Strings up to this many UTF-16 code units (at most 3 UTF-8 bytes each) are encoded into one reused buffer, so hashing them allocates nothing; a longer string gets a buffer of its own.
const TEXT_SCRATCH_CHARS = 1024;
const textScratch = new Uint8Array(TEXT_HEAD_ROOM + 3 * TEXT_SCRATCH_CHARS);
const textScratchBody = textScratch.subarray(TEXT_HEAD_ROOM);

// A string's deterministic CBOR is a text-string head (major type 3, shortest length form) followed by its UTF-8. encodeInto writes lone surrogates as U+FFFD, as cborg does. The UTF-8 goes after room for the head, and the head is written just before it once the length is known.
function hashText(value: string): number {
  const fits = value.length <= TEXT_SCRATCH_CHARS;
  const bytes = fits ? textScratch : new Uint8Array(TEXT_HEAD_ROOM + 3 * value.length);
  const body = fits ? textScratchBody : bytes.subarray(TEXT_HEAD_ROOM);
  const length = textEncoder.encodeInto(value, body).written;
  const end = TEXT_HEAD_ROOM + length;
  if (length < 24) {
    bytes[4] = 0x60 | length;
    return murmur3Bytes(bytes, 4, end);
  }
  if (length < 0x100) {
    bytes[3] = 0x78;
    bytes[4] = length;
    return murmur3Bytes(bytes, 3, end);
  }
  if (length < 0x10000) {
    bytes[2] = 0x79;
    bytes[3] = length >>> 8;
    bytes[4] = length & 0xff;
    return murmur3Bytes(bytes, 2, end);
  }
  bytes[0] = 0x7a;
  bytes[1] = length >>> 24;
  bytes[2] = (length >>> 16) & 0xff;
  bytes[3] = (length >>> 8) & 0xff;
  bytes[4] = length & 0xff;
  return murmur3Bytes(bytes, 0, end);
}

// deterministic CBOR bytes -> murmur3_x86_32, matching Go's murmur3.Sum32(bytes)/Python's mmh3.hash(bytes) over raw bytes. A string input skips the encoder; other inputs, including the [flagKey, targetingKey] shorthand, are encoded by cborg. No Buffer, which edge builds lack.
export function hashBucketingValue(value: unknown): number {
  if (typeof value === 'string') {
    return hashText(value);
  }
  const bytes = encodeDeterministicCbor(value);
  return murmur3Bytes(bytes, 0, bytes.length);
}
