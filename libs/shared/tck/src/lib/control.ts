/**
 * The single seam between the TCK's scenarios and whatever manipulates the backend under test.
 *
 * Step definitions never talk to a backend directly. They talk to this interface, which is why the
 * same Gherkin runs unchanged against a containerised backend driven over HTTP and against a
 * provider manipulated in-process. Nothing below this line knows about ports, containers or
 * transports.
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
   * baseline of the canonical flag set.
   *
   * Called once before each scenario. This is the TCK's only isolation mechanism — scenarios share
   * one backend for the whole suite, and containers are never restarted between them.
   */
  prepareScenario(): Promise<void>;

  /**
   * Mutates flag configuration so a conforming provider observes a configuration change and
   * afterwards resolves a different value for `changing-flag`.
   *
   * Which value it changes to is deliberately unspecified; the suite asserts only that the resolved
   * value differs from what it was before.
   */
  changeFlag(): Promise<void>;

  /** A short description of what is being controlled, for messages a human reads. */
  readonly description: string;

  /**
   * How the backend was driven, for the conformance report's `backend.controlApi`.
   *
   * `'http'` means the normative control API; `'in-process'` is the narrow allowance for providers
   * with no backend.
   *
   * Required, closed to those two values, with no default and **no inference from the control's
   * concrete type** — Appendix F requires the control to state it, and inferring it is right about
   * the two built-in controls and silently wrong about an adopter's custom one, which is the case
   * where the answer matters. It costs an implementor nothing: almost nobody implements this
   * interface, since a provider with a backend gets {@link HttpControl} from the Compose harness and
   * one without gets {@link InProcessControl}.
   */
  readonly controlApi: 'http' | 'in-process';
}

/**
 * Implemented by a backend that can be cut off from the provider and restored.
 *
 * Separate from {@link BackendControl} so a backend-less provider cannot accidentally supply a
 * no-op implementation: not implementing it at all is the honest answer, and the TCK turns the
 * resulting gap into an explicit, reported skip.
 */
export interface ConnectionControl {
  /** Makes the backend unreachable for the rest of the scenario, without stopping any container. */
  disconnect(): Promise<void>;

  /**
   * Makes the backend reachable again, preserving flag state.
   *
   * Preserving flag state is a requirement, not an implementation detail. An outage must be
   * observable as a change in availability and never as a change in flag values, or the stale
   * scenario cannot distinguish the two.
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

/**
 * Builds the error thrown when a backend has no connection to control.
 *
 * It is always a test-configuration bug rather than a provider defect: the scenarios needing
 * connection control are gated behind {@link Capability.Stale} and
 * {@link Capability.UnavailableInit}, so reaching an unsupported operation means a capability was
 * declared that the backend cannot back up. The TCK fails loudly rather than skipping, because a
 * silent no-op would report the scenario as passed.
 *
 * The message names the fix, because the mistake it reports is always the same one.
 */
export function unsupportedControl(control: BackendControl, operation: string): Error {
  return new Error(
    `${control.description} does not support '${operation}'. This is a test-configuration bug ` +
      `rather than a provider defect: a scenario needing connection control ran, so the suite ` +
      `declared Capability.Stale or Capability.UnavailableInit for a backend that cannot simulate ` +
      `an outage. Remove those capabilities, or supply a BackendControl that also implements ` +
      `ConnectionControl.`,
  );
}
