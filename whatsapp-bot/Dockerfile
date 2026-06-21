FROM node:20-slim

# Chromium runtime libraries for whatsapp-web.js (Puppeteer).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
    libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcomposite1 \
    libxdamage1 libxext6 libxfixes3 libxrandr2 libxkbcommon0 wget xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# The WhatsApp session is stored in /app/auth — mount a volume so it survives restarts:
#   docker run -v $PWD/auth:/app/auth --env-file .env whatsapp-bot
CMD ["npm", "start"]
