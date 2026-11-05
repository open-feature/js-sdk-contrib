import type { EvaluationDetails, FlagMetadata, FlagValue } from '@openfeature/server-sdk';
import type { TckState } from '../state';
import { flagSteps } from './flagSteps';
import type { StepRunner } from './stepHarness.testkit';
import { bindSteps, stateUnderTest } from './stepHarness.testkit';

/** A row of a `key | type | value` context table, as jest-cucumber hands one over. */
const contextRow = (key: string, type: string, value: string) => ({ key, type, value });

/** A row of the specification's `key | metadata_type | value` table. */
const metadataRow = (key: string, type: string, value: string) => ({ key, metadata_type: type, value });

/**
 * What a context table does to the evaluation context.
 *
 * The targeting key is the part worth pinning: merging is where an earlier statement can be lost or
 * a later one ignored, and both failures leave a scenario that still passes against a provider which
 * ignores targeting altogether.
 */
describe('the context table step', () => {
  let state: TckState;
  let run: StepRunner;

  beforeEach(() => {
    state = stateUnderTest();
    run = bindSteps(flagSteps(state));
  });

  const step = 'a context with the following keys:';

  it('sets one typed entry per row', async () => {
    await run(step, [
      contextRow('region', 'String', 'eu'),
      contextRow('attempts', 'Integer', '3'),
      contextRow('fresh', 'Boolean', 'true'),
    ]);

    expect(state.context).toEqual({ region: 'eu', attempts: 3, fresh: true });
  });

  it('reaches the wider types a targeting operator takes', async () => {
    await run(step, [contextRow('editions', 'StringList', 'one, two'), contextRow('shard', 'Long', '4294967296')]);

    // A list rather than one comma-joined string, which an operator would read as a single member.
    expect(state.context).toEqual({ editions: ['one', 'two'], shard: 4294967296 });
  });

  it('leaves a targeting key the scenario stated earlier alone', async () => {
    await run('a context containing a targeting key with value "tim"');

    await run(step, [contextRow('region', 'String', 'eu')]);

    expect(state.context).toEqual({ targetingKey: 'tim', region: 'eu' });
  });

  it('lets a row set the targeting key, the row being the later statement', async () => {
    await run('a context containing a targeting key with value "tim"');

    await run(step, [contextRow('targetingKey', 'String', 'ada')]);

    expect(state.context).toEqual({ targetingKey: 'ada' });
  });

  it('adds up across two tables', async () => {
    await run(step, [contextRow('region', 'String', 'eu')]);
    await run(step, [contextRow('tier', 'String', 'gold')]);

    expect(state.context).toEqual({ region: 'eu', tier: 'gold' });
  });

  it('refuses a type that is not in the vocabulary rather than passing the cell through', async () => {
    await expect(run(step, [contextRow('when', 'Duration', '3s')])).rejects.toThrow(/unknown context value type/);
  });
});

/**
 * The flag-metadata assertions, whose wording and columns are the specification's own.
 *
 * Each case is written so the opposite implementation would fail it: a value that matches and one
 * that does not, metadata that is empty and metadata that is not.
 */
describe('the flag metadata assertions', () => {
  let state: TckState;
  let run: StepRunner;

  beforeEach(() => {
    state = stateUnderTest();
    run = bindSteps(flagSteps(state));
  });

  const evaluated = (flagMetadata: FlagMetadata): void => {
    state.details = { flagKey: 'metadata-flag', value: true, flagMetadata } as EvaluationDetails<FlagValue>;
  };

  it('compares every type the specification table uses by that type', async () => {
    evaluated({ scope: 'eu', version: 2, ratio: 0.1, cached: true });

    await expect(
      run('the resolved metadata should contain', [
        metadataRow('scope', 'String', 'eu'),
        metadataRow('version', 'Integer', '2'),
        metadataRow('ratio', 'Float', '0.1'),
        metadataRow('cached', 'Boolean', 'true'),
      ]),
    ).resolves.toBeUndefined();
  });

  it('fails on a value that differs, naming the key and what the provider sent', async () => {
    evaluated({ version: 2 });

    await expect(run('the resolved metadata should contain', [metadataRow('version', 'Integer', '3')])).rejects.toThrow(
      /metadata 'version' \(Integer\) was 2 \(number\), expected 3 \(number\)/,
    );
  });

  it('fails on a value of the wrong type, however well it reads', async () => {
    // Metadata crosses the wire as JSON, and this is exactly how a provider loses a type: the
    // number arrives as a string and every message about it still reads "2".
    evaluated({ version: '2' });

    await expect(run('the resolved metadata should contain', [metadataRow('version', 'Integer', '2')])).rejects.toThrow(
      /metadata 'version' \(Integer\) was 2 \(string\), which this row declares numeric/,
    );
  });

  it('fails a String row answered with a number, which is the same loss the other way', async () => {
    evaluated({ scope: 2 });

    await expect(run('the resolved metadata should contain', [metadataRow('scope', 'String', '2')])).rejects.toThrow(
      /was 2 \(number\), expected 2 \(string\)/,
    );
  });

  it('accepts a Float that a 32-bit transport widened', async () => {
    // What the table means by 0.1 is the number, not the double its decimal parses to: a provider
    // whose wire format carries a float hands back 0.10000000149011612 and is not wrong.
    evaluated({ ratio: 0.10000000149011612 });

    await expect(
      run('the resolved metadata should contain', [metadataRow('ratio', 'Float', '0.1')]),
    ).resolves.toBeUndefined();
  });

  it('still fails a Float that is a different number', async () => {
    // The tolerance covers one transport's precision and nothing else -- a provider resolving the
    // wrong value must not pass through it.
    evaluated({ ratio: 0.2 });

    await expect(run('the resolved metadata should contain', [metadataRow('ratio', 'Float', '0.1')])).rejects.toThrow(
      /metadata 'ratio' \(Float\) was 0.2 \(number\), expected 0.1 \(number\)/,
    );
  });

  it('compares an Integer wider than 32 bits exactly, rather than refusing it', async () => {
    // Nothing reads metadata back through getIntegerDetails, so a provider carrying a wide number
    // is not making a mistake -- and an Integer row gets no tolerance either way.
    evaluated({ hash: 4294967296 });

    await expect(
      run('the resolved metadata should contain', [metadataRow('hash', 'Integer', '4294967296')]),
    ).resolves.toBeUndefined();
    await expect(
      run('the resolved metadata should contain', [metadataRow('hash', 'Integer', '4294967297')]),
    ).rejects.toThrow(/expected 4294967297/);
  });

  it('does not check an entry the table leaves out', async () => {
    // A provider may attach its own, and a scenario that had to enumerate them would fail on each
    // addition.
    evaluated({ listed: 'yes', unlisted: 'whatever' });

    await expect(
      run('the resolved metadata should contain', [metadataRow('listed', 'String', 'yes')]),
    ).resolves.toBeUndefined();
  });

  it('says which entry is missing, and what there was instead', async () => {
    evaluated({ scope: 'eu' });

    await expect(run('the resolved metadata should contain', [metadataRow('version', 'Integer', '2')])).rejects.toThrow(
      /no 'version' entry, expected 2 \(number\). It carries scope/,
    );
  });

  it('refuses a metadata type flag metadata cannot carry', async () => {
    evaluated({ scope: 'eu' });

    await expect(run('the resolved metadata should contain', [metadataRow('scope', 'Object', '{}')])).rejects.toThrow(
      /flag metadata is String, Boolean, Integer, Float/,
    );
  });

  it('holds the empty assertion for empty metadata and for nothing else', async () => {
    evaluated({});
    await expect(run('the resolved metadata is empty')).resolves.toBeUndefined();

    evaluated({ scope: 'eu' });
    await expect(run('the resolved metadata is empty')).rejects.toThrow(/carries scope, expected none/);
  });

  it('names the step that is missing when nothing has been evaluated', async () => {
    await expect(run('the resolved metadata is empty')).rejects.toThrow(/the flag was evaluated with details/);
  });

  it('reports a provider that attaches no metadata map at all', async () => {
    // Typed as always present, so only a JavaScript provider can produce this -- and reading it as
    // an empty map would make "the resolved metadata is empty" pass for an omission.
    state.details = { flagKey: 'metadata-flag', value: true } as EvaluationDetails<FlagValue>;

    await expect(run('the resolved metadata is empty')).rejects.toThrow(/expected a map/);
  });
});
