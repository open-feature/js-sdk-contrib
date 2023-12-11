import { ClientReadableStream } from "@grpc/grpc-js";

export const closeStreamIfDefined = (stream:  ClientReadableStream<unknown> | undefined) => {
    stream?.removeAllListeners();
    stream?.on('error', () => {
      // no-op, but we need a handler here to avoid a throw
    });
    stream?.cancel();
    stream?.destroy();
}