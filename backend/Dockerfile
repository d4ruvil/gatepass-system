FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
# Render/Fly inject PORT; server.js reads process.env.PORT.
CMD ["npm", "start"]
