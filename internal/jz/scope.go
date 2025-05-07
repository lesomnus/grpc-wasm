//go:build js && wasm

package jz

import (
	"sync"
	"syscall/js"
)

var globalScope = NewScope()

func GlobalScope() *Scope {
	return globalScope
}

type Scope struct {
	wg sync.WaitGroup
}

func NewScope() *Scope {
	return &Scope{}
}

func (s *Scope) Wait() {
	s.wg.Wait()
}

func (s *Scope) FuncOf(f func(this js.Value, args []js.Value) any) js.Func {
	return js.FuncOf(func(this js.Value, args []js.Value) any {
		s.wg.Add(1)
		defer s.wg.Done()

		return f(this, args)
	})
}

func (s *Scope) Promise(f func() (js.Value, js.Value)) js.Value {
	return js.Global().Get("Promise").New(js.FuncOf(func(this js.Value, args []js.Value) any {
		s.wg.Add(1)
		resolve := args[0]
		reject := args[1]

		go func() {
			defer s.wg.Done()

			v, err := f()
			if !err.IsUndefined() {
				reject.Invoke(err)
			} else {
				resolve.Invoke(v)
			}
		}()
		return nil
	}))
}

func (s *Scope) Await(p js.Value) (js.Value, js.Value) {
	s.wg.Add(1)
	defer s.wg.Done()

	c := make(chan js.Value)
	caught := false
	p.Call("then",
		js.FuncOf(func(this js.Value, args []js.Value) any {
			c <- args[0]
			return js.Undefined()
		}),
		js.FuncOf(func(this js.Value, args []js.Value) any {
			caught = true
			c <- args[0]
			return js.Undefined()
		}),
	)

	v := <-c
	if caught {
		return js.Undefined(), v
	} else {
		return v, js.Undefined()
	}
}
