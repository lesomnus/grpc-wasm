//go:build js && wasm

package jz

import "syscall/js"

func BytesToGo(v js.Value) []byte {
	b := make([]byte, v.Length())
	js.CopyBytesToGo(b, v)
	return b
}

func BytesToJs(v []byte) js.Value {
	a := js.Global().Get("Uint8Array").New(len(v))
	js.CopyBytesToJS(a, v)
	return a
}
