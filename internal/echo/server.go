package echo

import (
	context "context"
	"time"

	grpc "google.golang.org/grpc"
	codes "google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	status "google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type EchoServer struct {
	UnimplementedEchoServiceServer
}

func (x *Echo) Clone() *Echo {
	v := &Echo{}
	v.SetMessage(x.GetMessage())
	v.SetSequence(x.GetSequence())
	v.SetDateCreated(timestamppb.Now())
	return v
}

func (EchoServer) Unary(ctx context.Context, req *Echo) (*Echo, error) {
	md, has_md := metadata.FromIncomingContext(ctx)
	if has_md {
		md := md.Copy()
		md.Set("timing", "header")
		if err := grpc.SendHeader(ctx, md); err != nil {
			return nil, status.Errorf(codes.Internal, "failed to send header: %v", err)
		}
	}
	if has_md {
		md := md.Copy()
		md.Set("timing", "trailer")
		if err := grpc.SetTrailer(ctx, md); err != nil {
			return nil, status.Errorf(codes.Internal, "failed to set trailer: %v", err)
		}
	}

	if !req.HasError() {
		return req.Clone(), nil
	}

	err := req.GetError()
	return nil, status.Errorf(codes.Code(err.GetCode()), "%s", err.GetMessage())
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
