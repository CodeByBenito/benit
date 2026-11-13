import type { Metadata } from "next";
import Link from "next/link";
import { Field, LegalSection, LegalShell, ToConfirm } from "@/components/legal/legal-shell";
import { LEGAL_ENTITY } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "As regras de uso do BENIT para estabelecimentos e para quem faz pedidos.",
  alternates: { canonical: "/termos" },
};

export default function TermsPage() {
  const e = LEGAL_ENTITY;
  return (
    <LegalShell
      title="Termos de uso"
      intro="Estas são as regras para usar o BENIT, a plataforma de cardápio digital, pedidos e estoque para negócios de alimentação. Ao criar uma conta ou fazer um pedido, você concorda com elas."
    >
      <LegalSection id="partes" title="1. Quem somos e a quem estes termos se aplicam">
        <p>
          O BENIT é oferecido por <Field value={e.companyName} label="razão social" />, CNPJ <Field value={e.taxId} label="CNPJ" />, com sede em <Field value={e.address} label="endereço" />.
        </p>
        <p>
          Chamamos de <strong>estabelecimento</strong> o negócio que usa o painel do BENIT, e de <strong>cliente</strong> a pessoa que faz um pedido pelo cardápio de um estabelecimento.
        </p>
      </LegalSection>

      <LegalSection id="servico" title="2. O que o BENIT faz, e o que não faz">
        <p>O BENIT fornece ao estabelecimento um cardápio digital, um quadro de pedidos em tempo real, controle de estoque, cadastro de clientes e a ligação com o Mercado Pago para pagamentos online.</p>
        <p>
          <strong>O BENIT é uma ferramenta, não o vendedor.</strong> A venda acontece entre o cliente e o estabelecimento. O estabelecimento é o único responsável pelos produtos, preços, promoções, preparo, entrega, atendimento, emissão de documentos fiscais e cumprimento das normas sanitárias e de defesa do consumidor.
        </p>
      </LegalSection>

      <LegalSection id="conta" title="3. Conta do estabelecimento">
        <ul>
          <li>Os dados do cadastro devem ser verdadeiros e mantidos em dia.</li>
          <li>O proprietário escolhe quem entra na equipe e com qual papel, e responde pelo que essas pessoas fazem no painel.</li>
          <li>A senha é pessoal. Avise-nos se suspeitar de uso indevido da conta.</li>
          <li>É preciso ter 18 anos ou mais e poderes para representar o negócio.</li>
        </ul>
      </LegalSection>

      <LegalSection id="pagamentos" title="4. Pagamentos">
        <p>
          Os pagamentos online (Pix e cartão) são processados pelo <strong>Mercado Pago</strong>, na conta que o próprio estabelecimento conecta ao BENIT. O dinheiro vai direto para essa conta: <strong>o BENIT não recebe, não guarda e não repassa valores dos pedidos.</strong>
        </p>
        <ul>
          <li>Tarifas, prazos de recebimento, contestações e bloqueios seguem as regras do Mercado Pago, aceitas pelo estabelecimento ao criar a conta lá.</li>
          <li>Um pedido pago online e cancelado é estornado automaticamente pelo mesmo meio de pagamento. Se o estorno automático falhar, o estabelecimento deve fazê-lo pelo painel do Mercado Pago.</li>
          <li>Pagamentos feitos na entrega (dinheiro, cartão ou Pix direto) são combinados e recebidos pelo estabelecimento, sem participação do BENIT.</li>
        </ul>
      </LegalSection>

      <LegalSection id="precos" title="5. Condições comerciais">
        <p>
          <ToConfirm>As condições comerciais do uso do BENIT pelo estabelecimento são combinadas diretamente com o nosso time e valem conforme a proposta aceita.</ToConfirm> O cliente que faz um pedido não paga nada ao BENIT.
        </p>
      </LegalSection>

      <LegalSection id="uso" title="6. Uso aceitável">
        <p>Não é permitido usar o BENIT para:</p>
        <ul>
          <li>vender produtos proibidos por lei ou sem as licenças exigidas;</li>
          <li>publicar conteúdo falso, ofensivo ou que viole direitos de terceiros, inclusive fotos e marcas sem autorização;</li>
          <li>enviar pedidos falsos, automatizados ou em volume abusivo;</li>
          <li>tentar acessar dados de outras lojas, burlar limites ou comprometer a segurança do sistema.</li>
        </ul>
        <p>Podemos suspender uma conta ou bloquear pedidos em caso de violação, fraude ou risco para outros usuários.</p>
      </LegalSection>

      <LegalSection id="dados" title="7. Dados pessoais">
        <p>
          O tratamento de dados pessoais segue a <Link href="/privacidade">Política de privacidade</Link>. Em resumo: o estabelecimento é o controlador dos dados dos seus clientes e deve usá-los apenas para atender os pedidos e cumprir a lei; o BENIT trata esses dados em nome do estabelecimento, como operador.
        </p>
      </LegalSection>

      <LegalSection id="disponibilidade" title="8. Disponibilidade e suporte">
        <p>Trabalhamos para manter o BENIT no ar o tempo todo, mas ele depende de serviços de terceiros (hospedagem, banco de dados, Mercado Pago, operadoras) e pode ficar indisponível em manutenções ou falhas. Não garantimos funcionamento ininterrupto.</p>
        <p>O estabelecimento deve ter um plano para continuar atendendo se a internet ou o sistema caírem, como anotar pedidos manualmente.</p>
      </LegalSection>

      <LegalSection id="propriedade" title="9. Propriedade intelectual">
        <p>O software, a marca e o visual do BENIT pertencem ao BENIT. O cardápio, as fotos, a marca e os dados do estabelecimento continuam sendo dele; ao publicá-los, o estabelecimento nos autoriza a exibi-los para o funcionamento do serviço.</p>
      </LegalSection>

      <LegalSection id="responsabilidade" title="10. Limites de responsabilidade">
        <p>
          <ToConfirm>Na medida permitida pela lei, o BENIT não responde por problemas na relação entre estabelecimento e cliente (qualidade, atraso, erro de pedido, cobrança), por falhas de serviços de terceiros, nem por lucros cessantes. Nada nestes termos limita direitos que a lei garante ao consumidor.</ToConfirm>
        </p>
      </LegalSection>

      <LegalSection id="encerramento" title="11. Encerramento">
        <p>O estabelecimento pode encerrar a conta quando quiser, pedindo ao nosso time. Depois do encerramento, o cardápio sai do ar e os dados são tratados conforme os prazos da Política de privacidade.</p>
      </LegalSection>

      <LegalSection id="mudancas" title="12. Mudanças nestes termos">
        <p>Podemos atualizar estes termos. A data no topo da página indica a versão em vigor, e mudanças relevantes são avisadas por e-mail a quem tem conta. Continuar usando o BENIT depois do aviso significa concordar com a nova versão.</p>
      </LegalSection>

      <LegalSection id="foro" title="13. Lei e foro">
        <p>
          Estes termos são regidos pelas leis do Brasil. Fica eleito o foro de <Field value={e.jurisdiction} label="comarca" />, sem prejuízo do direito do consumidor de acionar o foro do seu domicílio.
        </p>
      </LegalSection>

      <LegalSection id="contato" title="14. Contato">
        <p>
          Dúvidas sobre estes termos: <Field value={e.dpoEmail} label="e-mail de contato" />.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
