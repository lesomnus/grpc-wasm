//go:build js && wasm

package grpcwasm

import (
	"context"
	"errors"
	"io"
	"syscall/js"

	"github.com/lesomnus/grpc-wasm/internal/jz"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type Stream struct {
	grpc.ClientStream

	scope *jz.Scope

	ctx    context.Context
	cancel context.CancelFunc
}

func NewStream(ctx context.Context, conn *Conn, desc *grpc.StreamDesc, method string, opts ...grpc.CallOption) (*Stream, error) {
	ctx, cancel := context.WithCancel(ctx)
	opts = append(opts, grpc.OnFinish(func(err error) {
		cancel()
	}))

	s, err := conn.NewStream(ctx, desc, method, opts...)
	if err != nil {
		return nil, err
	}

	return &Stream{
		ClientStream: s,

		scope: conn.scope,

		ctx:    ctx,
		cancel: cancel,
	}, nil
}

// Signature:
//
//	type Metadata = {
//		[k: string]: string[]
//	}
//	function(): Promise<Metadata>
func (s *Stream) JsHeader(this js.Value, args []js.Value) any {
	return s.scope.Promise(func() (js.Value, js.Value) {
		md, err := s.Header()
		if err != nil {
			return js.Undefined(), jz.ToError(err)
		}
		if md == nil {
			// the stream was terminated without header.
			// TODO: reject?
			md = metadata.MD{}
		}
		return metaToJs(md), js.Undefined()
	})
}

// Signature:
//
//	type Metadata = {
//		[k: string]: string[]
//	}
//	type Status = {
//		code: number
//		message: string
//	}
//	type StreamResult =
//		| {
//			done: false
//			response: Uint8Array
//		}
//		| {
//			done: true
//			trailer: Metadata
//			status: Status
//		}
//	function(): Promise<StreamResult>
func (s *Stream) JsRecv(this js.Value, args []js.Value) any {
	return s.scope.Promise(func() (js.Value, js.Value) {
		data := []byte{}
		err := s.RecvMsg(&data)
		if err == nil {
			return js.ValueOf(map[string]any{
				"done":     js.ValueOf(false),
				"response": jz.BytesToJs(data),
			}), js.Undefined()
		}

		st := status.Status{}
		eof := errors.Is(err, io.EOF)
		if !eof {
			s, ok := status.FromError(err)
			if !ok {
				return js.Undefined(), js.ValueOf(err.Error())
			}

			st = *s
		}

		md := s.Trailer()
		return js.ValueOf(map[string]any{
			"done":    js.ValueOf(true),
			"trailer": metaToJs(md),
			"status":  statusToJs(&st),
		}), js.Undefined()
	})
}

// Signature:
//
//	function(req: Uint8Array): Promise<void>
func (s *Stream) JsSend(this js.Value, args []js.Value) any {
	return s.scope.Promise(func() (js.Value, js.Value) {
		req := args[0]
		data := jz.BytesToGo(req)
		if err := s.SendMsg(data); err != nil {
			return js.Undefined(), jz.ToError(err)
		}
		return js.Undefined(), js.Undefined()
	})
}

// Signature:
//
//	function(): Promise<void>
func (s *Stream) JsCloseSend(this js.Value, args []js.Value) any {
	if err := s.CloseSend(); err != nil {
		return jz.Reject(jz.ToError(err))
	}
	return jz.Resolve(js.Undefined())
}

// Signature:
//
//	function(): Promise<void>
func (s *Stream) JsClose(this js.Value, args []js.Value) any {
	s.cancel()
	return jz.Resolve(js.Undefined())
}

func (s *Stream) ToJs() js.Value {
	return js.ValueOf(map[string]any{
		"header":     js.FuncOf(s.JsHeader),
		"recv":       js.FuncOf(s.JsRecv),
		"send":       js.FuncOf(s.JsSend),
		"close_send": js.FuncOf(s.JsCloseSend),
		"close":      js.FuncOf(s.JsClose),
	})
}
