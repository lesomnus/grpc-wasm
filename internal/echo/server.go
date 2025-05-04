package echo

import (
	context "context"

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

	v := req.GetMessage()
	v = circularShift(v, int(req.GetCircularShift()))
	return EchoResponse_builder{
		Message:     v,
		Sequence:    0,
		DateCreated: timestamppb.Now(),
	}.Build(), nil
}
func (EchoServer) Many(req *EchoRequest, stream grpc.ServerStreamingServer[EchoResponse]) error {
	if err := req.Error(); err != nil {
		return err
	}

	v := req.GetMessage()
	for i := range req.GetRepeat() {
		v = circularShift(v, int(req.GetCircularShift()))
		if err := stream.Send(EchoResponse_builder{
			Message:     v,
			Sequence:    i,
			DateCreated: timestamppb.Now(),
		}.Build()); err != nil {
			return err
		}
	}
	return nil
}
func (EchoServer) Buff(grpc.ClientStreamingServer[EchoRequest, EchoResponse]) error {
	return status.Errorf(codes.Unimplemented, "method Buff not implemented")
}
func (EchoServer) Live(grpc.BidiStreamingServer[EchoRequest, EchoResponse]) error {
	return status.Errorf(codes.Unimplemented, "method Live not implemented")
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
