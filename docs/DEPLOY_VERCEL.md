# Deploy na Vercel

Passo a passo para colocar o BENIT no ar com Vercel + Supabase. Siga na ordem. O banco (migrations `0001` em diante) precisa estar aplicado antes; veja o `README.md`.

## 1. Criar o projeto

1. Em <https://vercel.com/new>, importe o repositório do BENIT.
2. Framework: **Next.js** (detectado sozinho). Não mude os comandos de build.
3. Antes do primeiro deploy, preencha as variáveis do passo 2.

## 2. Variáveis de ambiente

Cadastre em **Settings → Environment Variables**, nos ambientes *Production* e *Preview*. A lista espelha o `.env.example`.

| Variável | Obrigatória | Onde conseguir | Observação |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | Supabase → Project Settings → API | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Supabase → Project Settings → API | Pode ir ao navegador: `anon` não lê nenhuma tabela direto. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Supabase → Project Settings → API | **Só servidor.** Usada pelo webhook, pagamentos, crons e convites da equipe. Marque como *Sensitive*. |
| `NEXT_PUBLIC_APP_URL` | Sim | O domínio final, com `https://` e sem barra no fim | Entra nos links dos e-mails, no retorno do Mercado Pago, no sitemap e nas imagens de compartilhamento. |
| `NEXT_PUBLIC_SALES_WHATSAPP` | Recomendada | Número do time comercial, só dígitos com DDD | Enquanto vazia, o botão principal da landing leva ao cadastro. |
| `MP_CLIENT_ID` | Para pagamento online | Painel de desenvolvedores do Mercado Pago | |
| `MP_CLIENT_SECRET` | Para pagamento online | Idem | *Sensitive*. |
| `MP_WEBHOOK_SECRET` | Para pagamento online | Mercado Pago → Webhooks → assinatura secreta | *Sensitive*. Sem ela o webhook recusa tudo. |
| `TOKEN_ENC_KEY` | Para pagamento online | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` | *Sensitive*. Cifra os tokens das lojas. **Não troque depois**: as lojas teriam de reconectar. |
| `RESEND_API_KEY` | Para e-mails | <https://resend.com> | *Sensitive*. Sem ela os e-mails do app são ignorados e nada quebra. |
| `EMAIL_FROM` | Para e-mails | Ex.: `BENIT <no-reply@seu-dominio.com.br>` | O domínio precisa estar verificado no Resend. |
| `CRON_SECRET` | Sim | Qualquer texto longo e aleatório | A Vercel envia `Authorization: Bearer <CRON_SECRET>` aos crons. Sem ela as rotas de cron respondem 401. |

Não cadastre `MP_API_BASE_URL` em produção. Ela existe só para apontar os testes ao stub local.

Mudou uma variável `NEXT_PUBLIC_*`? Faça um novo deploy: elas entram no bundle em tempo de build.

## 3. Supabase Auth

Sem este passo, os links de "confirmar e-mail", "redefinir senha" e "convite da equipe" não funcionam em produção.

### 3.1 URLs

Em **Authentication → URL Configuration**:

- **Site URL:** o mesmo valor de `NEXT_PUBLIC_APP_URL` (ex.: `https://app.seudominio.com.br`).
- **Redirect URLs:** adicione
  - `https://app.seudominio.com.br/auth/callback`
  - `https://*-seu-time.vercel.app/auth/callback` (opcional, para os deploys de preview)
  - `http://localhost:3000/auth/callback` (desenvolvimento)

Todo link de e-mail cai em `/auth/callback`, que cria a sessão e leva a pessoa ao destino: `/onboarding` depois do cadastro, `/reset-password` na recuperação de senha e `/reset-password` também no convite (o convidado define a própria senha).

### 3.2 SMTP pelo Resend

Em **Authentication → SMTP Settings**, ative *Custom SMTP*:

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Porta | `465` |
| Usuário | `resend` |
| Senha | a `RESEND_API_KEY` |
| Sender email | o endereço de `EMAIL_FROM` |
| Sender name | `BENIT` |

Sem SMTP próprio o Supabase limita o envio a poucos e-mails por hora e só entrega para membros do projeto. Não abra para clientes reais assim.

### 3.3 Modelos de e-mail

Em **Authentication → Email Templates**, traduza os textos e troque o link de cada modelo. O formato com `token_hash` funciona mesmo quando a pessoa abre o e-mail em outro aparelho; o link padrão (`{{ .ConfirmationURL }}`) só funciona no navegador em que o pedido foi feito.

| Modelo | Link a usar no botão |
|---|---|
| Confirm signup | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/onboarding` |
| Reset password | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` |
| Invite user | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/reset-password` |
| Magic link (não usado hoje) | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink` |

### 3.4 Outros ajustes

- **Authentication → Providers → Email:** mantenha *Confirm email* ligado e defina o tamanho mínimo de senha como **8** (o mesmo que o app valida).
- **Authentication → Rate Limits:** com SMTP próprio, suba o limite de e-mails por hora conforme o volume esperado.

## 4. Domínios

1. Vercel → **Settings → Domains** → adicione o domínio (ex.: `app.seudominio.com.br`).
2. No seu provedor de DNS, crie o registro que a Vercel indicar: `CNAME` para subdomínio, ou `A` para o domínio raiz. O certificado HTTPS sai sozinho.
3. Atualize, com o domínio final:
   - `NEXT_PUBLIC_APP_URL` na Vercel (e faça um novo deploy);
   - **Site URL** e **Redirect URLs** no Supabase (passo 3.1);
   - no Mercado Pago, a **Redirect URL** `https://SEU-DOMINIO/api/integrations/mercadopago/callback` e a URL de **Webhooks** `https://SEU-DOMINIO/api/webhooks/mercadopago`;
   - no Resend, verifique o domínio do remetente (registros SPF e DKIM).
4. Se usar `www` e raiz, escolha um como principal e deixe a Vercel redirecionar o outro.

## 5. Crons

O `vercel.json` agenda duas rotas, ambas uma vez por dia (o plano Hobby da Vercel não aceita frequência maior):

| Rota | Horário (UTC) | Função |
|---|---|---|
| `/api/cron/expire` | 05:00 | Reserva. Cancela pedidos online não pagos. |
| `/api/cron/mp-refresh` | 06:00 | Renova os tokens do Mercado Pago que vencem em até 7 dias. |

A expiração de pedidos **não depende** do cron da Vercel: ela roda a cada minuto dentro do banco, pelo `pg_cron` (migration `0007`). Confirme em Supabase → **Database → Extensions** que `pg_cron` está ativo e, em **Integrations → Cron**, que o job `benit-expire-unpaid-orders` aparece.

## 6. Conferência depois do deploy

- [ ] A landing abre no domínio final e o botão principal leva ao WhatsApp de vendas.
- [ ] `/robots.txt` e `/sitemap.xml` respondem com o domínio certo.
- [ ] Colar o link da landing e de um cardápio no WhatsApp mostra a imagem de compartilhamento.
- [ ] Criar uma conta: o e-mail chega pelo seu domínio, o link abre `/onboarding`.
- [ ] "Esqueci a senha": o link abre `/reset-password` e a nova senha funciona.
- [ ] Convidar um membro em Configurações → Equipe: o convite chega e a pessoa define a senha.
- [ ] Conectar o Mercado Pago em Configurações → Pagamentos e fazer um Pix de teste.
- [ ] `/dev/painel` responde 404 em produção.
- [ ] Vercel → **Cron Jobs** mostra as duas rotas; rode cada uma manualmente e veja resposta 200.
