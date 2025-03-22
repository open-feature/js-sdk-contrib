import {
  GetParameterCommand,
  SSMClient,
  SSMClientConfig,
  GetParameterCommandInput,
  DescribeParametersCommand,
} from '@aws-sdk/client-ssm';
import { ResponseMetadata } from '@smithy/types';
import {
  FlagNotFoundError,
  TypeMismatchError,
  JsonValue,
  ParseError,
  ResolutionDetails,
  StandardResolutionReasons,
} from '@openfeature/core';

export class SSMService {
  client: SSMClient;
  enableDecryption: boolean;
  constructor(config: SSMClientConfig, enableDecryption: boolean = false) {
    this.client = new SSMClient(config);
    this.enableDecryption = enableDecryption;
  }

  async getBooleanValue(name: string): Promise<ResolutionDetails<boolean>> {
    const res = await this._getValueFromSSM(name);

    const { val, metadata } = res;

    let result: boolean;
    switch (val) {
      case 'true':
        result = true;
        break;
      case 'false':
        result = false;
        break;
      default:
        throw new TypeMismatchError(`${val} is not a valid boolean value`);
    }

    return {
      value: result,
      reason: StandardResolutionReasons.STATIC,
      flagMetadata: { ...metadata },
    };
  }

  async getStringValue(name: string): Promise<ResolutionDetails<string>> {
    const res = await this._getValueFromSSM(name);
    const { val, metadata } = res;
    return {
      value: val,
      reason: StandardResolutionReasons.STATIC,
      flagMetadata: { ...metadata },
    };
  }

  async getNumberValue(name: string): Promise<ResolutionDetails<number>> {
    const res = await this._getValueFromSSM(name);
    const { val, metadata } = res;

    if (Number.isNaN(Number(val))) {
      throw new TypeMismatchError(`${val} is not a number`);
    }
    return {
      value: Number(val),
      reason: StandardResolutionReasons.STATIC,
      flagMetadata: { ...metadata },
    };
  }

  async getObjectValue<U extends JsonValue>(name: string): Promise<ResolutionDetails<U>> {
    const res = await this._getValueFromSSM(name);
    const { val, metadata } = res;
    try {
      return {
        value: JSON.parse(val),
        reason: StandardResolutionReasons.STATIC,
        flagMetadata: { ...metadata },
      };
    } catch (e) {
      throw new ParseError(`Unable to parse value as JSON: ${e}`);
    }
  }

  async _isSecureString(name: string): Promise<boolean> {
    const res = await this.client.send(
      new DescribeParametersCommand({
        ParameterFilters: [
          {
            Key: 'Name',
            Values: [name],
          },
        ],
      }),
    );

    if (!res.Parameters) {
      throw new FlagNotFoundError(`Unable to find an SSM Parameter with key ${name}`);
    }
    return res.Parameters[0].Type === 'SecureString';
  }

  async _getValueFromSSM(name: string): Promise<{ val: string; metadata: ResponseMetadata }> {
    const param: GetParameterCommandInput = {
      Name: name,
    };

    if (this.enableDecryption) {
      param.WithDecryption = await this._isSecureString(name);
    }

    const command: GetParameterCommand = new GetParameterCommand(param);

    const res = await this.client.send(command);

    if (!res.Parameter) {
      throw new FlagNotFoundError(`Unable to find an SSM Parameter with key ${name}`);
    }

    if (!res.Parameter.Value) {
      throw new ParseError(`Value is empty`);
    }

    return { val: res.Parameter.Value, metadata: res.$metadata };
  }
}
