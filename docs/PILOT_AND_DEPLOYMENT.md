# BENIT — Roteiro de piloto

O passo a passo de implantação mudou de lugar:

- **Banco de dados:** `README.md`, seção "Banco de dados" (três passos em `supabase/apply/`).
- **Deploy:** `docs/DEPLOY_VERCEL.md`.
- **Pagamentos e e-mail:** `docs/PAYMENTS_AND_NOTIFICATIONS_SETUP.md`.

## Roteiro de validação com um estabelecimento piloto

1. **Cadastro e onboarding** (`/register` → e-mail de confirmação → `/onboarding`): nome da loja, WhatsApp e endereço do cardápio.
2. **Identidade** (Configurações → Loja): enviar logo e capa, conferir o cardápio público.
3. **Cardápio** (`/menu-manager`): criar 3 a 5 categorias, cadastrar produtos com foto, preço, estoque e adicionais, arrastar para ordenar.
4. **Entrega, horários e pagamentos** (Configurações): bairros com taxa, horários da semana, formas de pagamento; conectar o Mercado Pago se for usar Pix e cartão online.
5. **Equipe** (Configurações → Equipe): convidar um atendente e alguém da cozinha e conferir o que cada um vê.
6. **Pedido de ponta a ponta:** pedir pelo celular em `/menu/<slug>`, ver chegar em **Novos**, confirmar, acompanhar a baixa em **Estoque**, avançar até **Concluído** e conferir a página de acompanhamento do cliente.
7. **Balcão e cancelamento:** lançar um pedido manual, cancelar um pedido confirmado e conferir a volta do estoque.
8. **Isolamento:** com duas lojas piloto, confirmar que uma não enxerga produtos, pedidos, clientes nem estoque da outra.
