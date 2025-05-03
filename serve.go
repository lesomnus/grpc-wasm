//go:build js && wasm

package grpcwasm

import (
	"fmt"

	"google.golang.org/grpc"
)

func Serve(s *grpc.Server) error {
	l, err := Listen()
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}

	err = s.Serve(l)
	s.Stop()
	l.Wait()

	return err
}
