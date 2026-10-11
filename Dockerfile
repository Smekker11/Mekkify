FROM node:20-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN chmod +x ./docker-init-config.sh

EXPOSE 7887

CMD ["/bin/sh", "-c", "./docker-init-config.sh && node main.js"]
