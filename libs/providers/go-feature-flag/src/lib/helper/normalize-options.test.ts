import { normalizeOptions } from './normalize-options';
import { ExporterMetadata } from '../model/exporter-metadata';

describe('normalizeOptions', () => {
  it('should not mutate the caller options object', () => {
    const caller = {
      endpoint: 'https://gofeatureflag.org///',
      headers: { 'X-Keep': 'a' },
      evaluationFlagList: ['flagA'],
    };

    normalizeOptions(caller);

    expect(caller.endpoint).toBe('https://gofeatureflag.org///');
    expect(caller.headers).toEqual({ 'X-Keep': 'a' });
    expect(caller.evaluationFlagList).toEqual(['flagA']);
  });

  it('should strip trailing slashes from endpoint and dataCollectorBaseURL', () => {
    const normalised = normalizeOptions({
      endpoint: 'https://gofeatureflag.org///',
      dataCollectorBaseURL: 'https://collector.example.com/',
    });

    expect(normalised.endpoint).toBe('https://gofeatureflag.org');
    expect(normalised.dataCollectorBaseURL).toBe('https://collector.example.com');
  });

  it('should leave dataCollectorBaseURL unset when the caller omitted it', () => {
    const normalised = normalizeOptions({ endpoint: 'https://gofeatureflag.org' });

    expect(normalised.dataCollectorBaseURL).toBeUndefined();
  });

  it('should copy nested collections so later caller edits do not leak in', () => {
    const headers = { 'X-Keep': 'a' };
    const evaluationFlagList = ['flagA'];

    const normalised = normalizeOptions({
      endpoint: 'https://gofeatureflag.org',
      headers,
      evaluationFlagList,
    });

    headers['X-Keep'] = 'mutated';
    evaluationFlagList.push('flagB');

    expect(normalised.headers).toEqual({ 'X-Keep': 'a' });
    expect(normalised.evaluationFlagList).toEqual(['flagA']);
  });

  it('should copy exporterMetadata so a later add does not leak in', () => {
    const exporterMetadata = new ExporterMetadata().add('team', 'core');

    const normalised = normalizeOptions({ endpoint: 'https://gofeatureflag.org', exporterMetadata });

    // `asObject()` is read at publish time, so sharing the instance let a caller change what every
    // later event exported, long after the provider was built.
    exporterMetadata.add('team', 'mutated').add('added-later', true);

    expect(normalised.exporterMetadata?.asObject()).toEqual(expect.objectContaining({ team: 'core' }));
    expect(normalised.exporterMetadata?.asObject()).not.toHaveProperty('added-later');
  });

  it('should accept a frozen options object', () => {
    const frozen = Object.freeze({ endpoint: 'https://gofeatureflag.org/' });

    expect(() => normalizeOptions(frozen)).not.toThrow();
    expect(normalizeOptions(frozen).endpoint).toBe('https://gofeatureflag.org');
  });
});
