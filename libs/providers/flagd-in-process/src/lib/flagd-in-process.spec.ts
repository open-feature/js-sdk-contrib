import { flagdInProcess } from './flagd-in-process';

describe('flagdInProcess', () => {
  it('should work', () => {
    expect(flagdInProcess()).toEqual('flagd-in-process');
  });
});
