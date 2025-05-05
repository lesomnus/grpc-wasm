//go:build js && wasm

package grpcwasm_test

import (
	"context"
	"syscall/js"
	"testing"
	"time"

	grpcwasm "github.com/lesomnus/grpc-wasm"
	"github.com/lesomnus/grpc-wasm/internal/echo"
	"github.com/lesomnus/grpc-wasm/internal/jz"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
)

func TestConn_JsBidiStream(t *testing.T) {
	t.Run("close", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		// Client closes the stream without sync.
		stream, err_js := jz.Await(conn.JsOpenBidiStream(js.Undefined(), []js.Value{
			js.ValueOf(echo.EchoService_Live_FullMethodName),
			js.ValueOf(map[string]any{}),
		}).(js.Value))
		x.True(err_js.IsUndefined())

		_, err_js = jz.Await(stream.Call("close"))
		x.True(err_js.IsUndefined())

		v, err_js := jz.Await(stream.Call("recv"))
		x.True(err_js.IsUndefined())
		x.Equal(int(codes.Canceled), v.Get("status").Get("code").Int())
	}))
	t.Run("recv and close", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		stream, err_js := jz.Await(conn.JsOpenBidiStream(js.Undefined(), []js.Value{
			js.ValueOf(echo.EchoService_Live_FullMethodName),
			js.ValueOf(map[string]any{}),
		}).(js.Value))
		x.True(err_js.IsUndefined())

		p := stream.Call("recv")
		time.Sleep(10 * time.Millisecond)

		_, err_js = jz.Await(stream.Call("close"))
		x.True(err_js.IsUndefined())

		v, err_js := jz.Await(p)
		x.True(err_js.IsUndefined())
		x.Equal(int(codes.Canceled), v.Get("status").Get("code").Int())
	}))
	t.Run("close send", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		// Graceful close on both side.
		stream, err_js := jz.Await(conn.JsOpenBidiStream(js.Undefined(), []js.Value{
			js.ValueOf(echo.EchoService_Live_FullMethodName),
			js.ValueOf(map[string]any{}),
		}).(js.Value))
		x.True(err_js.IsUndefined())

		v, err_js := jz.Await(stream.Call("close_send"))
		x.True(err_js.IsUndefined())
		x.True(v.IsUndefined())

		v, err_js = jz.Await(stream.Call("recv"))
		x.True(err_js.IsUndefined())
		x.Equal(int(codes.OK), v.Get("status").Get("code").Int())
	}))
	t.Run("recv and close send", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		stream, err_js := jz.Await(conn.JsOpenBidiStream(js.Undefined(), []js.Value{
			js.ValueOf(echo.EchoService_Live_FullMethodName),
			js.ValueOf(map[string]any{}),
		}).(js.Value))
		x.True(err_js.IsUndefined())

		p := stream.Call("recv")
		time.Sleep(10 * time.Millisecond)

		_, err_js = jz.Await(stream.Call("close_send"))
		x.True(err_js.IsUndefined())

		v, err_js := jz.Await(p)
		x.True(err_js.IsUndefined())
		x.Equal(int(codes.OK), v.Get("status").Get("code").Int())
	}))
	t.Run("send and recv", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		stream, err_js := jz.Await(conn.JsOpenBidiStream(js.Undefined(), []js.Value{
			js.ValueOf(echo.EchoService_Live_FullMethodName),
			js.ValueOf(map[string]any{}),
		}).(js.Value))
		x.True(err_js.IsUndefined())

		req := echo.EchoRequest{}
		req.SetMessage("Lebowski")
		req.SetCircularShift(3)
		in, err := protoMarshal(&req)
		x.NoError(err)

		_, err_js = jz.Await(stream.Call("send", in))
		x.True(err_js.IsUndefined())

		v, err_js := jz.Await(stream.Call("recv"))
		x.True(err_js.IsUndefined())
		x.False(v.Get("done").Bool())

		res := echo.EchoResponse{}
		err = protoUnmarshal(v.Get("response"), &res)
		x.NoError(err)
		x.Equal("skiLebow", res.GetMessage())
	}))
	t.Run("recv and send", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		stream, err_js := jz.Await(conn.JsOpenBidiStream(js.Undefined(), []js.Value{
			js.ValueOf(echo.EchoService_Live_FullMethodName),
			js.ValueOf(map[string]any{}),
		}).(js.Value))
		x.True(err_js.IsUndefined())

		req := echo.EchoRequest{}
		req.SetMessage("Lebowski")
		req.SetCircularShift(3)
		in, err := protoMarshal(&req)
		x.NoError(err)

		p := stream.Call("recv")
		time.Sleep(10 * time.Millisecond)

		_, err_js = jz.Await(stream.Call("send", in))
		x.True(err_js.IsUndefined())

		v, err_js := jz.Await(p)
		x.True(err_js.IsUndefined())
		x.False(v.Get("done").Bool())

		res := echo.EchoResponse{}
		err = protoUnmarshal(v.Get("response"), &res)
		x.NoError(err)
		x.Equal("skiLebow", res.GetMessage())
	}))
	t.Run("send multiple", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		stream, err_js := jz.Await(conn.JsOpenBidiStream(js.Undefined(), []js.Value{
			js.ValueOf(echo.EchoService_Live_FullMethodName),
			js.ValueOf(map[string]any{}),
		}).(js.Value))
		x.True(err_js.IsUndefined())

		req := echo.EchoRequest{}
		req.SetMessage("Lebowski")
		in, err := protoMarshal(&req)
		x.NoError(err)

		_, err_js = jz.Await(stream.Call("send", in))
		x.True(err_js.IsUndefined())
		_, err_js = jz.Await(stream.Call("send", in))
		x.True(err_js.IsUndefined())
		_, err_js = jz.Await(stream.Call("send", in))
		x.True(err_js.IsUndefined())

		res := echo.EchoResponse{}
		v, err_js := jz.Await(stream.Call("recv"))
		x.True(err_js.IsUndefined())
		err = protoUnmarshal(v.Get("response"), &res)
		x.NoError(err)
		x.Equal(uint32(0), res.GetSequence())

		v, err_js = jz.Await(stream.Call("recv"))
		x.True(err_js.IsUndefined())
		err = protoUnmarshal(v.Get("response"), &res)
		x.NoError(err)
		x.Equal(uint32(1), res.GetSequence())

		v, err_js = jz.Await(stream.Call("recv"))
		x.True(err_js.IsUndefined())
		err = protoUnmarshal(v.Get("response"), &res)
		x.NoError(err)
		x.Equal(uint32(2), res.GetSequence())
	}))
	t.Run("recv many", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		stream, err_js := jz.Await(conn.JsOpenBidiStream(js.Undefined(), []js.Value{
			js.ValueOf(echo.EchoService_Live_FullMethodName),
			js.ValueOf(map[string]any{}),
		}).(js.Value))
		x.True(err_js.IsUndefined())

		req := echo.EchoRequest{}
		req.SetMessage("Lebowski")
		req.SetRepeat(3)
		in, err := protoMarshal(&req)
		x.NoError(err)

		_, err_js = jz.Await(stream.Call("send", in))
		x.True(err_js.IsUndefined())

		res := echo.EchoResponse{}
		v, err_js := jz.Await(stream.Call("recv"))
		x.True(err_js.IsUndefined())
		err = protoUnmarshal(v.Get("response"), &res)
		x.NoError(err)
		x.Equal(uint32(0), res.GetSequence())

		v, err_js = jz.Await(stream.Call("recv"))
		x.True(err_js.IsUndefined())
		err = protoUnmarshal(v.Get("response"), &res)
		x.NoError(err)
		x.Equal(uint32(1), res.GetSequence())

		v, err_js = jz.Await(stream.Call("recv"))
		x.True(err_js.IsUndefined())
		err = protoUnmarshal(v.Get("response"), &res)
		x.NoError(err)
		x.Equal(uint32(2), res.GetSequence())
	}))
	t.Run("error", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		stream, err_js := jz.Await(conn.JsOpenBidiStream(js.Undefined(), []js.Value{
			js.ValueOf(echo.EchoService_Live_FullMethodName),
			js.ValueOf(map[string]any{}),
		}).(js.Value))
		x.True(err_js.IsUndefined())

		req := echo.EchoRequest{}
		req.SetStatus(echo.Status_builder{
			Code:    int32(codes.FailedPrecondition),
			Message: "Is this your homework, Larry?",
		}.Build())
		in, err := protoMarshal(&req)
		x.NoError(err)

		_, err_js = jz.Await(stream.Call("send", in))
		x.True(err_js.IsUndefined())

		v, err_js := jz.Await(stream.Call("recv"))
		x.True(err_js.IsUndefined())
		x.Equal(int(codes.FailedPrecondition), v.Get("status").Get("code").Int())
	}))
	t.Run("with metadata", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		stream, err_js := jz.Await(conn.JsOpenBidiStream(js.Undefined(), []js.Value{
			js.ValueOf(echo.EchoService_Live_FullMethodName),
			js.ValueOf(map[string]any{
				"meta": js.ValueOf(map[string]any{
					"foo": []any{"bar"},
				}),
			}),
		}).(js.Value))
		x.True(err_js.IsUndefined())

		v, err_js := jz.Await(stream.Call("header"))
		x.True(err_js.IsUndefined())
		x.Equal(js.TypeObject, v.Type())
		x.Equal("bar", v.Get("foo").Index(0).String())
		x.Equal("header", v.Get("timing").Index(0).String())

		_, err_js = jz.Await(stream.Call("close_send"))
		x.True(err_js.IsUndefined())

		v, err_js = jz.Await(stream.Call("recv"))
		x.True(err_js.IsUndefined())
		x.Equal("bar", v.Get("trailer").Get("foo").Index(0).String())
		x.Equal("trailer", v.Get("trailer").Get("timing").Index(0).String())
	}))
	t.Run("close with metadata", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		stream, err_js := jz.Await(conn.JsOpenBidiStream(js.Undefined(), []js.Value{
			js.ValueOf(echo.EchoService_Live_FullMethodName),
			js.ValueOf(map[string]any{
				"meta": js.ValueOf(map[string]any{
					"foo": []any{"bar"},
				}),
			}),
		}).(js.Value))
		x.True(err_js.IsUndefined())

		v, err_js := jz.Await(stream.Call("header"))
		x.True(err_js.IsUndefined())
		x.Equal(js.TypeObject, v.Type())
		x.Equal("bar", v.Get("foo").Index(0).String())
		x.Equal("header", v.Get("timing").Index(0).String())

		_, err_js = jz.Await(stream.Call("close"))
		x.True(err_js.IsUndefined())

		v, err_js = jz.Await(stream.Call("recv"))
		x.True(err_js.IsUndefined())
		x.True(v.Get("trailer").Get("timing").IsUndefined())
	}))
}
