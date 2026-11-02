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

| Option name           | Type    | Default | Description                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mode                  | string  | `ws`    | The connection mode to be used. Possible values are: `ws` and `sse`. Default to `ws` if omitted.                                                                                                                                                                                                                                                                                   |
| endpoint              | string  |         | The URL where your GO Feature Flag server is located.                                                                                                                                                                                                                                                                                                                              |
| apiTimeout            | number  | 10000   | (optional) The maximum time, in milliseconds, to wait for a response from the server. Non-positive values cause the default timeout to be used.                                                                                                                                                                                                                                    |
| apiKey                | string  |         | (optional) If GO Feature Flag is configured to authenticate the requests, you should provide an API Key to the provider. Please ask the administrator of the relay proxy to provide an API Key.                                                                                                                                                                                    |
| customHeaders         | object  |         | (optional) Custom headers to be sent for every HTTP request.                                                                                                                                                                                                                                                                                                                       |
| retryInitialDelay     | number  | 100     | (optional) The initial delay in millisecond to wait before retrying to connect the WebSocket or SSE                                                                                                                                                                                                                                                                                |
| retryDelayMultiplier  | number  | 2       | (optional) multiplier of retryInitialDelay after each failure _(example: 1st connection retry will be after 100ms, second after 200ms, third after 400ms, etc.)_                                                                                                                                                                                                                   |
| maxRetries            | number  | 10      | (optional) The maximum number of retries before considering the WebSocket or SSE unreachable                                                                                                                                                                                                                                                                                       |
| dataFlushInterval     | number  | 60000   | (optional) The interval, in milliseconds, at which the server is polled to retrieve data. This parameter applies only when caching is enabled; otherwise, data is retrieved directly when the evaluation API is called.                                                                                                                                                            |
| disableDataCollection | boolean | `false` | (optional) When set to `true`, data usage is not collected for flags retrieved from the cache.                                                                                                                                                                                                                                                                                     |
| exporterMetadata      | object  |         | (optional) The exporter metadata is a set of key-value pairs that will be added to the metadata when calling the exporter API. All this information will be added to the events produced by the exporter.<br/><br/>‼️**Important**: If you are using a GO Feature Flag relay proxy before version v1.41.0, the information of this field will not be added to your feature events. |
| pollingIntervalMs     | number  | 0       | (optional) The interval, in milliseconds, between polling attempts to the GO Feature Flag evaluation endpoint. Polling is used as a fallback when the provider cannot connect to receive flag changes through WebSocket or SSE. Defaults to `0`, which disables fallback polling.                                                                                                  |

### Reconnection

If the WebSocket or SSE connection to the GO Feature Flag instance fails, the provider will attempt to reconnect with an exponential back-off.  
The `maxRetries` can be specified to customize reconnect behavior.

#### Polling as a fallback

If the WebSocket or SSE connection is not restored after `maxRetries` and `pollingIntervalMs` is a positive number, the provider will fallback to polling against GO Feature Flag instance. Polling will continue until the end of the session.

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
