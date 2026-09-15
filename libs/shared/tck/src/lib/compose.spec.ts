import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_BACKEND_SERVICE,
  DEFAULT_CONTROL_PORT,
  DEFAULT_STARTUP_TIMEOUT_MS,
  checkOptions,
  declaredPorts,
  requireDeclared,
  runContainerizedProviderTck,
} from './compose';
import type { ContainerizedTckOptions } from './compose';

/**
 * What can be asserted about the Compose harness without Docker.
 *
 * The harness's actual behaviour — start once, discover mapped ports, wait for the control API,
 * tear down — is exercised by the flagd and OFREP adoptions, which are the only place a real stack
 * exists. What is worth testing here is everything the harness refuses, because each refusal
 * replaces a failure that arrives minutes later as a container that never came up or a provider
 * pointed at nothing.
 *
 * The refusals go through `checkOptions` rather than through `runContainerizedProviderTck`, because
 * the entry point registers hooks and a `describe` as soon as the options pass and Jest does not
 * allow that from inside a test. One case below calls the entry point anyway, to establish that it
 * does check before it schedules.
 */

const composeDir = mkdtempSync(join(tmpdir(), 'tck-compose-'));
const composeFile = join(composeDir, 'docker-compose.yaml');
writeFileSync(composeFile, 'services:\n  backend:\n    image: example\n');

const optionsFor = (overrides: Partial<ContainerizedTckOptions> = {}): ContainerizedTckOptions => ({
  name: 'unit',
  composeFile,
  backendPorts: [8013],
  newProvider: () => {
    throw new Error('no provider is constructed while checking options');
  },
  ...overrides,
});

describe('the defaults', () => {
  it('are the ones the four languages agreed on', () => {
    // Asserted rather than assumed, because these three are the cross-language contract rather
    // than JavaScript's preference: Java's ContainerizedProviderTckTest defaults the same way, and
    // a suite that quietly disagreed would make two languages' adoptions of one stack differ.
    expect(DEFAULT_BACKEND_SERVICE).toBe('backend');
    expect(DEFAULT_CONTROL_PORT).toBe(8080);
    expect(DEFAULT_STARTUP_TIMEOUT_MS).toBe(60_000);
  });
});

describe('a valid configuration', () => {
  it('is accepted, so every refusal below is about the thing it names', () => {
    expect(() => checkOptions(optionsFor())).not.toThrow();
  });
});

describe('a compose file that is not there', () => {
  it('is refused, naming the path', () => {
    expect(() => checkOptions(optionsFor({ composeFile: join(composeDir, 'absent.yaml') }))).toThrow(
      /composeFile .*absent\.yaml does not exist/,
    );
  });

  it('says where a relative path was resolved from, which is the usual mistake', () => {
    // The runner's working directory is the workspace root, not the test file's directory, and a
    // relative path that reads correctly to a human is the failure this explains.
    expect(() => checkOptions(optionsFor({ composeFile: 'tck/docker-compose.yaml' }))).toThrow(
      /resolved against the test runner working directory/,
    );
  });

  it('is refused when it is missing altogether', () => {
    expect(() => checkOptions(optionsFor({ composeFile: '' }))).toThrow(/composeFile is required/);
  });

  it('is refused by the entry point before it schedules anything', () => {
    // The one call to the entry point itself. It has to throw, or this test would register a
    // describe block from inside a test.
    expect(() => runContainerizedProviderTck(optionsFor({ composeFile: '' }))).toThrow(/composeFile is required/);
  });
});

describe('backendPorts', () => {
  it('may not be empty, because a provider that connects to nothing wants the other entry point', () => {
    expect(() => checkOptions(optionsFor({ backendPorts: [] }))).toThrow(/backendPorts is empty/);
  });

  it('may not name the control port, which is mapped automatically', () => {
    expect(() => checkOptions(optionsFor({ backendPorts: [8013, 8080] }))).toThrow(
      /names the control port 8080, which is mapped automatically/,
    );
  });

  it('may name 8080 once the control API has been moved off it', () => {
    // The rule is about the control port, not about the number. A stack serving its control API on
    // 9090 is free to have the provider connect to 8080, and refusing that would be refusing a
    // coincidence.
    expect(() => checkOptions(optionsFor({ backendPorts: [8080], controlPort: 9090 }))).not.toThrow();
  });
});

describe('the declared ports', () => {
  it('carry the control port without it being listed', () => {
    const declared = declaredPorts({
      backendService: 'backend',
      controlPort: 8080,
      backendPorts: [8013, 8015],
      additionalPorts: {},
    });

    expect([...(declared.get('backend') ?? [])].sort()).toEqual([8013, 8015, 8080]);
  });

  it('keep one set per service, so a service named twice does not depend on lookup order', () => {
    const declared = declaredPorts({
      backendService: 'backend',
      controlPort: 8080,
      backendPorts: [8013],
      additionalPorts: { backend: [8014], envoy: [9212] },
    });

    expect([...(declared.get('backend') ?? [])].sort()).toEqual([8013, 8014, 8080]);
    expect([...(declared.get('envoy') ?? [])]).toEqual([9212]);
  });
});

describe('resolving a port', () => {
  const declared = declaredPorts({
    backendService: 'backend',
    controlPort: 8080,
    backendPorts: [8013],
    additionalPorts: { envoy: [9212] },
  });

  it('is allowed for anything the options declared', () => {
    expect(() => requireDeclared(declared, 'backend', 8013)).not.toThrow();
    expect(() => requireDeclared(declared, 'backend', 8080)).not.toThrow();
    expect(() => requireDeclared(declared, 'envoy', 9212)).not.toThrow();
  });

  it('names the option that should have declared it, and what is declared today', () => {
    // Compose publishes whatever the Compose file lists whether the options mention it or not, so
    // this refusal is the only thing making backendPorts and additionalPorts configuration rather
    // than documentation. The message has to say which one to edit.
    expect(() => requireDeclared(declared, 'backend', 8015)).toThrow(/Declare a port on the backend service in/);
    expect(() => requireDeclared(declared, 'backend', 8015)).toThrow(/Declared today: 'backend' 8013 8080; 'envoy'/);
    expect(() => requireDeclared(declared, 'envoy', 9211)).toThrow(/port 9211 on service 'envoy' was not declared/);
    expect(() => requireDeclared(declared, 'sidecar', 1234)).toThrow(/port 1234 on service 'sidecar'/);
  });
});
