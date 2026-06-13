FROM node:22-alpine

WORKDIR /app

# 1. Copiar arquivos de dependências (Raiz e Server)
COPY package*.json ./
COPY server/package*.json ./server/

# 2. Instalar dependências
RUN npm install
RUN cd server && npm install

# 3. Copiar todo o código fonte
COPY . .

# 4. Construir o Frontend (Gera a pasta /dist)
#    Vite injeta as VITE_* no bundle em BUILD-TIME. O EasyPanel passa as variáveis
#    do serviço como --build-arg; sem ARG/ENV aqui o frontend buildaria sem o
#    VITE_API_URL e apontaria pra API errada.
ARG VITE_API_URL
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
RUN npm run build

# 5. Expor a porta da API
EXPOSE 3001

# 6. Iniciar o servidor: aplica migrações Drizzle (src/db/migrate.js) e sobe a API.
#    O `npm start` roda `node src/db/migrate.js && node src/index.js` (sem Prisma).
CMD ["npm", "start", "--prefix", "server"]
