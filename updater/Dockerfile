FROM alpine:3.19

# git: fetch / fast-forward; docker-cli + compose: build & recreate the app;
# postgresql15-client: pre-update pg_dump + talking to the request queue
# (must match the server's major version, postgres:15); curl: health check.
RUN apk add --no-cache \
    git \
    docker-cli \
    docker-cli-compose \
    postgresql15-client \
    bash \
    curl \
    tzdata

ENV TZ=Asia/Kolkata

COPY update.sh /update.sh
RUN chmod +x /update.sh

CMD ["/update.sh"]
