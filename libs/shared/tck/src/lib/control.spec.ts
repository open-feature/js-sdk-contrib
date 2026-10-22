import type { BackendControl, BackendType } from './control';
import { asConfigurationControl, resolveBackendType, unsupportedConfiguration } from './control';
import { HttpControl } from './httpControl';
import { InProcessControl } from './inProcessControl';

/**
 * Things the Gherkin cannot assert about itself.
 *
 * What a report says about how the backend was driven is invisible from inside a scenario: every
 * scenario passes either way, and a wrong answer certifies a path the run never took.
 */
describe('the backend type a control reports', () => {
  /** A control that exists only to carry (or withhold) a `backendType`. */
  const controlStating = (backendType?: BackendType): BackendControl => ({
    description: 'a control that exists only to be named in a report',
    ...(backendType === undefined ? {} : { backendType }),
    prepareScenario: async () => undefined,
    changeFlag: async () => undefined,
  });

  it("is 'custom' for a control that states nothing", () => {
    // The point of the default: an adopter's own control is not the normative control API and not
    // the backend-less allowance either, so silence must resolve to the weakest honest claim
    // rather than to whichever value happened to be first in the union.
    expect(resolveBackendType(controlStating())).toBe('custom');
  });

  it('is believed when a control states one', () => {
    // A default that overrode what a control said would make the member decorative.
    expect(resolveBackendType(controlStating('http'))).toBe('http');
    expect(resolveBackendType(controlStating('in-process'))).toBe('in-process');
    expect(resolveBackendType(controlStating('custom'))).toBe('custom');
  });

  it('is stated, not defaulted, by both controls this library ships', () => {
    // The load-bearing guard. Both of these drive the backend by a path the suite can vouch for,
    // and the default is silent: drop either property and every report says 'custom', with no
    // scenario anywhere failing to say so.
    expect(new HttpControl({ baseUrl: 'http://localhost:8080' }).backendType).toBe('http');
    expect(new InProcessControl().backendType).toBe('in-process');

    expect(resolveBackendType(new HttpControl({ baseUrl: 'http://localhost:8080' }))).toBe('http');
    expect(resolveBackendType(new InProcessControl())).toBe('in-process');
  });
});

/**
 * Which controls can serve a named configuration, which is not something a scenario can ask.
 *
 * A control that cannot has to say so by not implementing it: a no-op would leave the canonical
 * baseline serving and let an extension scenario written against another configuration's flags fail
 * on every assertion, reported as a provider defect.
 */
describe('serving a named backend configuration', () => {
  it('is offered by the control API, whose /start takes a config', () => {
    expect(asConfigurationControl(new HttpControl({ baseUrl: 'http://localhost:8080' }))).toBeDefined();
  });

  it('is not offered by in-process control, which has one flag set', () => {
    // The honest answer rather than a gap: there is no second configuration to switch to.
    expect(asConfigurationControl(new InProcessControl())).toBeUndefined();
  });

  it('refuses a control that cannot, naming the configuration and the fix', () => {
    // The advice has to differ from the connection-control one: no capability gates this, so
    // "remove a capability" would send an adopter to the wrong knob.
    const control: BackendControl = {
      description: 'a control with one flag set',
      prepareScenario: async () => undefined,
      changeFlag: async () => undefined,
    };

    const error = unsupportedConfiguration(control, 'metadata');

    expect(error.message).toContain("cannot serve the 'metadata' configuration");
    expect(error.message).toContain('ConfigurationControl');
    expect(error.message).not.toContain('Capability');
  });
});
