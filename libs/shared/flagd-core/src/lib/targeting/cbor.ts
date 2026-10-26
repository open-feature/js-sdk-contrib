import MurmurHash3 from 'imurmurhash';
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

// deterministic CBOR bytes -> murmur3_x86_32; feed bytes as a latin1 string so imurmurhash matches Go's murmur3.Sum32(bytes)/Python's mmh3.hash(bytes) over raw bytes (per-byte loop avoids Buffer, absent in edge builds).
export function hashBucketingValue(value: unknown): number {
  const bytes = encodeDeterministicCbor(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return new MurmurHash3(binary).result() >>> 0;
}
