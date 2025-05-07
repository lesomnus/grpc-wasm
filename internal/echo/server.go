package echo

import (
	context "context"
	"errors"
	"io"

	grpc "google.golang.org/grpc"
	codes "google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	status "google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func (x *EchoRequest) Error() error {
	s := x.GetStatus()
	if s == nil {
		return nil
	}

	return status.Error(codes.Code(s.GetCode()), s.GetMessage())
}

type EchoServer struct {
	UnimplementedEchoServiceServer
}

func (EchoServer) Once(ctx context.Context, req *EchoRequest) (*EchoResponse, error) {
	if md, has_md := metadata.FromIncomingContext(ctx); has_md {
		md := md.Copy()
		md.Set("timing", "header")
		if err := grpc.SendHeader(ctx, md); err != nil {
			return nil, status.Errorf(codes.Internal, "failed to send header: %v", err)
		}
		md.Set("timing", "trailer")
		if err := grpc.SetTrailer(ctx, md); err != nil {
			return nil, status.Errorf(codes.Internal, "failed to set trailer: %v", err)
		}
	}

	if err := req.Error(); err != nil {
		return nil, err
	}
	if req.GetOverVoid() {
		<-ctx.Done()
		return nil, ctx.Err()
	}

	v := req.GetMessage()
	v = circularShift(v, int(req.GetCircularShift()))
	return EchoResponse_builder{
		Message:     v,
		Sequence:    0,
		DateCreated: timestamppb.Now(),
	}.Build(), nil
}

func (EchoServer) many(seq *uint32, req *EchoRequest, h func(res *EchoResponse) error) error {
	if err := req.Error(); err != nil {
		return err
	}

	v := req.GetMessage()
	n := req.GetRepeat()
	if n == 0 {
		n = 1
	}
	for range n {
		v = circularShift(v, int(req.GetCircularShift()))
		if err := h(EchoResponse_builder{
			Message:     v,
			Sequence:    *seq,
			DateCreated: timestamppb.Now(),
		}.Build()); err != nil {
			return err
		}

		*seq++
	}
	return nil
}

func (s EchoServer) Many(req *EchoRequest, stream grpc.ServerStreamingServer[EchoResponse]) error {
	seq := uint32(0)
	return s.many(&seq, req, stream.Send)
}

func (s EchoServer) Buff(stream grpc.ClientStreamingServer[EchoRequest, EchoBatchResponse]) error {
	items := []*EchoResponse{}

	seq := uint32(0)
	for {
		req, err := stream.Recv()
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return err
		}
		if err := s.many(&seq, req, func(res *EchoResponse) error {
			items = append(items, res)
			return nil
		}); err != nil {
			return err
		}
	}

	return stream.SendAndClose(EchoBatchResponse_builder{
		Items: items,
	}.Build())
}

func (s EchoServer) Live(stream grpc.BidiStreamingServer[EchoRequest, EchoResponse]) error {
	ctx := stream.Context()
	if md, has_md := metadata.FromIncomingContext(ctx); has_md {
		md := md.Copy()
		md.Set("timing", "header")
		if err := stream.SendHeader(md); err != nil {
			return status.Errorf(codes.Internal, "failed to send header: %v", err)
		}
		md.Set("timing", "trailer")
		stream.SetTrailer(md)
	}

	seq := uint32(0)
	for {
		req, err := stream.Recv()
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
		if err := s.many(&seq, req, stream.Send); err != nil {
			return err
		}
	}
}

func circularShift(s string, n int) string {
	if len(s) == 0 {
		return s
	}

	v := []rune(s)
	l := len(v)
	n = ((-n % l) + l) % l

	return string(v[n:]) + string(v[:n])
}
