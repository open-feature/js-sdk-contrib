/**
 * The OpenFeature Provider Conformance Suite against the Flagsmith **JavaScript** provider.
 *
 * The backend, and how the four language adoptions compare against it, are documented once in
 * https://github.com/aepfli/flagsmith-tck-testbed rather than restated in each adoption.
 */
import { join } from 'node:path';
import { Capability, KnownDeviation, runContainerizedProviderTck } from '@openfeature/tck';
import { FlagsmithOpenFeatureProvider } from '../lib/flagsmith-provider';
import { Flagsmith } from 'flagsmith-nodejs';

/** Fixed by the testbed, because the control API cannot hand connection parameters to a provider. */
const SERVER_SIDE_KEY = 'ser.provider-tck-server-key';

const PROXY_PORT = 8000;

// The suite owns the stack: it starts Compose, discovers the dynamically mapped host ports, builds
// the HttpControl against the control API, waits until it accepts commands, constructs a provider
// per scenario and tears the stack down. Nothing here touches testcontainers directly.
runContainerizedProviderTck({
  name: 'flagsmith-js-remote',
  composeFile: join(__dirname, 'docker-compose.yaml'),
  backendPorts: [PROXY_PORT],

  newProvider: (endpoint) => {
    // The Flagsmith SDK appends its own path segments, so this is the API root with a trailing
    // slash: remote evaluation requests "flags/" beneath it.
    const apiUrl = `http://${endpoint.host}:${endpoint.port(PROXY_PORT)}/api/v1/`;
    const client = new Flagsmith({ environmentKey: SERVER_SIDE_KEY, apiUrl });

    // useBooleanConfigValue puts this provider on the same footing as the other three.
    //
    // It defaults to FALSE here, meaning a boolean flag resolves from Flagsmith's `enabled` state
    // rather than from feature_state_value — the same default Python takes, and the opposite of Go
    // and Java. Four providers for one product, split two-two on what a boolean flag *is*.
    //
    // The canonical set models booleans as values and seeds every flag enabled, so the default
    // would resolve boolean-zero-flag to true, which the falsy-value scenario exists to catch.
    return new FlagsmithOpenFeatureProvider(client, { useBooleanConfigValue: true });
  },

  // Capability.Variants is withheld: Flagsmith has no variant concept for a plain feature, the
  // evaluation response carries no variant key, and no seeding can produce one. That is permitted
  // rather than defective — 2.2.4 makes the variant a SHOULD and types.md marks the field optional
  // — so it carries no deviation entry.
  //
  // StandardReasons and DisabledFlags are declared and both fail: this provider does report a
  // reason and does handle a disabled flag, and gets both wrong. Go and Java pass DisabledFlags.
  //
  // Capability.StringTyping is DECLARED and its two scenarios fail; Capability.FullyTypedValues is
  // WITHHELD. This adoption is the one that split exists for, and the asymmetry is the point of it:
  // withholding is a statement about the backend and carries no deviation, while declaring and
  // failing is a statement about this provider's own code.
  //
  // Measured under the single tag the two replace: all four scenarios failed, boolean-flag
  // resolving to "true", integer-flag to "10", float-flag to "0.5" and object-flag to the raw JSON
  // text, none of them reporting TYPE_MISMATCH. One tag over all four meant one decision, and
  // withholding reported all four as a permitted backend absence when only two of them are.
  //
  // FullyTypedValues is withheld on the backend, which is what Appendix F gates the question on: a
  // store that keeps a value as text satisfies the string accessor for it and has no mismatch to
  // report. Flagsmith's feature_state_value is natively boolean, integer or string and nothing else
  // -- no float type and no structure type -- so "A float flag is not returned as its string
  // representation" and "A structured flag is not returned as its JSON text" ask about types this
  // backend does not record, and both skip. No deviation against it, for the reason Variants above
  // gives: an entry would report a permitted absence as a defect. All four language adoptions
  // withhold this tag.
  //
  // StringTyping is declared, and the two rows of "A non-string flag is not returned as its string
  // representation" -- boolean-flag and integer-flag -- fail. These are the rows a partially typed
  // store can still answer: Flagsmith does distinguish a boolean and an integer, and the Go, Java
  // and Python providers report TYPE_MISMATCH for both against this identical backend. This one
  // does not, and the cause is in its own code rather than in the backend: typeFactory's string
  // branch is an unconditional `String(value)` (src/lib/type-factory.ts:51-52) where its number,
  // boolean and object branches all return undefined and become a TYPE_MISMATCH. It would stringify
  // a value of any type, whatever the backend stored.
  //
  // So this half follows the @numeric-coercion precedent in the appendix rather than the Variants
  // one. The provider holds the type information and converts anyway; a skip would say the question
  // could not be put, which is false here. The capability is declared, the two scenarios fail, and
  // the KnownDeviation below names the line. Fixing type-factory.ts is a change to the provider and
  // belongs in its own pull request rather than here -- an adoption that repaired what it measured
  // would have no measurement left to report.
  //
  // Capability.NumericCoercion carries NO deviation here, deliberately, and the TCK refuses one:
  // JavaScript has a single numeric type, so "a float requested as an integer" is not expressible
  // and nothing was ever put to this provider. The Go, Java and Python adoptions do record one,
  // because in those languages the question can be asked and the answer is wrong. Recording it
  // here would claim a failure at something never asked.
  //
  // The lifecycle and event capabilities are withheld because this provider has no observable
  // initialisation for the suite to assert against.
  capabilities: [
    Capability.Object,
    Capability.LargeIntegers,
    Capability.Targeting,
    Capability.StandardReasons,
    Capability.DisabledFlags,
    Capability.StringTyping,
  ],

  knownDeviations: [
    KnownDeviation.untracked(
      Capability.StandardReasons,
      'The reason is reported as `flag.enabled ? TARGETING_MATCH : DISABLED` -- taken from the ' +
        'enabled state alone, with no targeting involved and without consulting the evaluation ' +
        'context at all. So every enabled flag reports TARGETING_MATCH, telling the caller a ' +
        'targeting rule matched when the canonical set carries exactly one rule and the flag in ' +
        'question has none. 2.2.5 makes the reason a SHOULD, which is why this is a withheld ' +
        'claim rather than a failure, but TARGETING_MATCH for an untargeted flag is not defensible ' +
        'on SHOULD grounds -- it is a wrong answer rather than a missing one. The Go Flagsmith ' +
        'provider reports STATIC, DISABLED and TARGETING_MATCH correctly against the identical ' +
        'backend. Seven of the nine reason.feature scenarios fail on this, and the ' +
        'capability is declared rather than withheld so those failures stay in the results.',
    ),
    KnownDeviation.untracked(
      Capability.DisabledFlags,
      'A disabled flag raises GeneralError rather than resolving to the caller default with no ' +
        'error code, so the scenario fails with error-code GENERAL where it expects none. ' +
        'Neither configuration satisfies it: returnValueForDisabledFlags defaults to false and ' +
        'throws, and setting it true returns the configured value of the flag instead of the ' +
        'caller default -- which the scenario also catches, because the configured value of each ' +
        'disabled flag differs from the default the scenario passes in. The Go and Java Flagsmith ' +
        'providers return the caller default with reason DISABLED and no error code, which is ' +
        'what the tag asserts, and both declare the capability.',
    ),
    KnownDeviation.untracked(
      Capability.StringTyping,
      "typeFactory's string branch is an unconditional `String(value)` " +
        '(src/lib/type-factory.ts:51-52), where its number, boolean and object branches return ' +
        'undefined and so become a TYPE_MISMATCH. A String request for boolean-flag therefore ' +
        'resolves to "true" and for integer-flag to "10", neither reporting an error code, so both ' +
        'rows of "A non-string flag is not returned as its string representation" fail. The ' +
        'backend is not the cause: Flagsmith records a boolean and an integer natively, and the ' +
        'Go, Java and Python Flagsmith providers report TYPE_MISMATCH for both against this ' +
        'identical backend. Declared and failing rather than withheld, on the @numeric-coercion ' +
        'precedent in Appendix F: the provider has the type information and converts anyway, ' +
        'which a skip cannot express -- a skip says the question could not be put. The float and ' +
        'structured rows are held separately behind @fully-typed-values, which IS withheld here ' +
        'because Flagsmith records no native float or structure type, so this entry covers only ' +
        'the two rows the backend can answer. Untracked: no issue in open-feature/js-sdk-contrib ' +
        'covers the string accessor, and the fix belongs in a pull request against the provider ' +
        'rather than in this suite.',
    ),
  ],

  eventTimeoutMs: 15_000,
  readyTimeoutMs: 30_000,
});
