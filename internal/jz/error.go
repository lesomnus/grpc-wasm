//go:build js && wasm

package jz

import (
	"fmt"
	"syscall/js"
)

func Error(msg string) js.Value {
	return js.Global().Get("Error").New(msg)
}

func ToError(err error) js.Value {
	return Error(err.Error())
}

func ErrorF(format string, a ...any) js.Value {
	return js.Global().Get("Error").New(fmt.Sprintf(format, a...))
}
