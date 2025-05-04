package echo

import (
	context "context"
	"time"

	grpc "google.golang.org/grpc"
	codes "google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	status "google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type EchoServer struct {
	UnimplementedEchoServiceServer
}

func (x *Echo) Clone() *Echo {
	return proto.Clone(x).(*Echo)
}

func (x *Echo) Tick() {
	if n := x.GetCircularShift(); n != 0 {
		v := circularShift(x.GetMessage(), int(n))
		x.SetMessage(v)
	}
}

func (x *Status) Error() error {
	return status.Error(codes.Code(x.GetCode()), x.GetMessage())
}

func (EchoServer) Unary(ctx context.Context, req *Echo) (*Echo, error) {
	md, has_md := metadata.FromIncomingContext(ctx)
	if has_md {
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

	if s := req.GetStatus(); s.GetCode() != int32(codes.OK) {
		return nil, s.Error()
	}

	v := req.Clone()
	v.SetDateCreated(timestamppb.Now())
	v.Tick()
	return v, nil
}
func (EchoServer) ClientStream(grpc.ClientStreamingServer[Echo, Echo]) error {
	return status.Errorf(codes.Unimplemented, "method ClientStream not implemented")
}
func (EchoServer) ServerStream(req *Echo, ss grpc.ServerStreamingServer[Echo]) error {
	i := uint64(0)
	for ss.Context().Err() == nil {
		res := req.Clone()
		res.SetSequence(i)
		i++
		if err := ss.Send(res); err != nil {
			return status.Errorf(codes.Internal, "failed to send response: %v", err)
		}
		time.Sleep(10 * time.Millisecond)
	}

	return nil
}
func (EchoServer) BidiStream(grpc.BidiStreamingServer[Echo, Echo]) error {
	return status.Errorf(codes.Unimplemented, "method BidiStream not implemented")
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
