// Keep compatibility with proto message google.rpc.Status.
// See: https://github.com/grpc/grpc/blob/5201f9c38ac135cc0112a99bf737689c429bd476/src/proto/grpc/status/status.proto
export type RpcStatus = {
	code: number;
	message: string;
};

export type Metadata = {
	[key: string]: string[] | undefined;
};

export type CallOption = {
	meta?: Metadata;
};

export type RpcResult = {
	header: Metadata;
	trailer: Metadata;
	response: Uint8Array;
	status: RpcStatus;
};

export type StreamDataResult = {
	done: false;
	response: Uint8Array;
};
export type StreamFinalResult = {
	done: true;
	status: RpcStatus;
	trailer: Metadata;
};

export type StreamResult = StreamDataResult | StreamFinalResult;
