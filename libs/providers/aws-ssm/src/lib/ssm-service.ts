import { GetParameterCommand, SSMClient, SSMClientConfig } from '@aws-sdk/client-ssm';
import {
  FlagNotFoundError,
  JsonValue,
  ParseError,
  ResolutionDetails,
  StandardResolutionReasons,
} from '@openfeature/core';

export class SSMService {
  client: SSMClient;

  constructor(config: SSMClientConfig) {
    this.client = new SSMClient(config);
  }

  async getBooleanValue(name: string): Promise<ResolutionDetails<boolean>> {
    const res = await this._getValueFromSSM(name);

    let result: boolean;
    switch (res) {
      case 'true':
        result = true;
        break;
      case 'false':
        result = false;
        break;
      default:
        throw new ParseError(`${res} is not a valid boolean value`);
    }

    return {
      value: result,
      reason: StandardResolutionReasons.STATIC,
    };
  }

  async getStringValue(name: string): Promise<ResolutionDetails<string>> {
    const res = await this._getValueFromSSM(name);
    return {
      value: res,
      reason: StandardResolutionReasons.STATIC,
    };
  }

  async getNumberValue(name: string): Promise<ResolutionDetails<number>> {
    const res = await this._getValueFromSSM(name);
    if (Number.isNaN(Number(res))) {
      throw new ParseError(`${res} is not a number`);
    }
    return {
      value: Number(res),
      reason: StandardResolutionReasons.STATIC,
    };
  }

  async getObjectValue<U extends JsonValue>(name: string): Promise<ResolutionDetails<U>> {
    const res = await this._getValueFromSSM(name);
    try {
      return {
        value: JSON.parse(res),
        reason: StandardResolutionReasons.STATIC,
      };
    } catch (e) {
      throw new ParseError(`Unable to parse value as JSON: ${e}`);
    }
  }

  async _getValueFromSSM(name: string): Promise<string> {
    const command: GetParameterCommand = new GetParameterCommand({
      Name: name,
    });

    const res = await this.client.send(command);

    if (!res.Parameter) {
      throw new FlagNotFoundError(`Unable to find an SSM Parameter with key ${name}`);
    }

    if (!res.Parameter.Value) {
      throw new ParseError(`Value is empty`);
    }

    return res.Parameter.Value;
  }
}
