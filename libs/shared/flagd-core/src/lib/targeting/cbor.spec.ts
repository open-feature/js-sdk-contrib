import MurmurHash3 from 'imurmurhash';
import { encodeDeterministicCbor, normalizeForCbor, hashBucketingValue } from './cbor';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('deterministic CBOR encoding', () => {
  // ground-truth vectors from the reference (Python cbor2 canonical + ADR normalization), per RFC 8949 Core Deterministic Encoding (section 4.2.1); these lock cross-language byte-parity, so changing them breaks bucketing consistency.
  const vectors: [string, unknown, string][] = [
    ['true', true, 'f5'],
    ['false', false, 'f4'],
    ['string hello', 'hello', '6568656c6c6f'],
    ['string "null"', 'null', '646e756c6c'],
    ['empty string', '', '60'],
    ['int 0', 0, '00'],
    ['int 1', 1, '01'],
    ['float 1.0 -> int', 1.0, '01'],
    ['-0.0 -> int 0', -0.0, '00'],
    ['int -2', -2, '21'],
    ['float -2.0 -> int', -2.0, '21'],
    ['int 23', 23, '17'],
    ['int 24 (uint8)', 24, '1818'],
    ['int 255 (uint8 max)', 255, '18ff'],
    ['int 256 (uint16)', 256, '190100'],
    ['int 65535 (uint16 max)', 65535, '19ffff'],
    ['int 65536 (uint32)', 65536, '1a00010000'],
    ['int 4294967295 (uint32 max)', 4294967295, '1affffffff'],
    ['int 4294967296 (uint64)', 4294967296, '1b0000000100000000'],
    ['int max safe', 9007199254740991, '1b001fffffffffffff'],
    ['float 1.25 (float16)', 1.25, 'f93d00'],
    ['float 3.14 (float64)', 3.14, 'fb40091eb851eb851f'],
    ['float 0.1 (float64)', 0.1, 'fb3fb999999999999a'],
    ['float 65504.0 -> int (uint16)', 65504.0, '19ffe0'],
    ['float 65505.0 -> int (uint16)', 65505.0, '19ffe1'],
    ['float32 max (out of int range)', 3.4028234663852886e38, 'fa7f7fffff'],
    ['float64 3.5e38 (out of int range)', 3.5e38, 'fb47f074f8c4d3cd7b'],
    ['object {a:1,b:2}', { a: 1, b: 2 }, 'a2616101616202'],
    ['object {b:2,a:1} sorts to same', { b: 2, a: 1 }, 'a2616101616202'],
    [
      'nested object (sorted keys)',
      { user: { id: 7, admin: true }, tags: ['x', 'y'] },
      'a2647461677382617861796475736572a2626964076561646d696ef5',
    ],
    ['array [flagKey, targetingKey]', ['my-flag', 'user-123'], '82676d792d666c616768757365722d313233'],
  ];

  it.each(vectors)('%s', (_name, input, expected) => {
    expect(hex(encodeDeterministicCbor(input))).toBe(expected);
  });
});

describe('normalizeForCbor', () => {
  it('keeps whole numbers outside [-2^63, 2^64-1] as floats', () => {
    expect(normalizeForCbor(1e20)).toBe(1e20);
    expect(typeof normalizeForCbor(1e20)).toBe('number');
  });

  it('recurses into objects and arrays', () => {
    expect(normalizeForCbor({ a: 1.0, b: [2.0, 1.5] })).toEqual({ a: BigInt(1), b: [BigInt(2), 1.5] });
  });
});

describe('hashBucketingValue', () => {
  it('is deterministic for the same input', () => {
    expect(hashBucketingValue('abc')).toBe(hashBucketingValue('abc'));
  });

  it('returns an unsigned 32-bit integer', () => {
    const h = hashBucketingValue({ user: 'x', id: 42 });
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('hashBucketingValue against cborg bytes hashed as a latin1 string by imurmurhash', () => {
  // the same hash computed from cborg's bytes with an independent murmur3 implementation; a mismatch would move users between buckets.
  function reference(value: unknown): number {
    let latin1 = '';
    for (const byte of encodeDeterministicCbor(value)) {
      latin1 += String.fromCharCode(byte);
    }
    return new MurmurHash3(latin1).result() >>> 0;
  }

  const utf8Length = (value: string) => new TextEncoder().encode(value).length;

  // mulberry32, so a failure reproduces.
  function random(seed: number): () => number {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it.each([0, 1, 23, 24, 255, 256, 65535, 65536])('matches for strings of %i UTF-8 bytes', (length) => {
    for (const unit of ['a', 'é', '€', '😀']) {
      const unitLength = utf8Length(unit);
      const value = unit.repeat(Math.floor(length / unitLength)) + 'a'.repeat(length % unitLength);
      expect(utf8Length(value)).toBe(length);
      expect(hashBucketingValue(value)).toBe(reference(value));
    }
  });

  // 1024 UTF-16 code units is the most hashText encodes into its reused buffer.
  it.each([1023, 1024, 1025])('matches for strings of %i code units', (length) => {
    for (const unit of ['a', 'é', '€', '\ud800']) {
      const value = unit.repeat(length);
      expect(hashBucketingValue(value)).toBe(reference(value));
    }
    const pairAtEnd = 'a'.repeat(length - 2) + '😀';
    expect(hashBucketingValue(pairAtEnd)).toBe(reference(pairAtEnd));
  });

  it('matches for lone surrogates', () => {
    for (const value of ['\ud800', '\udc00', 'a\ud800', '\udbffa', '\udc00\ud800', '😀\ud83d', '\ude00😀']) {
      expect(hashBucketingValue(value)).toBe(reference(value));
    }
  });

  it('is not affected by an earlier, longer string', () => {
    expect(hashBucketingValue('z'.repeat(1000))).toBe(reference('z'.repeat(1000)));
    expect(hashBucketingValue('short')).toBe(reference('short'));
  });

  it('matches for non-string inputs of every byte length mod 4', () => {
    const values = [true, 24, 256, 65536, -1000, 1.5, 3.14, { a: 1 }, ['my-flag', 'user-123'], { user: { id: 7 } }];
    expect(new Set(values.map((value) => encodeDeterministicCbor(value).length % 4)).size).toBe(4);
    for (const value of values) {
      expect(hashBucketingValue(value)).toBe(reference(value));
    }
  });

  it('matches for generated strings with multibyte UTF-8 and lone surrogates', () => {
    const next = random(0x5eed);
    const pick = (max: number) => Math.floor(next() * max);
    const units = [
      () => String.fromCharCode(pick(0x80)),
      () => String.fromCharCode(0x80 + pick(0x780)),
      () => String.fromCharCode(0xe000 + pick(0x2000)),
      () => String.fromCodePoint(0x10000 + pick(0x100000)),
      () => String.fromCharCode(0xd800 + pick(0x800)),
    ];
    for (let run = 0; run < 2000; run++) {
      const length = pick(run % 10 === 0 ? 1200 : 40);
      let value = '';
      while (value.length < length) {
        value += units[pick(units.length)]();
      }
      expect(hashBucketingValue(value)).toBe(reference(value));
    }
  });
});
