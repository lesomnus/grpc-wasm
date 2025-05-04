//go:build js && wasm

package grpcwasm_test

import (
	"context"
	"fmt"
	"sync"
	"syscall/js"
	"testing"

	grpcwasm "github.com/lesomnus/grpc-wasm"
	"github.com/lesomnus/grpc-wasm/internal/echo"
	"github.com/lesomnus/grpc-wasm/internal/jz"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func protoMarshal[T proto.Message](v T) (js.Value, error) {
	data, err := proto.Marshal(v)
	if err != nil {
		return js.Undefined(), fmt.Errorf("marshal: %w", err)
	}

	buf := js.Global().Get("Uint8Array").New(len(data))
	js.CopyBytesToJS(buf, data)

	return buf, nil
}

func protoUnmarshal[T proto.Message](v js.Value, m T) error {
	data := make([]byte, v.Length())
	js.CopyBytesToGo(data, v)

	return proto.Unmarshal(data, m)
}

func jsInvoke[T proto.Message](x *require.Assertions, conn *grpcwasm.Conn, method string, m T, opt map[string]any) (js.Value, js.Value) {
	in, err := protoMarshal(m)
	x.NoError(err)

	if opt == nil {
		opt = map[string]any{}
	}
	p := conn.JsInvoke(js.Undefined(), []js.Value{js.ValueOf(method), in, js.ValueOf(opt)}).(js.Value)
	return jz.Await(p)
}

func TestConn(t *testing.T) {
	t.Run("unary", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		req := echo.EchoRequest{}
		req.SetMessage("Lebowski")
		req.SetCircularShift(3)
		req.SetDateCreated(timestamppb.Now())

		v, err_js := jsInvoke(x, conn, string(echo.EchoService_Once_FullMethodName), &req, nil)
		x.True(err_js.IsUndefined())
		x.Equal(js.TypeObject, v.Type())

		res := echo.EchoResponse{}
		err := protoUnmarshal(v.Get("response"), &res)
		x.NoError(err)
		x.Equal("skiLebow", res.GetMessage())
		x.Less(req.GetDateCreated().AsTime(), res.GetDateCreated().AsTime())
	}))
	t.Run("unary with error", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		req := echo.EchoRequest{}
		req.SetStatus(echo.Status_builder{
			Code:    int32(codes.FailedPrecondition),
			Message: "Is this your homework, Larry?",
		}.Build())

		v, js_err := jsInvoke(x, conn, echo.EchoService_Once_FullMethodName, &req, nil)
		x.True(js_err.IsUndefined())
		x.Equal(js.TypeObject, v.Type())
		x.Equal(int(codes.FailedPrecondition), v.Get("status").Get("code").Int())
		x.Equal("Is this your homework, Larry?", v.Get("status").Get("message").String())
	}))
	t.Run("unary with metadata", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		req := echo.EchoRequest{}

		v, js_err := jsInvoke(x, conn, echo.EchoService_Once_FullMethodName, &req, map[string]any{
			"meta": js.ValueOf(map[string]any{
				"foo": []any{"bar"},
			}),
		})
		x.True(js_err.IsUndefined())
		x.Equal(js.TypeObject, v.Type())
		x.Equal("bar", v.Get("header").Get("foo").Index(0).String())
		x.Equal("header", v.Get("header").Get("timing").Index(0).String())
		x.Equal("bar", v.Get("trailer").Get("foo").Index(0).String())
		x.Equal("trailer", v.Get("trailer").Get("timing").Index(0).String())
	}))
	t.Run("unary with error and metadata", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		req := echo.EchoRequest{}
		req.SetStatus(echo.Status_builder{
			Code:    int32(codes.FailedPrecondition),
			Message: "Is this your homework, Larry?",
		}.Build())

		v, js_err := jsInvoke(x, conn, echo.EchoService_Once_FullMethodName, &req, map[string]any{
			"meta": js.ValueOf(map[string]any{
				"foo": []any{"bar"},
			}),
		})
		x.True(js_err.IsUndefined())
		x.Equal(js.TypeObject, v.Type())
		x.Equal(int(codes.FailedPrecondition), v.Get("status").Get("code").Int())
		x.Equal("Is this your homework, Larry?", v.Get("status").Get("message").String())
		x.Equal("bar", v.Get("header").Get("foo").Index(0).String())
		x.Equal("header", v.Get("header").Get("timing").Index(0).String())
		x.Equal("bar", v.Get("trailer").Get("foo").Index(0).String())
		x.Equal("trailer", v.Get("trailer").Get("timing").Index(0).String())
	}))
}

func withConn(f func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn)) func(t *testing.T) {
	return func(t *testing.T) {
		t.Helper()

		x := require.New(t)

		l := grpcwasm.NewListener()
		defer l.Close()

		conn, err := l.Dial()
		x.NoError(err)
		defer conn.Close()

		s := grpc.NewServer()
		echo.RegisterEchoServiceServer(s, echo.EchoServer{})

		var wg sync.WaitGroup
		wg.Add(1)
		go func() {
			defer wg.Done()
			s.Serve(l)
		}()

		f(t.Context(), x, conn)

		conn.Close()
		l.Close()
		wg.Wait()
	}
}
