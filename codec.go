package grpcwasm

import (
	"fmt"

	"google.golang.org/grpc/encoding"
)

var _ encoding.Codec = NoopCodec{}

// NoopCodec returns the data as is and complains if the value is not a byte slice.
// This is useful to pass already serialized data to the gRPC server.
type NoopCodec struct{}

func (NoopCodec) Name() string {
	return "noop"
}

func (NoopCodec) Marshal(v any) ([]byte, error) {
	data, ok := v.([]byte)
	if !ok {
		return nil, fmt.Errorf("expected the message to be []byte")
	}

	return data, nil
}

func (NoopCodec) Unmarshal(data []byte, v any) (err error) {
	dst, ok := v.(*[]byte)
	if !ok {
		return fmt.Errorf("expected the destination to be *[]byte")
	}
	if dst == nil {
		return fmt.Errorf("destination was nil")
	}

	*dst = data
	return nil
}
