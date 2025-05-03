//go:build js && wasm

package grpcwasm_test

import (
	"syscall/js"
	"testing"

	grpcwasm "github.com/lesomnus/grpc-wasm"
	"github.com/stretchr/testify/require"
)

var jsNoopFn = js.FuncOf(func(this js.Value, args []js.Value) any {
	return js.Undefined()
})

func TestListen(t *testing.T) {
	t.Run("fails if globalThis.grpc_wasm is undefined", func(t *testing.T) {
		_, err := grpcwasm.Listen()
		require.ErrorContains(t, err, "undefined")
	})
	t.Run("fails if globalThis.grpc_wasm is not an Object", func(t *testing.T) {
		js.Global().Set("grpc_wasm", js.ValueOf(42))
		_, err := grpcwasm.Listen()
		require.ErrorContains(t, err, "Object")
	})
	t.Run("fails if globalThis.grpc_wasm.resolve is not a function", func(t *testing.T) {
		js.Global().Set("grpc_wasm", js.ValueOf(map[string]any{
			"reject": jsNoopFn,
		}))
		_, err := grpcwasm.Listen()
		require.ErrorContains(t, err, "function")
	})
	t.Run("fails if globalThis.grpc_wasm.reject is not a function", func(t *testing.T) {
		js.Global().Set("grpc_wasm", js.ValueOf(map[string]any{
			"resolve": jsNoopFn,
		}))
		_, err := grpcwasm.Listen()
		require.ErrorContains(t, err, "function")
	})
	t.Run("invokes globalThis.grpc_wasm.resolve with JS side listener", func(t *testing.T) {
		require := require.New(t)

		var v js.Value
		js.Global().Set("grpc_wasm", js.ValueOf(map[string]any{
			"resolve": js.FuncOf(func(this js.Value, args []js.Value) any {
				require.Len(args, 1)
				v = args[0]

				return js.Undefined()
			}),
			"reject": jsNoopFn,
		}))
		l, err := grpcwasm.Listen()
		require.NoError(err)
		defer l.Close()

		require.Equal(js.TypeObject, v.Type())
		require.Equal(js.TypeFunction, v.Get("close").Type())
		require.Equal(js.TypeFunction, v.Get("dial").Type())
	})
}

func TestJsDial(t *testing.T) {
	t.Run("returns Promise", func(t *testing.T) {
		require := require.New(t)

		l := grpcwasm.NewListener()
		defer l.Close()

		u := l.JsDial(js.Undefined(), nil)
		require.IsType(js.Value{}, u)

		v := u.(js.Value)
		require.True(v.InstanceOf(js.Global().Get("Promise")))
	})
}
