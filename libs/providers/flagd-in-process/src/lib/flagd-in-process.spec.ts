import { FlagdInProcess } from './flagd-in-process';

describe('flagdInProcess', () => {
  it('should work', () => {
    expect(new FlagdInProcess().metadata.name).toEqual('flagd in-process provider');
  });
});
