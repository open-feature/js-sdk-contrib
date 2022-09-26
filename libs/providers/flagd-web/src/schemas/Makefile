VERSION=v1.6.0

guard-%:
	@ if [ "${${*}}" = "" ]; then \
        echo "Environment variable $* not set"; \
        exit 1; \
    fi

install-buf:
	go install github.com/bufbuild/buf/cmd/buf@${VERSION}

lint: guard-GOPATH
	cd protobuf && ${GOPATH}/bin/buf lint

gen-go: install-buf guard-GOPATH
	${GOPATH}/bin/buf generate buf.build/open-feature/flagd --template protobuf/buf.gen.go.yaml

gen-go-server: install-buf guard-GOPATH
	${GOPATH}/bin/buf generate buf.build/open-feature/flagd --template protobuf/buf.gen.go-server.yaml

gen-ts: install-buf guard-GOPATH
	${GOPATH}/bin/buf generate buf.build/open-feature/flagd --template protobuf/buf.gen.ts.yaml

gen-java: install-buf guard-GOPATH
	${GOPATH}/bin/buf generate buf.build/open-feature/flagd --template protobuf/buf.gen.java.yaml