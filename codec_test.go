package grpcwasm_test

import (
	"testing"

	grpcwasm "github.com/lesomnus/grpc-wasm"
	"github.com/lesomnus/grpc-wasm/internal/echo"
	"github.com/stretchr/testify/require"
)

func TestNoopCodec(t *testing.T) {
	codec := grpcwasm.NoopCodec{}

	t.Run("marshal only byte slice", func(t *testing.T) {
		msg := &echo.Echo{}
		_, err := codec.Marshal(msg)
		require.ErrorContains(t, err, "[]byte")
	})
	t.Run("marshal returns the value as-is", func(t *testing.T) {
		msg := []byte("hello")
		data, err := codec.Marshal(msg)
		require.NoError(t, err)
		require.Equal(t, msg, data)
	})
	t.Run("unmarshal into only pointer to byte slice", func(t *testing.T) {
		msg := &echo.Echo{}
		err := codec.Unmarshal([]byte("foo"), msg)
		require.ErrorContains(t, err, "*[]byte")
	})
	t.Run("unmarshal sets the value to destination", func(t *testing.T) {
		data := []byte("foo")
		msg := []byte{}
		err := codec.Unmarshal(data, &msg)
		require.NoError(t, err)
		require.Equal(t, data, msg)
	})
	t.Run("unmarshal fails if destination is nil", func(t *testing.T) {
		data := []byte("foo")
		var msg *[]byte
		err := codec.Unmarshal(data, msg)
		require.ErrorContains(t, err, "nil")
	})
}
