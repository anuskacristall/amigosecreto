# 🎁 Amigo Oculto da Família (Mobile-First + Supabase + Render)

Aplicação web estática (**HTML5, CSS3, JavaScript ES Modules e Vite**), projetada estritamente com foco **Mobile-First** (navegador interno do WhatsApp) e **acessibilidade para idosos**, utilizando **Supabase** para persistência permanente e preparada para deploy como **Static Site no Render**.

---

## ✨ Principais Recursos

- **Mobile-First e Acessibilidade para Idosos:**
  - Layout desenhado para celulares (360px–430px) com `min-height: 100dvh` e centralizado em `max-width: 440px` no desktop.
  - Zero poluição visual: apenas 1 pergunta/ação por tela, tipografia grande (`18px+` textos, `21px` botões, `44px` código numérico, `36px–44px` nome sorteado) e botões largos (`min-height: 60px`, `gap: 16px`).
  - Teclado numérico automático no celular (`inputmode="numeric"`, `pattern="[0-9]*"`, `maxlength="2"`, `autocomplete="one-time-code"`).
  - Confetes coloridos (`canvas-confetti`) na tela de revelação mantendo legibilidade total.
- **Algoritmo "Sem Marmelada" (Ciclo Hamiltoniano Único):**
  - Todos os participantes são conectados em **uma única corrente fechada** (`P1 → P2 → P3 → ... → PN → P1`), eliminando subciclos isolados (ex.: A tira B e B tira A).
  - Códigos únicos aleatórios de 2 dígitos (`"00"` a `"99"`).
  - Registros gravados em ordem alfabética (independente do ciclo) para evitar pistas.
- **Painel Administrativo Sem Spoiler (`/admin`):**
  - Protegido por `VITE_ADMIN_PASSWORD`.
  - Cadastro por lista colada (um nome por linha) ou individualmente, com confirmação dupla antes de travar o sorteio.
  - Após o sorteio, a coluna `amigo_sorteado` **não é exibida nem consultada** na tela `/admin`, permitindo que a organizadora também participe sem spoiler.
  - Botão de cópia e envio direto para WhatsApp com convite personalizado + status em tempo real (`✅ Já viu` / `⏳ Pendente`).

---

## 🗄️ 1. Configurar o Banco de Dados (Supabase)

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. No menu lateral, acesse **SQL Editor** → **New query**.
3. Copie e execute todo o conteúdo do arquivo [`supabase/schema.sql`](./supabase/schema.sql).
   - Isso cria a tabela `participantes`, índices, proteção contra alteração pós-sorteio (trigger) e todas as políticas **RLS (Row Level Security)**.
4. Acesse **Project Settings → API** e anote:
   - **Project URL** (`VITE_SUPABASE_URL`)
   - **anon / public key** (`VITE_SUPABASE_ANON_KEY`)

---

## 🚀 2. Deploy como Static Site no Render

1. Suba esta pasta para um repositório no GitHub/GitLab.
2. No [Render](https://render.com), clique em **New + → Static Site** (ou use o Blueprint [`render.yaml`](./render.yaml)).
3. Configure:
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Em **Redirects/Rewrites**, garanta a regra para a rota `/admin` funcionar sem 404:
   - **Source:** `/*`
   - **Destination:** `/index.html`
   - **Action:** `Rewrite`
   *(O arquivo `render.yaml` e `public/_redirects` já deixam isso configurado.)*
5. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_PASSWORD` (senha que você vai usar para entrar em `https://seu-site.onrender.com/admin`)

---

## 💻 3. Rodar Localmente (Opcional)

Requer **Node.js 18+**:

```bash
cp .env.example .env
# Edite o .env com suas chaves do Supabase e sua senha do /admin

npm install
npm run dev
```

- Tela pública dos participantes: `http://localhost:5173/`
- Painel da organizadora: `http://localhost:5173/admin`

---

## 📂 Estrutura do Projeto

```text
amigo-oculto/
├── index.html                  # HTML5 + meta tags WhatsApp (Open Graph)
├── package.json                # Vite, @supabase/supabase-js e canvas-confetti
├── vite.config.js              # Configuração SPA do Vite
├── render.yaml                 # Blueprint pronto para Static Site no Render
├── public/
│   └── _redirects              # Fallback SPA para /admin
├── supabase/
│   └── schema.sql              # Tabela participantes, trigger de proteção e RLS
└── src/
    ├── main.js                 # Roteador leve (/ e /admin)
    ├── styles/
    │   └── main.css            # Design system Mobile-First acessível
    ├── lib/
    │   ├── draw.js             # Ciclo Hamiltoniano único + códigos 00-99
    │   ├── supabase.js         # Cliente Supabase e consultas sem spoiler
    │   ├── confetti.js         # Animação leve de confetes coloridos
    │   └── dom.js              # Escape HTML, clipboard mobile e datas pt-BR
    └── views/
        ├── participantView.js  # Fluxo público em 3 passos (/)
        └── adminView.js        # Painel da organizadora sem spoiler (/admin)
```
