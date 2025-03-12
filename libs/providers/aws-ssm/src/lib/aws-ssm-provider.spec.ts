import { AwsSsmProvider } from './aws-ssm-provider';

describe(AwsSsmProvider.name, () => {
  it('should be and instance of AwsSsmProvider', () => {
    expect(new AwsSsmProvider()).toBeInstanceOf(AwsSsmProvider);
  });
});
