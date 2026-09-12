import { asConnectionControl } from './control';
import { HttpControl } from './httpControl';

/**
 * Things the Gherkin cannot assert about itself.
 *
 * The control API's fallback rules are invisible from inside a scenario: a suite whose control
 * client gets them wrong still runs every scenario, and the failures it produces look like provider
 * defects rather than test-harness ones. So the request sequence is pinned here, against a stubbed
 * `fetch`, with no container involved.
 */
describe('HttpControl', () => {
  const BASE = 'http://localhost:32768';

  let calls: string[];
  let statuses: Map<string, number>;

  beforeEach(() => {
    calls = [];
    statuses = new Map();

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      return new Response(null, { status: statuses.get(new URL(url).pathname) ?? 200 });
    }) as unknown as typeof fetch;
  });

  const control = () => new HttpControl({ baseUrl: BASE });

  it('uses /reset for every scenario when the backend implements it', async () => {
    // /reset causes no availability blip, so unlike /start it cannot inject a spurious lifecycle
    // event into the scenario that follows.
    const subject = control();

    await subject.prepareScenario();
    await subject.prepareScenario();

    expect(calls).toEqual([`POST ${BASE}/reset`, `POST ${BASE}/reset`]);
  });

  it('falls back to /start when /reset is not implemented, and remembers', async () => {
    // The normal path rather than an edge case: flagd-testbed's launchpad, the reference
    // implementation, serves only /start, /restart, /stop and /change, so /reset answers 404.
    statuses.set('/reset', 404);
    const subject = control();

    await subject.prepareScenario();
    await subject.prepareScenario();

    expect(calls).toEqual([
      `POST ${BASE}/reset`,
      `POST ${BASE}/start?config=default`,
      // No second probe: the decision is cached for the rest of the suite.
      `POST ${BASE}/start?config=default`,
    ]);
  });

  it('treats 501 the same as 404', async () => {
    statuses.set('/reset', 501);
    const subject = control();

    await subject.prepareScenario();

    expect(calls).toEqual([`POST ${BASE}/reset`, `POST ${BASE}/start?config=default`]);
  });

  it('starts rather than resets after a disconnect', async () => {
    // The load-bearing one. /reset restores flag state and is not specified to start a stopped
    // backend, so a scenario following an outage that only reset would run against a backend that is
    // still down, and every one of its assertions would be reported as a provider defect.
    const subject = control();

    await subject.prepareScenario();
    await subject.disconnect();
    await subject.prepareScenario();

    expect(calls).toEqual([`POST ${BASE}/reset`, `POST ${BASE}/stop`, `POST ${BASE}/start?config=default`]);
  });

  it('reconnects by starting the configuration already in effect', async () => {
    // An outage must be observable as a change in availability and never as a change in flag values,
    // which is what starting the same configuration guarantees.
    const subject = new HttpControl({ baseUrl: BASE, configuration: 'ssl' });

    await subject.reconnect();

    expect(calls).toEqual([`POST ${BASE}/start?config=ssl`]);
  });

  it('fails loudly on an unexpected status', async () => {
    // Silence here would be the worst outcome: the scenario would run against a backend in an
    // unknown state and report whatever it found as a conformance result.
    statuses.set('/change', 500);

    await expect(control().changeFlag()).rejects.toThrow(/returned 500/);
  });

  it('resolves the base URL lazily, so a mapped host port need not exist yet', () => {
    // runProviderTck is called at module load, before any beforeAll has run, while the control
    // service's host port is only assigned once the stack comes up — which is also when the typical
    // container helper stops throwing.
    // Not a const, whatever prefer-const makes of a single assignment: the whole point is that the
    // thunk is called twice and sees a different answer each time, so the value cannot be known at
    // the declaration.
    // eslint-disable-next-line prefer-const
    let address: string | undefined;
    const subject = new HttpControl({
      baseUrl: () => {
        if (!address) {
          throw new Error('the stack is not up yet');
        }
        return `http://${address}`;
      },
    });

    // Constructing it must not have called the thunk, and reporting must not fail because of it.
    expect(subject.description).toContain('not resolved yet');

    address = 'localhost:32768';
    expect(subject.description).toContain(BASE);
  });

  it('rejects a base URL with no scheme', async () => {
    // The mistake this catches is specific: container helpers commonly hand back "host:port", which
    // URL parsing happily reads as a scheme of its own rather than rejecting.
    const subject = new HttpControl({ baseUrl: 'localhost:32768' });

    await expect(subject.changeFlag()).rejects.toThrow(/must use http or https/);
  });

  it('can simulate an outage', () => {
    // The mirror of the InProcessControl assertion that it cannot: declaring Capability.Stale is
    // only honest if the control behind it can actually take the backend away.
    expect(asConnectionControl(control())).toBeDefined();
  });
});
