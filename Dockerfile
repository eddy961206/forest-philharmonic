FROM node:22-alpine
WORKDIR /app
COPY server.js package.json ./
COPY server ./server
COPY public ./public
ENV PORT=8080 HOST=0.0.0.0 QUIET=1
EXPOSE 8080
USER node
CMD ["node", "server.js"]
