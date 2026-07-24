FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY dist ./dist
COPY server ./server

# 关键：删除随代码复制进来的 node_modules，在容器 Linux 环境下重新安装
RUN cd server && rm -rf node_modules && npm install --legacy-peer-deps && npm run build

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
