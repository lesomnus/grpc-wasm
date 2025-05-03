//go:build js && wasm

package jz

import "syscall/js"

func Promise(f func() (js.Value, js.Value)) js.Value {
	return globalScope.Promise(f)
}

func Await(p js.Value) (js.Value, js.Value) {
	return globalScope.Await(p)
}

func Resolve(v js.Value) js.Value {
	return js.Global().Get("Promise").Call("resolve", v)
}

func Reject(v js.Value) js.Value {
	return js.Global().Get("Promise").Call("reject", v)
}
