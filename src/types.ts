export type RpcError = {
	code: number;
	message: string;
};

export type RpcResult = {
	header: Metadata;
	trailer: Metadata;
	response: Uint8Array;
};

export type Metadata = {
	[key: string]: string[] | undefined;
};

export type CallOption = {
	meta?: Metadata;
};
