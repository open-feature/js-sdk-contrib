/**
 * The single seam between the TCK's scenarios and whatever manipulates the backend under test.
 *
 * Step definitions never talk to a backend directly, which is why the same Gherkin runs unchanged
 * against a containerised backend driven over HTTP and against a provider manipulated in-process.
 *
 * ## Which implementation is right for your provider
 *
 * A provider that talks to a backend drives it over the HTTP control API — `openapi/control-api.yaml`
 * — and gets one from {@link runContainerizedProviderTck} without writing a control at all. A
 * provider with *no* backend to contract with (in-memory, environment-variable, file-based) uses
 * {@link InProcessControl}. Appendix F's "Providers with no backend" says why that second path is a
 * narrow allowance and not a shortcut for the first.
 */
export interface BackendControl {
  /**
   * Brings the backend to the state every scenario starts from: reachable, with flag state at the
   * canonical baseline. Called once before each scenario, and the TCK's only isolation mechanism —
   * scenarios share one backend for the whole suite and containers are never restarted.
   */
  prepareScenario(): Promise<void>;

  /**
   * Mutates flag configuration so a conforming provider observes a change and afterwards resolves a
   * different value for `changing-flag`. Which value is deliberately unspecified: the suite asserts
   * only that the resolved value differs from what it was.
   */
  changeFlag(): Promise<void>;

  /** A short description of what is being controlled, for messages a human reads. */
  readonly description: string;

  /**
   * How the backend was driven, for the conformance report's `backend.controlApi`: `'http'` is the
   * normative control API, `'in-process'` the narrow allowance for providers with no backend.
   *
   * Required, with **no inference from the control's concrete type**: inferring it is right about the
   * two built-in controls and silently wrong about an adopter's custom one, which is the case where
   * the answer matters.
   */
  readonly controlApi: 'http' | 'in-process';
}

/**
 * Implemented by a backend that can be cut off from the provider and restored.
 *
 * Separate from {@link BackendControl} so a backend-less provider cannot supply a no-op by accident:
 * not implementing it is the honest answer, and the TCK turns the gap into a reported skip.
 */
export interface ConnectionControl {
  /** Makes the backend unreachable for the rest of the scenario, without stopping any container. */
  disconnect(): Promise<void>;

  /**
   * Makes the backend reachable again, preserving flag state. That is a requirement rather than an
   * implementation detail: an outage must be observable as a change in availability and never as a
   * change in flag values, or the stale scenario cannot distinguish the two.
   */
  reconnect(): Promise<void>;
}

/** Narrows a control to one that can simulate an outage, or `undefined` if it cannot. */
export function asConnectionControl(control: BackendControl): ConnectionControl | undefined {
  const candidate = control as Partial<ConnectionControl>;
  return typeof candidate.disconnect === 'function' && typeof candidate.reconnect === 'function'
    ? (candidate as ConnectionControl)
    : undefined;
}

/** Builds the error thrown when a backend has no connection to control. Thrown rather than skipped:
 * a silent no-op would report the scenario as passed. */
export function unsupportedControl(control: BackendControl, operation: string): Error {
  return new Error(
    `${control.description} does not support '${operation}'. This is a test-configuration bug ` +
      `rather than a provider defect: a scenario needing connection control ran, so the suite ` +
      `declared Capability.Stale or Capability.UnavailableInit for a backend that cannot simulate ` +
      `an outage. Remove those capabilities, or supply a BackendControl that also implements ` +
      `ConnectionControl.`,
  );
}
