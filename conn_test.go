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
)

func protoMarshal[T proto.Message](v T) (js.Value, error) {
	data, err := proto.Marshal(v)
	if err != nil {
		return js.Undefined(), fmt.Errorf("marshal: %w", err)
	}

	return jz.BytesToJs(data), nil
}

func protoUnmarshal[T proto.Message](v js.Value, m T) error {
	data := jz.BytesToGo(v)
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

func TestConn_JsInvoke(t *testing.T) {
	t.Run("ok", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		req := echo.EchoRequest{}
		req.SetMessage("Lebowski")
		req.SetCircularShift(3)

		v, err_js := jsInvoke(x, conn, string(echo.EchoService_Once_FullMethodName), &req, nil)
		x.True(err_js.IsUndefined())
		x.Equal(js.TypeObject, v.Type())

		res := echo.EchoResponse{}
		err := protoUnmarshal(v.Get("response"), &res)
		x.NoError(err)
		x.Equal("skiLebow", res.GetMessage())
	}))
	t.Run("error", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		req := echo.EchoRequest{}
		req.SetStatus(echo.Status_builder{
			Code:    int32(codes.FailedPrecondition),
			Message: "Is this your homework, Larry?",
		}.Build())

		v, err_js := jsInvoke(x, conn, echo.EchoService_Once_FullMethodName, &req, nil)
		x.True(err_js.IsUndefined())
		x.Equal(js.TypeObject, v.Type())
		x.Equal(int(codes.FailedPrecondition), v.Get("status").Get("code").Int())
		x.Equal("Is this your homework, Larry?", v.Get("status").Get("message").String())
	}))
	t.Run("with metadata", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		req := echo.EchoRequest{}

		v, err_js := jsInvoke(x, conn, echo.EchoService_Once_FullMethodName, &req, map[string]any{
			"meta": js.ValueOf(map[string]any{
				"foo": []any{"bar"},
			}),
		})
		x.True(err_js.IsUndefined())
		x.Equal(js.TypeObject, v.Type())
		x.Equal("bar", v.Get("header").Get("foo").Index(0).String())
		x.Equal("header", v.Get("header").Get("timing").Index(0).String())
		x.Equal("bar", v.Get("trailer").Get("foo").Index(0).String())
		x.Equal("trailer", v.Get("trailer").Get("timing").Index(0).String())
	}))
	t.Run("error and with metadata", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		req := echo.EchoRequest{}
		req.SetStatus(echo.Status_builder{
			Code:    int32(codes.FailedPrecondition),
			Message: "Is this your homework, Larry?",
		}.Build())

		v, err_js := jsInvoke(x, conn, echo.EchoService_Once_FullMethodName, &req, map[string]any{
			"meta": js.ValueOf(map[string]any{
				"foo": []any{"bar"},
			}),
		})
		x.True(err_js.IsUndefined())
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
