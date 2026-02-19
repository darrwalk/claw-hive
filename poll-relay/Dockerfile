FROM node:22-alpine

# Install system dependencies
RUN apk add --no-cache curl bash jq docker-cli

# Install supercronic (container-native cron, proper signal handling and stdout logging)
ARG SUPERCRONIC_VERSION=v0.2.33
ARG SUPERCRONIC_SHA1SUM=71b0d58cc53f6bd72cf2f293e09e294b79c666d8
RUN curl -fsSLo /usr/local/bin/supercronic \
    "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
    && echo "${SUPERCRONIC_SHA1SUM}  /usr/local/bin/supercronic" | sha1sum -c - \
    && chmod +x /usr/local/bin/supercronic

WORKDIR /app

# Copy CLI (build context is repo root — see docker-compose.yml)
COPY cli ./cli
RUN cd cli && npm install --omit=dev

# Copy polling scripts and make executable
COPY poll-relay/hive-poll.sh poll-relay/hive-relay.sh poll-relay/hive-blocked-relay.sh ./
RUN chmod +x hive-poll.sh hive-relay.sh hive-blocked-relay.sh

# Copy supercronic crontab
COPY poll-relay/crontab ./crontab

CMD ["supercronic", "/app/crontab"]
