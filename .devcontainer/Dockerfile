FROM ghcr.io/lesomnus/dev-golang:1.24

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
	--mount=type=cache,target=/var/lib/apt,sharing=locked \
	apt update \
	&& apt-get install --no-install-recommends --yes \
		software-properties-common \
	&& bash -c "$(wget -O - https://apt.llvm.org/llvm.sh)" 20 all \
	&& ln -s /usr/bin/clang-format-18 /usr/bin/clang-format

RUN TEMP=$(mktemp -d); \
	ARCH=$(uname -m); \
	case "$ARCH" in \
		'x86_64') ;; \
		'aarch64') \
			ARCH='aarch_64'; \
			;; \
		*) exit 1 ;; \
	esac; \
	cd "${TEMP}" \
	&& curl -o ./protoc.zip -fsSL "https://github.com/protocolbuffers/protobuf/releases/download/v29.0/protoc-29.0-linux-$ARCH.zip" \
	&& unzip ./protoc.zip -d /usr/local \
	&& chmod 755 /usr/local/bin/protoc \
	&& rm -rf "${TEMP}"



USER hypnos

RUN  echo \
		google.golang.org/protobuf/cmd/protoc-gen-go@v1.36 \
		google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5 \
	| xargs -n1 go install

# Comment out the following lines if you don't want to use Zsh.
RUN wget https://github.com/robbyrussell/oh-my-zsh/raw/master/tools/install.sh -O - | zsh || true \
	&& git clone https://github.com/zsh-users/zsh-autosuggestions         ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions     \
	&& git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting \
	&& git clone https://github.com/zsh-users/zsh-completions             ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-completions
ADD .zshrc /home/hypnos
ENV SHELL=/bin/zsh
