import { credentials } from '@grpc/grpc-js';
import type { ClientReadableStream } from '@grpc/grpc-js';
import { readFileSync, existsSync } from 'node:fs';

export const closeStreamIfDefined = (stream: ClientReadableStream<unknown> | undefined) => {
  /**
   * cancel() is necessary to prevent calls from hanging the process, so we need to we need to remove all the
   * handlers, and add a no-op for 'error' so we can cancel without bubbling up an exception
   */
  if (stream) {
    stream.removeAllListeners();
    stream.on('error', () => {
      // swallow errors after closed
    });
    stream.cancel();
    stream.destroy();
  }
};

/**
 * Creates gRPC channel credentials based on TLS and certificate path configuration.
 * @returns Channel credentials for gRPC connection
 */
export const createChannelCredentials = (tls: boolean, certPath?: string) => {
  if (!tls) {
    return credentials.createInsecure();
  }
  if (certPath && existsSync(certPath)) {
    const rootCerts = readFileSync(certPath);
    return credentials.createSsl(rootCerts);
  }
  return credentials.createSsl();
};
