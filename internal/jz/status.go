//go:build js && wasm

package jz

import (
	"syscall/js"

	"google.golang.org/grpc/status"
)

func Status(s *status.Status) js.Value {
	return js.ValueOf(map[string]any{
		"code":    int(s.Code()),
		"message": s.Message(),
	})
}

func StatusE(err error) js.Value {
	return Status(status.Convert(err))
}
