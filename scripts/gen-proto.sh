#!/usr/bin/env bash

set -o errexit
set -o pipefail
set -o nounset
# set -o xtrace


__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" # Directory where this script exists.
__root="$(cd "$(dirname "${__dir}")" && pwd)"         # Root directory of project.


cd "$__root"

PROTO_ROOT="$__root/proto"
OUTPUT_DIR_GO="$__root/internal/echo"
OUTPUT_DIR_TS="$__root/src/test/proto"
MODULE_NAME="github.com/lesomnus/grpc-wasm/internal/echo"

protoc \
	--plugin=protoc-gen-ts=./node_modules/.bin/protoc-gen-ts \
	--proto_path=${PROTO_ROOT} \
	\
	--go_out=${OUTPUT_DIR_GO} \
	--go_opt=module=${MODULE_NAME} \
	--go_opt=default_api_level=API_OPAQUE \
	\
	--go-grpc_out=${OUTPUT_DIR_GO} \
	--go-grpc_opt=module=${MODULE_NAME} \
	\
	--ts_out=${OUTPUT_DIR_TS} \
	--ts_opt=server_generic \
	\
	"$PROTO_ROOT"/**/*.proto
