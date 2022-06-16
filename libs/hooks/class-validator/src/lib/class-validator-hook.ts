import {
  EvaluationDetails,
  FlagValue,
  Hook,
  HookContext,
  ParseError,
} from '@openfeature/nodejs-sdk';
import { validate, ValidatorOptions } from '@nestjs/class-validator';
import {
  plainToClass,
  ClassConstructor,
  ClassTransformOptions,
} from '@nestjs/class-transformer';

export class ClassValidatorHook<T extends object> implements Hook {
  constructor(
    private readonly validationClass: ClassConstructor<T>,
    private readonly classTransformOptions?: ClassTransformOptions,
    private readonly validatorOptions?: ValidatorOptions
  ) {}

  async after(
    hookContext: HookContext,
    evaluationDetails: EvaluationDetails<FlagValue>
  ) {
    const value = evaluationDetails.value;
    if (hookContext.flagValueType !== 'object' || typeof value !== 'object') {
      // TODO use official type mismatch errors
      throw new Error('Parse Error');
    }

    const transformedClass = plainToClass(
      this.validationClass,
      value,
      this.classTransformOptions
    );

    const result = await validate(transformedClass, this.validatorOptions);
    if (result.length) {
      // throw new ParseError(`Class Validation Failed: ${result}`);
      throw new Error(`Parse Error: ${result}`);
    }
  }
}
