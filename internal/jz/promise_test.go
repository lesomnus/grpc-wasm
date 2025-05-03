//go:build js && wasm

package jz_test

import (
	"syscall/js"
	"testing"

	"github.com/lesomnus/grpc-wasm/internal/jz"
	"github.com/stretchr/testify/require"
)

func TestPromiseAwait(t *testing.T) {
	t.Run("resolve", func(t *testing.T) {
		p := jz.Promise(func() (js.Value, js.Value) {
			return js.ValueOf("foo"), js.Undefined()
		})
		v, err := jz.Await(p)
		require.Equal(t, "foo", v.String())
		require.Equal(t, js.Undefined(), err)
	})
	t.Run("reject", func(t *testing.T) {
		p := jz.Promise(func() (js.Value, js.Value) {
			return js.Undefined(), js.ValueOf("foo")
		})
		v, err := jz.Await(p)
		require.Equal(t, js.Undefined(), v)
		require.Equal(t, "foo", err.String())
	})
}

func TestResolve(t *testing.T) {
	p := jz.Resolve(js.ValueOf(42))
	v, err := jz.Await(p)
	require.True(t, err.IsUndefined())
	require.Equal(t, js.TypeNumber, v.Type())
	require.Equal(t, 42, v.Int())
}

func TestReject(t *testing.T) {
	p := jz.Reject(js.ValueOf(42))
	v, err := jz.Await(p)
	require.True(t, v.IsUndefined())
	require.Equal(t, js.TypeNumber, err.Type())
	require.Equal(t, 42, err.Int())
}
