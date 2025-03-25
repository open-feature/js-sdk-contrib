# AWS SSM Provider

## What is AWS SSM?
AWS Systems Manager (SSM) is a service provided by Amazon Web Services (AWS) that enables users to manage and automate operational tasks across their AWS infrastructure. One of its key components is AWS Systems Manager Parameter Store, which allows users to store, retrieve, and manage configuration data and secrets securely.
SSM Parameter Store can be used to manage application configuration settings, database connection strings, API keys, and other sensitive information. It provides integration with AWS Identity and Access Management (IAM) to control access and encryption through AWS Key Management Service (KMS).
The aws-ssm provider for OpenFeature allows applications to fetch feature flag configurations from AWS SSM Parameter Store, enabling centralized and dynamic configuration management.

## Installation

```
$ npm install @openfeature/aws-ssm-provider
```

## Set AWS Provider

```
OpenFeature.setProvider(
  new AwsSsmProvider({
    ssmClientConfig: {
      region: 'eu-west-1', // Change this to your desired AWS region
      // You can setup your aws credentials here or it will be automatically retrieved from env vars
      // See https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html
    },
    // Use an LRUCache for improve performance and optimize AWS SDK Calls to SSM (cost awareness)
    cacheOpts: {
      enabled: true, // Enable caching
      size: 1, // Cache size
      ttl: 10, // Time-to-live in seconds
    },
  })
);
```

# AWS SSM Provider Configuration

## AwsSsmProviderConfig

| Property         | Type               | Description                                  | Default |
|-----------------|--------------------|----------------------------------------------|---------|
| `ssmClientConfig` | `SSMClientConfig` | AWS SSM Client configuration options.       | See [here](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm/)    |
| `enableDecryption`      | `boolean`   | Enable decryption for SecureString parameters      | false |
| `cacheOpts`      | `LRUCacheConfig`   | Configuration for the local LRU cache.      | See below |

## LRUCacheConfig

| Property  | Type    | Description                                    | Default |
|-----------|--------|------------------------------------------------|---------|
| `enabled` | `boolean` | Whether caching is enabled.                 | `true`  |
| `ttl`     | `number`  | Time-to-live (TTL) for cached items (in ms). | `300000` (5 minutes) |
| `size`    | `number`  | Maximum number of items in the cache.       | `1000`  |


## Retrieve Feature Flag!

Create a new SSM Param called 'my-feature-flag' in your AWS Account and then retrieve it via OpenFeature Client!

```
const featureFlags = OpenFeature.getClient();
const flagValue = await featureFlags.getBooleanValue('my-feature-flag', false);
console.log(`Feature flag value: ${flagValue}`);
```
