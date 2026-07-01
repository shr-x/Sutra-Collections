FROM alpine:3.19

RUN apk add --no-cache \
    postgresql15-client \
    bash \
    tzdata

ENV TZ=Asia/Kolkata

COPY backup.sh /backup.sh
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /backup.sh /entrypoint.sh

RUN mkdir -p /backups /var/log

CMD ["/entrypoint.sh"]
