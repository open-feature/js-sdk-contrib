Feature: Vendor-specific behaviour outside the shared contract

  # This file is a fixture, not a conformance artifact. It stands in for the scenarios a vendor has
  # that the canonical suite cannot carry -- flagd's `fractional` targeting is the motivating
  # example -- and it is what `extensionSuite.spec.ts` runs to prove that an adopter's feature and
  # the canonical ones share one suite and one backend lifecycle.
  #
  # It is named `vendor`, and it lives in a directory named `extension-features`. Neither is a
  # canonical name, and the harness refuses an extension feature that reuses one.

  Background:
    Given a stable provider

  Scenario: A vendor rule resolves through the provider under test
    # Two steps of the extension's own vocabulary and four of the canonical one, in one scenario.
    # That is the point of binding both sets in the same autoBindSteps call.
    Given the vendor rule serves "confetti" for "vendor-flag"
    And a String-flag with key "vendor-flag" and a default value "none"
    When the flag was evaluated with details
    Then the resolved details value should be "confetti"
    And the error-code should be ""
    And no exception should have been thrown

  Scenario: A vendor scenario starts from the backend state the canonical suite starts from
    # The extension runs inside the TCK's own beforeEach, so the vendor rule the previous scenario
    # installed is gone and the canonical flag set is back. An adopter maintaining a parallel
    # harness has to rebuild this, and will get it subtly wrong.
    Given a String-flag with key "vendor-flag" and a default value "none"
    When the flag was evaluated with details
    Then the resolved details value should be "none"
    And the error-code should be "FLAG_NOT_FOUND"

  @stale
  Scenario: A vendor scenario is gated by the capability declaration like any other
    # @stale is not declared by this suite, so this scenario must be reported as skipped rather
    # than quietly dropped -- extensions get the capability gate, not just the test runner.
    Given the vendor rule serves "never-runs" for "vendor-flag"
