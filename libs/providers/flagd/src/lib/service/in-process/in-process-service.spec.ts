import {OpenFeature} from "@openfeature/server-sdk";
import {FlagdProvider} from "@openfeature/flagd-provider";

describe("In-process-service", () => {


  beforeAll(() => {
    OpenFeature.setProviderAndWait(new FlagdProvider({resolverType: 'in-process', port: 9090}));
  })


  it('should work', ()=> {
    expect(true).toBeTruthy()


  });
})
