# go-feature-flag-web Provider for OpenFeature

## About this provider

[GO Feature Flag](https://gofeatureflag.org) provider allows you to connect to your GO Feature Flag instance with the `@openfeature/web-sdk`.

The main difference between this provider and [`@openfeature/go-feature-flag-provider`](https://www.npmjs.com/package/@openfeature/go-feature-flag-provider) is that it uses a **static evaluation context**.  
This provider is more sustainable for client-side implementation.

If you want to know more about this pattern, I encourage you to read this [blog post](https://openfeature.dev/blog/catering-to-the-client-side/).

## What is GO Feature Flag?

GO Feature Flag is a simple, complete and lightweight self-hosted feature flag solution 100% Open Source.  
Our focus is to avoid any complex infrastructure work to use GO Feature Flag.

This is a complete feature flagging solution with the possibility to target only a group of users, use any types of flags, store your configuration in various location and advanced rollout functionality. You can also collect usage data of your flags and be notified of configuration changes.

## Install the provider

```shell
npm install @openfeature/go-feature-flag-web-provider @openfeature/web-sdk
```

## How to use the provider?

```typescript
const evaluationCtx: EvaluationContext = {
  targetingKey: 'user-key',
  email: 'john.doe@gofeatureflag.org',
  name: 'John Doe',
};

const goFeatureFlagWebProvider = new GoFeatureFlagWebProvider({
  endpoint: endpoint,
  customHeadeers: {
    'User-Agent': "my-app/1.0.0",
  },
  // ...
}, logger);

await OpenFeature.setContext(evaluationCtx); // Set the static context for OpenFeature
OpenFeature.setProvider(goFeatureFlagWebProvider); // Attach the provider to OpenFeature
const client = await OpenFeature.getClient();

// You can now use the client to use your flags
if(client.getBooleanValue('my-new-feature', false)){
    //...
}

// You can add handlers to know what happen in the provider
client.addHandler(ProviderEvents.Ready, () => { ... });
client.addHandler(ProviderEvents.Error, () => { //... });
client.addHandler(ProviderEvents.Stale, () => { //... });
client.addHandler(ProviderEvents.ConfigurationChanged, () => { //... });
```

### Available options

| Option name           | Type    | Default        | Description                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | ------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| endpoint              | string  |                | endpoint is the URL where your GO Feature Flag server is located.                                                                                                                                                                                                                                                                                                       |
| apiTimeout            | number  | 0 = no timeout | (optional) timeout is the time in millisecond we wait for an answer from the server.                                                                                                                                                                                                                                                                                    |
| apiKey                | string  |                | (optional) If GO Feature Flag is configured to authenticate the requests, you should provide an API Key to the provider. Please ask the administrator of the relay proxy to provide an API Key.                                                                                                                                                                         |
| customHeaders         | object  |                | (optional) custom headers to be sent for every HTTP request.                                                                                                                                                                                                                                                                                                            |
| retryInitialDelay     | number  | 100            | (optional) initial delay in millisecond to wait before retrying to connect the websocket or SSE                                                                                                                                                                                                                                                                         |
| retryDelayMultiplier  | number  | 2              | (optional) multiplier of retryInitialDelay after each failure _(example: 1st connection retry will be after 100ms, second after 200ms, third after 400ms ...)_                                                                                                                                                                                                          |
| maxRetries            | number  | 10             | (optional) maximum number of retries before considering the websocket or SSE unreachable                                                                                                                                                                                                                                                                                |
| dataFlushInterval     | number  | 60000          | (optional) interval time (in millisecond) we use to call the relay proxy to collect data. The parameter is used only if the cache is enabled, otherwise the collection of the data is done directly when calling the evaluation API.                                                                                                                                    |
| disableDataCollection | boolean | false          | (optional) set to true if you don't want to collect the usage of flags retrieved in the cache.                                                                                                                                                                                                                                                                          |
| exporterMetadata      | object  |                | (optional) exporter metadata is a set of key-value that will be added to the metadata when calling the exporter API. All those information will be added to the event produce by the exporter.<br/><br/>‼️**Important**: If you are using a GO Feature Flag relay proxy before version v1.41.0, the information of this field will not be added to your feature events. |
|                       |         |                |                                                                                                                                                                                                                                                                                                                                                                         |

### Reconnection

If the connection to the GO Feature Flag instance fails, the provider will attempt to reconnect with an exponential back-off.  
The `maxRetries` can be specified to customize reconnect behavior.

### Event streaming

The `GoFeatureFlagWebProvider` receives events from GO Feature Flag with changes.
Combined with the event API in the web SDK, this allows for subscription to flag value changes in clients.

```typescript
client.addHandler(ProviderEvents.ConfigurationChanged, (ctx: EventDetails) => {
  // do something when the configuration has changed.
  // ctx.flagsChanged contains the list of changed flags.
});
```

## Contribute

### Building

Run `nx package providers-go-feature-flag-web` to build the library.

### Running unit tests

Run `nx test providers-go-feature-flag-web` to execute the unit tests via [Jest](https://jestjs.io).
