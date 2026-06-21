FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# The WhatsApp session is stored in /app/auth — mount a volume so it survives restarts:
#   docker run -v $PWD/auth:/app/auth --env-file .env whatsapp-bot
CMD ["npm", "start"]
