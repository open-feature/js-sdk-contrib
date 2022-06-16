import { ClassValidatorHook } from './class-validator-hook';
import { IsString, ValidateNested } from '@nestjs/class-validator';
import {
  plainToClass,
  ClassConstructor,
  ClassTransformOptions,
  Type,
} from '@nestjs/class-transformer';
import { FlagValue } from '@openfeature/nodejs-sdk';

// Used by class transformer
import 'reflect-metadata';

describe('ClassValidatorHook', () => {
  type TestCase = [string, ClassConstructor<object>, FlagValue, boolean];

  class Person {
    @IsString()
    name!: string;
  }

  class Group {
    @Type(() => Person)
    @ValidateNested()
    people!: Person[];
  }

  const testCases: TestCase[] = [
    [
      'it should succeed because the value matches the person class',
      Person,
      { name: 'mike' },
      true,
    ],
    [
      "it should fail because the value doesn't matches the person class",
      Person,
      { size: 'tall' },
      false,
    ],
    [
      'it should succeed because the value matches the group class with nested people',
      Group,
      { people: [{ name: 'mike' }, { name: 'todd' }] },
      true,
    ],
    ['it should fail because the input is a string', Person, 'mike', false],
    ['it should fail because the input is a boolean', Person, false, false],
    ['it should fail because the input is a number', Person, 3, false],
  ];

  test.each(testCases)('%s', async (_, validationClass, flagValue, success) => {
    const classValidatorHook = new ClassValidatorHook(validationClass);

    if (success) {
      await expect(
        classValidatorHook.after({ flagValueType: typeof flagValue } as any, {
          flagKey: 'test',
          value: flagValue,
        })
      ).resolves.toBeUndefined();
    } else {
      await expect(
        classValidatorHook.after({ flagValueType: typeof flagValue } as any, {
          flagKey: 'test',
          value: flagValue,
        })
      ).rejects.toThrowError('Parse Error');
    }
  });
});
