FROM node:22-alpine
WORKDIR /app
COPY server.js package.json ./
COPY server ./server
COPY public ./public
ENV PORT=8080 HOST=0.0.0.0 QUIET=1
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/rooms').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "server.js"]
