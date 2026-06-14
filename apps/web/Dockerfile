# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
ENV CI=true

FROM base AS deps
COPY package*.json ./
RUN npm install

FROM base AS build
ARG VITE_API_BASE_URL=http://localhost:8080
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_ENABLE_MARKDOWN_QA=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_ENABLE_MARKDOWN_QA=$VITE_ENABLE_MARKDOWN_QA
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
