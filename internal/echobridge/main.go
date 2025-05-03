//go:build js && wasm

package main

import (
	"fmt"
	"os"

	grpcwasm "github.com/lesomnus/grpc-wasm"
	"github.com/lesomnus/grpc-wasm/internal/echo"
	"google.golang.org/grpc"
)

func main() {
	s := grpc.NewServer()
	echo.RegisterEchoServiceServer(s, echo.EchoServer{})

	if err := grpcwasm.Serve(s); err != nil {
		fmt.Fprintf(os.Stderr, "server stopped with error: %v\n", err)
	}
}
