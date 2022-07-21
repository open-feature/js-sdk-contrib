import * as grpc from '@grpc/grpc-js';
import {ServiceClient} from '../../../proto/ts/schema/v1/schema.client'
import { GrpcTransport } from "@protobuf-ts/grpc-transport";

export default class GRPCClient extends ServiceClient {
    constructor(host?: string, port?: number, channelCredentials?: grpc.ChannelCredentials) {
        if (host == undefined) {
            host = "localhost"
        }
        if (port == undefined) {
            port = 8080
        }
        if (channelCredentials == undefined) {
            channelCredentials = grpc.credentials.createInsecure()
        }
        super(new GrpcTransport({
            host: `${host}:${port}`,
            channelCredentials
        }))
    }
}