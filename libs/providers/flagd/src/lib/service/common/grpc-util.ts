import { ClientReadableStream } from '@grpc/grpc-js';

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
