import { OpenFeature } from '@openfeature/server-sdk';

const tearDownTests = async () => {
  console.log('Shutting down OpenFeature...');
  await OpenFeature.close();
};

export default tearDownTests;
