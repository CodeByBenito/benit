import type { Metadata } from "next";
import Link from "next/link";
import { Field, LegalSection, LegalShell, LegalTable, ToConfirm } from "@/components/legal/legal-shell";
import { LEGAL_ENTITY } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Quais dados o BENIT coleta, para quê, por quanto tempo e como exercer seus direitos (LGPD).",
  alternates: { canonical: "/privacidade" },
};

/**
 * Privacy policy (LGPD). The data listed here mirrors what the system really
 * stores; update this page whenever a new field or integration is added.
 */
export default function PrivacyPage() {
  const e = LEGAL_ENTITY;
  return (
    <LegalShell
      title="Política de privacidade"
      intro="O BENIT é a plataforma que restaurantes, hamburguerias, pizzarias e cafés usam para receber e gerenciar pedidos. Esta página explica, em linguagem direta, quais dados pessoais passam por aqui, para quê e por quanto tempo."
    >
      <LegalSection id="quem-somos" title="1. Quem trata os seus dados">
        <p>
          O BENIT é operado por <Field value={e.companyName} label="razão social" />, CNPJ <Field value={e.taxId} label="CNPJ" />, com sede em <Field value={e.address} label="endereço" />.
        </p>
        <p>Há dois tipos de pessoa nesta política, e o papel do BENIT muda em cada caso:</p>
        <ul>
          <li>
            <strong>Você tem uma loja no BENIT</strong> (proprietário ou equipe). O BENIT é o <strong>controlador</strong> dos dados da sua conta.
          </li>
          <li>
            <strong>Você fez um pedido em uma loja que usa o BENIT.</strong> A loja é a <strong>controladora</strong> dos seus dados: é ela que decide o que fazer com eles. O BENIT atua como <strong>operador</strong>, tratando os dados em nome da loja para que o pedido funcione.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="dados" title="2. Quais dados coletamos e para quê">
        <p>
          <strong>Se você pediu em uma loja:</strong>
        </p>
        <LegalTable
          caption="Dados de quem faz um pedido"
          head={["Dado", "Para quê", "Base legal (LGPD)"]}
          rows={[
            ["Nome e telefone (WhatsApp)", "Identificar o pedido, avisar sobre o andamento e permitir que a loja fale com você.", "Execução de contrato (art. 7º, V)"],
            ["Endereço de entrega (rua, número, bairro, complemento, referência)", "Entregar o pedido e calcular a taxa do bairro. Só é pedido em pedidos para entrega.", "Execução de contrato (art. 7º, V)"],
            ["Itens, observações, valores e forma de pagamento", "Preparar o pedido, cobrar o valor certo e manter o histórico da loja.", "Execução de contrato e obrigação legal da loja (art. 7º, II e V)"],
            ["E-mail e documento informados no pagamento com cartão", "São enviados ao Mercado Pago para processar o pagamento. O BENIT não guarda o documento.", "Execução de contrato (art. 7º, V)"],
            ["Endereço IP, em forma de código irreversível (hash)", "Impedir abuso do formulário de pedidos (limite de tentativas).", "Legítimo interesse (art. 7º, IX)"],
          ]}
        />
        <p>
          <strong>Os dados do seu cartão nunca passam pelos servidores do BENIT.</strong> O número é digitado em um componente do Mercado Pago, que devolve apenas um código de uso único.
        </p>
        <p>
          <strong>Se você tem uma loja ou trabalha em uma:</strong>
        </p>
        <LegalTable
          caption="Dados de lojistas e equipe"
          head={["Dado", "Para quê", "Base legal (LGPD)"]}
          rows={[
            ["Nome, e-mail, telefone e senha (guardada de forma irreversível)", "Criar a conta, autenticar o acesso e enviar avisos do serviço.", "Execução de contrato (art. 7º, V)"],
            ["Dados da loja: nome, endereço, telefone, logo, cardápio, horários e bairros", "Publicar o cardápio e operar os pedidos.", "Execução de contrato (art. 7º, V)"],
            ["Equipe: e-mail e papel de cada pessoa convidada", "Dar a cada pessoa o acesso que o proprietário definiu.", "Execução de contrato (art. 7º, V)"],
            ["Conexão com o Mercado Pago: identificador da conta e chaves de acesso cifradas", "Permitir que os pagamentos online caiam direto na conta da loja.", "Execução de contrato (art. 7º, V)"],
            ["Registros de acesso (data, hora e IP)", "Segurança e cumprimento do Marco Civil da Internet.", "Obrigação legal (art. 7º, II)"],
          ]}
        />
        <p>O BENIT não usa seus dados para publicidade, não vende dados e não cria perfis de consumo para terceiros.</p>
      </LegalSection>

      <LegalSection id="navegador" title="3. O que fica no seu navegador">
        <ul>
          <li>
            <strong>Cookies de sessão</strong>, só para quem entra no painel: mantêm o login e lembram qual loja está aberta. São necessários ao funcionamento e não rastreiam navegação.
          </li>
          <li>
            <strong>Armazenamento local do cardápio</strong>: a sacola e os dados que você digitou no último pedido (nome, telefone e endereço) ficam salvos no seu próprio aparelho, para você não precisar digitar de novo. Limpar os dados do navegador apaga tudo.
          </li>
        </ul>
        <p>Não há cookies de publicidade nem ferramentas de rastreamento de terceiros.</p>
      </LegalSection>

      <LegalSection id="compartilhamento" title="4. Com quem os dados são compartilhados">
        <p>Somente com quem é necessário para o serviço funcionar:</p>
        <ul>
          <li>
            <strong>A loja em que você pediu</strong>, que recebe o pedido completo.
          </li>
          <li>
            <strong>Mercado Pago</strong>, quando você paga online: recebe o valor, a descrição do pedido e os dados de pagamento.
          </li>
          <li>
            <strong>Fornecedores de infraestrutura</strong> que hospedam e operam o sistema: Supabase (banco de dados, autenticação e arquivos), Vercel (hospedagem do site) e Resend (envio de e-mails). Parte deles pode processar dados fora do Brasil; nesses casos a transferência segue as garantias previstas na LGPD (art. 33). <ToConfirm>Cláusulas contratuais com cada fornecedor</ToConfirm>
          </li>
          <li>
            <strong>Autoridades</strong>, quando houver ordem legal ou judicial.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="prazos" title="5. Por quanto tempo guardamos">
        <LegalTable
          caption="Prazos de retenção"
          head={["Dado", "Prazo"]}
          rows={[
            ["Conta do lojista e dados da loja", <ToConfirm key="a">Enquanto a conta estiver ativa e por até 6 meses após o encerramento</ToConfirm>],
            ["Pedidos e cadastro de clientes da loja", <ToConfirm key="b">Enquanto a loja mantiver a conta; depois, excluídos ou anonimizados em até 90 dias, salvo guarda exigida por lei</ToConfirm>],
            ["Registros de acesso", <ToConfirm key="c">6 meses, como exige o Marco Civil da Internet (Lei 12.965/2014, art. 15)</ToConfirm>],
            ["Código do endereço IP usado no limite de tentativas", "Descartado em cerca de 1 dia"],
            ["Página de acompanhamento do pedido", "Acessível só por um link secreto; não exibe nome, telefone nem endereço"],
          ]}
        />
        <p>A loja pode ter obrigações próprias de guarda, como as fiscais, e manter registros pelo prazo que a lei determinar.</p>
      </LegalSection>

      <LegalSection id="seguranca" title="6. Como protegemos">
        <ul>
          <li>Cada loja só enxerga os próprios dados: o isolamento é aplicado no banco de dados, e não apenas na tela.</li>
          <li>Conexões cifradas (HTTPS) em todo o site.</li>
          <li>As chaves de acesso ao Mercado Pago de cada loja ficam cifradas e só são lidas pelo servidor.</li>
          <li>Cada pessoa da equipe vê apenas o que o papel dela permite. A cozinha, por exemplo, não vê telefone, endereço nem valores.</li>
        </ul>
        <p>Nenhum sistema é imune a falhas. Se ocorrer um incidente que possa causar risco ou dano relevante, os titulares e a ANPD serão comunicados, como determina a LGPD (art. 48).</p>
      </LegalSection>

      <LegalSection id="direitos" title="7. Seus direitos">
        <p>A LGPD (art. 18) garante a você, a qualquer momento:</p>
        <ul>
          <li>confirmar se tratamos seus dados e acessar uma cópia deles;</li>
          <li>corrigir dados incompletos, inexatos ou desatualizados;</li>
          <li>pedir a anonimização, o bloqueio ou a exclusão de dados desnecessários ou tratados em desacordo com a lei;</li>
          <li>pedir a portabilidade;</li>
          <li>saber com quem os dados foram compartilhados;</li>
          <li>revogar um consentimento e se opor a um tratamento.</li>
        </ul>
        <p>
          <strong>Fez um pedido em uma loja?</strong> Fale primeiro com a loja, que é a controladora dos seus dados; o BENIT ajuda a loja a atender o seu pedido. <strong>Tem uma conta no BENIT?</strong> Fale direto com o nosso encarregado.
        </p>
      </LegalSection>

      <LegalSection id="encarregado" title="8. Encarregado e contato">
        <p>
          Encarregado pelo tratamento de dados pessoais (DPO): <Field value={e.dpoName} label="nome do encarregado" />.
          <br />
          E-mail: <Field value={e.dpoEmail} label="e-mail do encarregado" />.
        </p>
        <p>
          Respondemos em até <ToConfirm>15 dias</ToConfirm>. Se a resposta não resolver, você pode recorrer à Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </LegalSection>

      <LegalSection id="mudancas" title="9. Mudanças nesta política">
        <p>
          Quando esta política mudar, a data no topo da página é atualizada. Mudanças relevantes são avisadas por e-mail a quem tem conta. Veja também os <Link href="/termos">Termos de uso</Link>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
