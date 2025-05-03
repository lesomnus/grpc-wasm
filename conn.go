//go:build js && wasm

package grpcwasm

import (
	"context"
	"encoding/json"
	"syscall/js"

	"github.com/lesomnus/grpc-wasm/internal/jz"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
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

// Signature:
//
//	type Metadata = {
//		[key: string]: string[] | undefined
//	};
//	type type RpcResult = {
//		header: JSON<Metadata>
//		trailer: JSON<Metadata>
//		response: Uint8Array
//	};
//	function(method: string, req: Uint8Array, option: {meta?: JSON<Metadata>}): Promise<RpcResult>;
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

		meta := metadata.MD{}
		if v := opt.Get("meta"); v.Type() == js.TypeString {
			if err := json.Unmarshal([]byte(v.String()), &meta); err != nil {
				return js.Undefined(), jz.ErrorF("unmarshal option.meta: %v", err)
			}
		}

		ctx := c.ctx
		if meta.Len() > 0 {
			ctx = metadata.NewOutgoingContext(ctx, meta)
		}

		header := metadata.MD{}
		trailer := metadata.MD{}
		opts := []grpc.CallOption{
			grpc.Header(&header),
			grpc.Trailer(&trailer),
		}

		var out []byte
		if err := c.ClientConn.Invoke(ctx, method, data, &out, opts...); err != nil {
			return js.Undefined(), jz.StatusE(err)
		}

		js_out := js.Global().Get("Uint8Array").New(len(out))
		js.CopyBytesToJS(js_out, out)

		header_str := "{}"
		trailer_str := "{}"
		if len(header) > 0 {
			b, err := json.Marshal(header)
			if err != nil {
				return js.Undefined(), jz.ErrorF("marshal header into JSON: %v", err)
			}
			header_str = string(b)
		}
		if len(trailer) > 0 {
			b, err := json.Marshal(trailer)
			if err != nil {
				return js.Undefined(), jz.ErrorF("marshal trailer into JSON: %v", err)
			}
			trailer_str = string(b)
		}

		return js.ValueOf(map[string]any{
			"header":   js.ValueOf(header_str),
			"trailer":  js.ValueOf(trailer_str),
			"response": js_out,
		}), js.Undefined()
	})
}

func (c Conn) ToJsValue() js.Value {
	return js.ValueOf(map[string]any{
		"close":  c.scope.FuncOf(c.JsClose),
		"invoke": c.scope.FuncOf(c.JsInvoke),
	})
}
