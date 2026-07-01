FROM alpine:3.19

RUN apk add --no-cache \
    git \
    docker-cli \
    docker-compose \
    bash \
    curl

COPY update.sh /update.sh
RUN chmod +x /update.sh

CMD ["/update.sh"]
