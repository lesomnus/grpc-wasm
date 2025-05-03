//go:build js && wasm

package grpcwasm

import (
	"context"
	"fmt"
	"net"
	"syscall/js"

	"github.com/lesomnus/grpc-wasm/internal/jz"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"
)

type Listener struct {
	*bufconn.Listener

	scope *jz.Scope
	ctx   context.Context
}

func NewListener(opts ...ListenOption) *Listener {
	l := &Listener{
		scope: jz.NewScope(),
		ctx:   context.Background(),
	}
	for _, opt := range opts {
		opt(l)
	}
	if l.Listener == nil {
		// Default buffer size 1MB
		l.Listener = bufconn.Listen(1 << 20)
	}

	return l
}

func Listen(opts ...ListenOption) (*Listener, error) {
	v := js.Global().Get("grpc_wasm")
	if v.IsUndefined() {
		return nil, fmt.Errorf("globalThis.grpc_wasm was undefined")
	}
	if v.Type() != js.TypeObject {
		return nil, fmt.Errorf("expected globalThis.grpc_wasm to be an Object, got %s", v.Type())
	}

	resolve := v.Get("resolve")
	if resolve.Type() != js.TypeFunction {
		return nil, fmt.Errorf("expected globalThis.grpc_wasm.resolve to be a function, got %s", v.Type())
	}

	reject := v.Get("reject")
	if reject.Type() != js.TypeFunction {
		return nil, fmt.Errorf("expected globalThis.grpc_wasm.resolve to be a function, got %s", v.Type())
	}

	_ = reject

	l := NewListener(opts...)
	resolve.Invoke(l.ToJsValue())

	return l, nil
}

func (l *Listener) Addr() net.Addr {
	return addr{}
}

func (l *Listener) Wait() {
	l.scope.Wait()
}

// Signature:
//
//	function();
func (l *Listener) JsClose(this js.Value, args []js.Value) any {
	l.Close()
	return nil
}

func (l *Listener) Dial() (*Conn, error) {
	opts := []grpc.DialOption{
		grpc.WithDefaultCallOptions(grpc.ForceCodec(NoopCodec{})),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithContextDialer(func(ctx context.Context, s string) (net.Conn, error) {
			return l.DialContext(ctx)
		}),
	}

	conn, err := grpc.NewClient("passthrough://bufnet", opts...)
	if err != nil {
		return nil, err
	}

	return &Conn{
		ClientConn: conn,

		scope: l.scope,
		ctx:   l.ctx,
	}, nil
}

// Signature:
//
//	function(): Promise<Conn>;
func (l *Listener) JsDial(this js.Value, args []js.Value) any {
	conn, err := l.Dial()
	if err != nil {
		return jz.Reject(jz.ToError(err))
	}

	return jz.Resolve(conn.ToJsValue())
}

func (l *Listener) ToJsValue() js.Value {
	return js.ValueOf(map[string]any{
		"close": l.scope.FuncOf(l.JsClose),
		"dial":  l.scope.FuncOf(l.JsDial),
	})
}

type ListenOption func(l *Listener)

func WithBufferSize(size int) ListenOption {
	return func(l *Listener) {
		l.Listener = bufconn.Listen(size)
	}
}

type addr struct{}

func (addr) Network() string { return "grpcwasm" }
func (addr) String() string  { return "grpcwasm" }
