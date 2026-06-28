# Greyhound Validator

Sistema de analise de corridas de galgos para apostas AvB.

## Instalacao

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variaveis de ambiente
Copie o arquivo `.env.example` para `.env` e preencha:
```bash
cp .env.example .env
```

Edite o `.env`:
```
ANTHROPIC_API_KEY=sk-ant-sua-chave-aqui
SESSION_SECRET=qualquer-texto-aleatorio-aqui
PORT=3000
BASE_PATH=/greyhound
```

### 3. Adicionar o logo
Coloque o arquivo `logo.png` dentro da pasta `public/img/`.

### 4. Rodar localmente
```bash
npm run dev
```

Acesse: http://localhost:3000/greyhound

## Deploy no Railway

### 1. Criar conta no Railway
Acesse https://railway.app e entre com sua conta GitHub.

### 2. Criar novo projeto
- Clique em "New Project"
- Selecione "Deploy from GitHub repo"
- Selecione o repositorio greyhound-validator

### 3. Adicionar variaveis de ambiente no Railway
No painel do Railway, va em "Variables" e adicione:
- ANTHROPIC_API_KEY = sua chave
- SESSION_SECRET = texto aleatorio
- PORT = 3000
- BASE_PATH = /greyhound

### 4. Configurar dominio no Railway
- Va em "Settings" > "Networking"
- Gere um dominio publico

### 5. Configurar no Cloudflare (brunovaes.com.br)
- Va em cloudflare.com
- Selecione o dominio brunovaes.com.br
- Va em DNS > Add record
- Tipo: CNAME
- Name: @ (ou www)
- Target: seu-projeto.railway.app
- Proxy: ON (laranja)

## Estrutura do projeto
```
greyhound/
  src/
    server.js          - Servidor Express principal
    db/
      database.js      - Banco de dados SQLite
    routes/
      main.js          - Paginas principais
      api.js           - API de analise e sessoes
      config.js        - Painel de configuracoes
  public/
    img/
      logo.png         - Logo do sistema (adicionar manualmente)
  .env                 - Variaveis de ambiente (criar a partir do .env.example)
  package.json
```

## Paginas disponiveis
- `/greyhound` - Pagina principal de analise
- `/greyhound/historico` - Historico de sessoes
- `/greyhound/sessao/:id` - Detalhes de uma sessao
- `/greyhound/config` - Configuracoes de analise
