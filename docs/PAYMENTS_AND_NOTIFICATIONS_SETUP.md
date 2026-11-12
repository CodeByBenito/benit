# Pagamentos, entrega e notificações — guia de ativação

Este guia leva o BENIT do código ao ar com pagamento online real. Siga na ordem.

## 1. Banco de dados

Aplique as migrations **uma de cada vez, na ordem**, no SQL Editor do Supabase (ou `supabase db push`):

| Arquivo | O que faz |
|---|---|
| `0004_order_status_awaiting_payment.sql` | Adiciona o status `AWAITING_PAYMENT`. **Precisa rodar sozinho** (limitação do Postgres com enums). |
| `0005_checkout_payments_schema.sql` | Tabelas de horários, bairros, cupons, pagamentos, contas Mercado Pago, webhooks; colunas novas em `stores` e `orders`; RLS e triggers de proteção. |
| `0006_checkout_payments_rpcs.sql` | Regras de negócio: checkout com taxa/cupom/mínimo/horário calculados no servidor, máquina de estados do pagamento, expiração. Remove a versão antiga de `create_order_atomic`. |
| `0007_tracking_realtime_cron.sql` | Página pública de acompanhamento, broadcast em tempo real e agendamento da expiração (pg_cron). |

Depois, em **Database → Extensions**, confirme que `pg_cron` está ativo. Se não puder ativar, a rota `/api/cron/expire` faz o mesmo trabalho (ver passo 5).

Validação local, sem tocar no seu projeto: `npm test` roda todas as migrations num Postgres embutido (PGlite) e verifica as regras.

## 2. Mercado Pago (dinheiro direto na conta de cada restaurante)

1. Em <https://www.mercadopago.com.br/developers/panel/app> crie uma aplicação do tipo **Pagamentos online / marketplace** com OAuth.
2. **Redirect URL:** `https://SEU-DOMINIO/api/integrations/mercadopago/callback`
3. **Webhooks → Notificações:** URL `https://SEU-DOMINIO/api/webhooks/mercadopago`, evento **Pagamentos**. Copie a *assinatura secreta*.
4. Preencha `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET` e gere `TOKEN_ENC_KEY` (comando no `.env.example`).
5. No painel do BENIT, cada lojista vai em **Configurações → Pagamentos → Conectar Mercado Pago** e depois ativa "Aceitar pagamento online".

Como funciona:

- O pedido online nasce como **Aguardando pagamento** e não aparece no quadro nem baixa estoque.
- O webhook é validado pela assinatura HMAC. O servidor consulta o pagamento no Mercado Pago com o token da própria loja e só então aplica o resultado. O corpo da notificação nunca é usado como fonte da verdade.
- Na aprovação, o estoque é reservado. Se algum item acabou, o pedido é cancelado e o **estorno é automático**.
- Pedido não pago dentro do prazo (padrão de 15 minutos, configurável) é cancelado sozinho, e o cupom volta a ficar disponível.
- Quando a loja cancela um pedido já pago, o estorno também é automático. Se o estorno falhar, isso aparece no histórico do pedido.
- Os tokens das lojas ficam cifrados (AES-256-GCM) numa tabela que só o servidor lê. São renovados automaticamente.

## 3. E-mail (Resend)

1. Crie a conta em <https://resend.com>, verifique o domínio e gere `RESEND_API_KEY`. Defina `EMAIL_FROM`.
2. O BENIT envia o e-mail de boas-vindas (no fim do onboarding) e o aviso de novo pedido ao proprietário. Este último pode ser desligado em Configurações → Pagamentos → Avisos.
3. **E-mails de login e de redefinição de senha** são do Supabase Auth. Para saírem pelo seu domínio:
   - Supabase → **Authentication → SMTP Settings**:
     - host `smtp.resend.com`
     - porta `465`
     - usuário `resend`
     - senha = `RESEND_API_KEY`
     - remetente = o mesmo de `EMAIL_FROM`
   - Em **Email Templates**, traduza os textos de "Reset Password" e "Confirm signup" para português.
   - Em **URL Configuration**, defina `Site URL` como `NEXT_PUBLIC_APP_URL`.

Sem `RESEND_API_KEY`, os e-mails são simplesmente ignorados. Nada quebra.

## 4. WhatsApp

- **Para o cliente final:** no detalhe de cada pedido, o botão "Avisar no WhatsApp" abre o WhatsApp do lojista com a mensagem pronta para aquele status e o link de acompanhamento. Não tem custo nem exige aprovação da Meta.
- **Página de acompanhamento** (`/pedido/<token>`): o cliente vê o pedido mudar de etapa ao vivo. O token tem 256 bits e a página não mostra nome, telefone nem endereço.
- **Landing:** defina `NEXT_PUBLIC_SALES_WHATSAPP`. Enquanto estiver vazio, o botão principal leva para o cadastro.

## 5. Crons

`vercel.json` agenda:

- `/api/cron/expire` uma vez por dia. É só uma reserva: a expiração de pedidos roda a cada minuto no banco, pelo pg_cron. O plano Hobby da Vercel não aceita cron mais frequente que diário.
- `/api/cron/mp-refresh` diariamente, para renovar os tokens do Mercado Pago.

Defina `CRON_SECRET` no projeto da Vercel. O passo a passo completo do deploy está em `docs/DEPLOY_VERCEL.md`.

## 6. Conferência antes de abrir para clientes

- [ ] `npm test` verde (banco e unidades) e `npm run build` verde
- [ ] Migrations 0004–0007 aplicadas; `pg_cron` ativo ou cron da Vercel configurado
- [ ] Pedido de teste com Pix em **conta de teste** do Mercado Pago: aprovado entra no quadro; expirado se cancela sozinho
- [ ] Cancelar um pedido pago e ver o estorno no Mercado Pago
- [ ] E-mail de redefinição de senha chegando pelo seu domínio
- [ ] `NEXT_PUBLIC_SALES_WHATSAPP` preenchido
