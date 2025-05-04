//go:build js && wasm

package grpcwasm_test

import (
	"context"
	"sync"
	"testing"

	grpcwasm "github.com/lesomnus/grpc-wasm"
	"github.com/lesomnus/grpc-wasm/internal/echo"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestConn(t *testing.T) {
	t.Run("unary", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		req := &echo.Echo{}
		req.SetMessage("Lebowski")
		req.SetSequence(42)
		req.SetCircularShift(3)
		req.SetDateCreated(timestamppb.Now())

		in, err := proto.Marshal(req)
		x.NoError(err)

		out := []byte{}
		err = conn.Invoke(ctx, echo.EchoService_Unary_FullMethodName, in, &out)
		x.NoError(err)
		x.NotEmpty(out)

		res := &echo.Echo{}
		err = proto.Unmarshal(out, res)
		x.NoError(err)
		x.Equal("skiLebow", res.GetMessage())
		x.Equal(req.GetSequence(), res.GetSequence())
		x.Less(req.GetDateCreated().AsTime(), res.GetDateCreated().AsTime())
	}))
	t.Run("unary with error", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		req := &echo.Echo{}
		req.SetStatus(echo.Status_builder{
			Code:    int32(codes.FailedPrecondition),
			Message: "Is this your homework, Larry?",
		}.Build())

		in, err := proto.Marshal(req)
		x.NoError(err)

		out := []byte{}
		err = conn.Invoke(ctx, echo.EchoService_Unary_FullMethodName, in, &out)
		x.Error(err)

		s, ok := status.FromError(err)
		x.True(ok)
		x.Equal(codes.FailedPrecondition, s.Code())
		x.Equal("Is this your homework, Larry?", s.Message())
	}))
	t.Run("unary with metadata", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		req := &echo.Echo{}

		in, err := proto.Marshal(req)
		x.NoError(err)

		out := []byte{}
		ctx = metadata.NewOutgoingContext(ctx, metadata.Pairs("foo", "bar"))
		header := metadata.MD{}
		trailer := metadata.MD{}
		err = conn.Invoke(ctx, echo.EchoService_Unary_FullMethodName, in, &out, grpc.Header(&header), grpc.Trailer(&trailer))
		x.NoError(err)
		x.Equal(header.Get("foo"), []string{"bar"})
		x.Equal(header.Get("timing"), []string{"header"})
		x.Equal(trailer.Get("foo"), []string{"bar"})
		x.Equal(trailer.Get("timing"), []string{"trailer"})
	}))
	t.Run("unary with error and metadata", withConn(func(ctx context.Context, x *require.Assertions, conn *grpcwasm.Conn) {
		req := &echo.Echo{}
		req.SetStatus(echo.Status_builder{
			Code:    int32(codes.FailedPrecondition),
			Message: "Is this your homework, Larry?",
		}.Build())

		in, err := proto.Marshal(req)
		x.NoError(err)

		out := []byte{}
		ctx = metadata.NewOutgoingContext(ctx, metadata.Pairs("foo", "bar"))
		header := metadata.MD{}
		trailer := metadata.MD{}
		err = conn.Invoke(ctx, echo.EchoService_Unary_FullMethodName, in, &out, grpc.Header(&header), grpc.Trailer(&trailer))
		x.Error(err)

		s, ok := status.FromError(err)
		x.True(ok)
		x.Equal(codes.FailedPrecondition, s.Code())

		x.Equal("Is this your homework, Larry?", s.Message())
		x.Equal(header.Get("foo"), []string{"bar"})
		x.Equal(header.Get("timing"), []string{"header"})
		x.Equal(trailer.Get("foo"), []string{"bar"})
		x.Equal(trailer.Get("timing"), []string{"trailer"})
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
