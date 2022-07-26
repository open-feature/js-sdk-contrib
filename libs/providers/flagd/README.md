# NodeJS flagd Provider for OpenFeature

![Experimental](https://img.shields.io/badge/experimental-breaking%20changes%20allowed-yellow)

## Installation

```
$ npm install @openfeature/flagd-provider
```

## Building

Run `nx package providers-flagd` to build the library.

## Running unit tests

Run `nx test providers-flagd` to execute the unit tests via [Jest](https://jestjs.io).


## Usage  

The `FlagdProvider` client constructor takes a single optional argument with 3 fields, their default values correspond to the default arguments supplied to the flagd server:  
```
  OpenFeature.setProvider(new FlagdProvider({
      service: 'grpc', 
      host: 'localhost',
      port: 8080,
  }))
```
**service**: "http" | "grpc" *(defaults to http)*   
**host**: string *(defaults to "localhost")*    
**port**: number *(defaults to 8080)*    
