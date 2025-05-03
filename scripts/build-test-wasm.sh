#!/usr/bin/env bash

set -o errexit
set -o pipefail
set -o nounset
# set -o xtrace


__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" # Directory where this script exists.
__root="$(cd "$(dirname "${__dir}")" && pwd)"         # Root directory of project.


cd "$__root"

export GOOS=js GOARCH=wasm
mkdir -p ./src/test
go build -o ./src/test/echobridge.wasm ./internal/echobridge
