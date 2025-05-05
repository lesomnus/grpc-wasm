//go:build js && wasm

package grpcwasm

import (
	"context"
	"syscall/js"

	"github.com/lesomnus/grpc-wasm/internal/jz"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type Conn struct {
	*grpc.ClientConn

	scope *jz.Scope
	ctx   context.Context
}

func (c *Conn) JsClose(this js.Value, args []js.Value) any {
	return c.scope.Promise(func() (js.Value, js.Value) {
		err := c.Close()
		if err != nil {
			return js.Undefined(), jz.ToError(err)
		}

		return js.Undefined(), js.Undefined()
	})
}

// JsInvoke send serialized data to the server with given method.
// It is resolved even if server responded with status.Code > 0 and "response" will be empty.
//
// Signature:
//
//	type Metadata = {
//		[key: string]: string[] | undefined
//	};
//	type RpcStatus = {
//		code: number
//		message: string
//	}
//	type RpcResult {
//		header: Metadata
//		trailer: Metadata
//		response: Uint8Array
//		status: RpcStatus
//	};
//	function(method: string, req: Uint8Array, option: {meta?: Metadata}): Promise<RpcResult>;
func (c *Conn) JsInvoke(this js.Value, args []js.Value) any {
	return c.scope.Promise(func() (js.Value, js.Value) {
		if len(args) != 3 {
			return js.Undefined(), jz.Error("expects 3 arguments: method, serialized message, and option")
		}

		method := args[0].String()
		req := args[1]
		opt := args[2]

		size := req.Get("byteLength").Int()
		data := make([]byte, size)
		js.CopyBytesToGo(data, req)

		ctx := c.ctx

		meta := metadata.MD{}
		if v := opt.Get("meta"); v.Type() == js.TypeObject {
			metaToGo(meta, v)
		}
		if meta.Len() > 0 {
			ctx = metadata.NewOutgoingContext(ctx, meta)
		}

		header := metadata.MD{}
		trailer := metadata.MD{}
		opts := []grpc.CallOption{
			grpc.Header(&header),
			grpc.Trailer(&trailer),
		}

		var (
			out []byte
			st  status.Status
		)
		if err := c.ClientConn.Invoke(ctx, method, data, &out, opts...); err != nil {
			s, ok := status.FromError(err)
			if !ok {
				return js.Undefined(), jz.ToError(err)
			}
			if s != nil {
				st = *s
			}
		}

		js_out := js.Global().Get("Uint8Array").New(len(out))
		js.CopyBytesToJS(js_out, out)

		return js.ValueOf(map[string]any{
			"header":   metaToJs(header),
			"trailer":  metaToJs(trailer),
			"response": js_out,
			"status":   statusToJs(&st),
		}), js.Undefined()
	})
}

// Signature:
//
//	type StreamResult =
//		| {
//			response: Uint8Array;
//		}
//		| {
//			trailer: Metadata;
//			status: RpcStatus;
//		};
//	type Stream = {
//		header: ()=>Promise<Metadata>
//		close: ()=>Promise<void>
//		close_send: ()=>Promise<void>
//		send: (Uint8Array)=>Promise<void>
//		recv: ()=>Promise<StreamResult>
//	}
//	function(method: string, option: {meta?: Metadata}): Promise<Stream>;
func (c *Conn) jsOpenStream(desc *grpc.StreamDesc, _ js.Value, args []js.Value) any {
	return c.scope.Promise(func() (js.Value, js.Value) {
		if len(args) != 2 {
			return js.Undefined(), jz.Error("expects 2 arguments: method, and option")
		}

		method := args[0].String()
		opt := args[1]

		ctx := c.ctx
		meta := metadata.MD{}
		if v := opt.Get("meta"); v.Type() == js.TypeObject {
			metaToGo(meta, v)
		}
		if meta.Len() > 0 {
			ctx = metadata.NewOutgoingContext(ctx, meta)
		}

		stream, err := NewStream(ctx, c, desc, method)
		if err != nil {
			return js.Undefined(), jz.ToError(err)
		}

		return stream.ToJs(), js.Undefined()
	})
}

func (c *Conn) JsOpenServerStream(this js.Value, args []js.Value) any {
	return c.jsOpenStream(&grpc.StreamDesc{ServerStreams: true}, this, args)
}

func (c *Conn) JsOpenClientStream(this js.Value, args []js.Value) any {
	return c.jsOpenStream(&grpc.StreamDesc{ClientStreams: true}, this, args)
}

func (c *Conn) JsOpenBidiStream(this js.Value, args []js.Value) any {
	return c.jsOpenStream(&grpc.StreamDesc{ServerStreams: true, ClientStreams: true}, this, args)
}

func (c Conn) ToJs() js.Value {
	return js.ValueOf(map[string]any{
		"close":  c.scope.FuncOf(c.JsClose),
		"invoke": c.scope.FuncOf(c.JsInvoke),

		"open_server_stream": c.scope.FuncOf(c.JsOpenServerStream),
		"open_client_stream": c.scope.FuncOf(c.JsOpenClientStream),
		"open_bidi_stream":   c.scope.FuncOf(c.JsOpenBidiStream),
	})
}
