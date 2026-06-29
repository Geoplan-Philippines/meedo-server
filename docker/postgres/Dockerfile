FROM postgres:17-alpine

ARG PGVECTOR_VERSION=0.8.1

RUN apk add --no-cache --virtual .build-deps \
    build-base \
    clang19 \
    llvm19 \
    llvm19-dev \
  && wget -O /tmp/pgvector.tar.gz "https://github.com/pgvector/pgvector/archive/refs/tags/v${PGVECTOR_VERSION}.tar.gz" \
  && mkdir -p /tmp/pgvector \
  && tar -xzf /tmp/pgvector.tar.gz -C /tmp/pgvector --strip-components=1 \
  && make -C /tmp/pgvector \
  && make -C /tmp/pgvector install \
  && rm -rf /tmp/pgvector /tmp/pgvector.tar.gz \
  && apk del .build-deps
