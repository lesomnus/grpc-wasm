//go:build js && wasm

package jz

import "syscall/js"

func Stringify(v js.Value) string {
	return js.Global().Get("JSON").Call("stringify", v).String()
}
