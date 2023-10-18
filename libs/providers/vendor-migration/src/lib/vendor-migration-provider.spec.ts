import { VendorMigrationProvider } from './vendor-migration-provider';
import { DefaultLogger, InMemoryProvider, StandardResolutionReasons } from '@openfeature/server-sdk'

describe('VendorMigrationProvider', () => {
  const defaultProvider = new InMemoryProvider();
  const migrationTargetProvider = new InMemoryProvider();
  const logger = new DefaultLogger();

  const providersList = [defaultProvider, migrationTargetProvider];
  describe("string flags", () => {
    it.only("Should return the flag value from the first provider specthat it finds (and report different values in other providers - warn)", async () => {
      const defaultProviderSpec = {
        "a-string-flag": {
          variants: {
            on: "on",
            off: "off"
          },
          defaultVariant: "on",
          disabled: false
        }
      };

      const migrationTargetSpec = {
        "a-string-flag": {
          variants: {
            on: "on",
            off: "off",
            different: "different"
          },
          defaultVariant: "different",
          disabled: false
        }
      };

      defaultProvider.putConfiguration(defaultProviderSpec);
      migrationTargetProvider.putConfiguration(migrationTargetSpec);

      const vendorMigrationProvider = new VendorMigrationProvider(providersList, 'strict', logger);

      const loggerWarnSpy = jest.spyOn(logger, 'warn')

      const resolvedTo = await vendorMigrationProvider.resolveStringEvaluation("a-string-flag", "defaultString", {});

      expect(resolvedTo).toEqual({ value: "on", variant: "on", reason: StandardResolutionReasons.STATIC })
      expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    });

    it.only("Should return the flag value from the first provider specthat it finds (and report different values in other providers - warn)", async () => {
      const defaultProviderSpec = {
        "a-string-flag": {
          variants: {
            on: "on",
            off: "off"
          },
          defaultVariant: "on",
          disabled: false
        }
      };

      const migrationTargetSpec = {
        "a-string-flag": {
          variants: {
            on: "on",
            off: "off",
            different: "different"
          },
          defaultVariant: "different",
          disabled: false
        },
        "another-string-flag": {
          variants: {
            on: "on",
            off: "off",
          },
          defaultVariant: "on",
          disabled: false
        }
      };

      defaultProvider.putConfiguration(defaultProviderSpec);
      migrationTargetProvider.putConfiguration(migrationTargetSpec);

      const vendorMigrationProvider = new VendorMigrationProvider(providersList, 'strict', logger);

      const loggerErrorSpy = jest.spyOn(logger, 'error')

      const resolvedTo = await vendorMigrationProvider.resolveStringEvaluation("another-string-flag", "defaultString", {});

      expect(resolvedTo).toEqual({ value: "on", variant: "on", reason: StandardResolutionReasons.STATIC })
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });
});
