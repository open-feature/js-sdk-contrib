import { stripTrailingSlashes, validateUrlOption } from './validate-url';
import { InvalidOptionsException } from '../exception';

describe('validateUrlOption', () => {
  it.each(['https://gofeatureflag.org', 'http://localhost:8080', 'https://example.com/path?q=1'])(
    'should accept %s',
    (value) => {
      expect(() => validateUrlOption('endpoint', value)).not.toThrow();
    },
  );

  it.each(['not-a-url', '', 'gofeatureflag.org', '://missing-scheme'])(
    'should reject an unparseable value (%s)',
    (value) => {
      expect(() => validateUrlOption('endpoint', value)).toThrow(InvalidOptionsException);
      expect(() => validateUrlOption('endpoint', value)).toThrow('endpoint must be a valid URL (http or https)');
    },
  );

  it.each(['ftp://example.com', 'file:///tmp/flags', 'ws://example.com'])(
    'should reject a non-http(s) protocol (%s)',
    (value) => {
      expect(() => validateUrlOption('endpoint', value)).toThrow(InvalidOptionsException);
      expect(() => validateUrlOption('endpoint', value)).toThrow('endpoint must be a valid URL (http or https)');
    },
  );

  it('should name the option in the error message', () => {
    expect(() => validateUrlOption('dataCollectorBaseURL', 'not-a-url')).toThrow(
      'dataCollectorBaseURL must be a valid URL (http or https)',
    );
  });
});

describe('stripTrailingSlashes', () => {
  it.each([
    ['https://gofeatureflag.org/', 'https://gofeatureflag.org'],
    ['https://gofeatureflag.org///', 'https://gofeatureflag.org'],
    ['http://localhost:1031/', 'http://localhost:1031'],
  ])('should strip trailing slashes from %s', (input, expected) => {
    expect(stripTrailingSlashes(input)).toBe(expected);
  });

  it('should leave a URL with no trailing slash unchanged', () => {
    expect(stripTrailingSlashes('https://gofeatureflag.org')).toBe('https://gofeatureflag.org');
  });

  it('should preserve a path that is not only trailing slashes', () => {
    // Only the trailing run is removed - a `/v1` path segment must stay.
    expect(stripTrailingSlashes('https://gofeatureflag.org/v1/')).toBe('https://gofeatureflag.org/v1');
  });
});
