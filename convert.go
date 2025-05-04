//go:build js && wasm

package grpcwasm

import (
	"syscall/js"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func statusToGo(v js.Value) *status.Status {
	return status.New(
		codes.Code(v.Get("code").Int()),
		v.Get("message").String(),
	)
}

func statusToJs(v *status.Status) js.Value {
	return js.ValueOf(map[string]any{
		"code":    js.ValueOf(int(v.Code())),
		"message": js.ValueOf(v.Message()),
	})
}

// MetaFromJS does not check type of [src].
// The [src] is expected to be:
//
//	type Metadata = {
//		[key: string]: string[]
//	};
func metaToGo(dst metadata.MD, src js.Value) {
	ks := js.Global().Get("Object").Call("keys", src)

	l := ks.Length()
	for i := range l {
		k := ks.Index(i).String()
		a := src.Get(k)

		l := a.Length()
		vs := make([]string, l)
		for j := range l {
			vs[j] = a.Index(j).String()
		}

		dst.Set(k, vs...)
	}
}

func metaToJs(v metadata.MD) js.Value {
	md := js.ValueOf(map[string]any{})
	for k, vs := range v {
		a := js.ValueOf([]any{})
		for i, v := range vs {
			a.SetIndex(i, v)
		}

		md.Set(k, a)
	}
	return md
}
