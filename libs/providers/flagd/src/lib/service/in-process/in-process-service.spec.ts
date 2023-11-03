import {OpenFeature} from "@openfeature/server-sdk";
import {FlagdProvider} from "@openfeature/flagd-provider";

// todo fix this
global.setImmediate = jest.useRealTimers as unknown as typeof setImmediate;
jest.setTimeout(120 * 1000)

describe("In-process-service", () => {


  it('should work', async () => {

    const provider = new FlagdProvider({resolverType: 'in-process', port: 9090});
    OpenFeature.setProvider(provider);

    console.log("provider wait completed")
    await new Promise((r) => setTimeout(r, 40000));

    await OpenFeature.close()
  });
})
