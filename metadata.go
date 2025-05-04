//go:build js && wasm

package grpcwasm

import (
	"syscall/js"

	"google.golang.org/grpc/metadata"
)

// MetaFromJS does check type on [from].
// The [from] is expected to be:
//
//	type Metadata = {
//		[key: string]: string[]
//	};
func metaFromJsValue(to metadata.MD, from js.Value) {
	ks := js.Global().Get("Object").Call("keys", from)

	l := ks.Length()
	for i := range l {
		k := ks.Index(i).String()
		a := from.Get(k)

		l := a.Length()
		vs := make([]string, l)
		for j := range l {
			vs[j] = a.Index(j).String()
		}

		to.Set(k, vs...)
	}
}

func metaToJsValue(from metadata.MD) js.Value {
	md := js.ValueOf(map[string]any{})
	for k, vs := range from {
		a := js.ValueOf([]any{})
		for i, v := range vs {
			a.SetIndex(i, v)
		}

		md.Set(k, a)
	}
	return md
}
