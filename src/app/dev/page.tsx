import Link from "next/link";
import { notFound } from "next/navigation";

const GROUPS: { title: string; links: [string, string][] }[] = [
  {
    title: "Painel",
    links: [
      ["/dev/painel/visao-geral", "Visão geral"],
      ["/dev/painel/visao-geral?estado=novo", "Visão geral · loja recém-criada"],
      ["/dev/painel/visao-geral?estado=mp", "Visão geral · aviso do Mercado Pago"],
      ["/dev/painel", "Pedidos (quadro)"],
      ["/dev/painel/cozinha", "Pedidos · modo cozinha"],
      ["/dev/painel/cardapio", "Cardápio"],
      ["/dev/painel/estoque", "Estoque"],
      ["/dev/painel/clientes", "Clientes"],
    ],
  },
  {
    title: "Configurações",
    links: [
      ["/dev/painel/configuracoes?tab=loja", "Loja (upload de logo e capa)"],
      ["/dev/painel/configuracoes?tab=payments", "Pagamentos"],
      ["/dev/painel/configuracoes?tab=delivery", "Entrega"],
      ["/dev/painel/configuracoes?tab=hours", "Horários"],
      ["/dev/painel/configuracoes?tab=coupons", "Cupons"],
      ["/dev/painel/configuracoes?tab=team", "Equipe (proprietário)"],
      ["/dev/painel/configuracoes?tab=team&as=manager", "Equipe (gerente, só leitura)"],
    ],
  },
  {
    title: "Papéis",
    links: [
      ["/dev/painel?role=ATTENDANT", "Menu do atendente"],
      ["/dev/painel/clientes?role=ATTENDANT", "Clientes como atendente"],
      ["/dev/painel/cozinha", "Menu e quadro da cozinha"],
    ],
  },
  {
    title: "Cliente final e contas",
    links: [
      ["/dev/menu", "Cardápio público"],
      ["/dev/pedido/awaiting_payment", "Acompanhamento · aguardando Pix"],
      ["/dev/pedido/preparing", "Acompanhamento · em preparo"],
      ["/dev/auth/nova-senha", "Nova senha"],
      ["/dev/og/loja", "Imagem de compartilhamento da loja"],
    ],
  },
];

/** Development-only index of every design preview. All of them use fictional data. */
export default function DevIndex() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <p className="eyebrow mb-2">Só em desenvolvimento</p>
      <h1 className="font-display text-display-md font-extrabold">Prévias</h1>
      <p className="mt-2 text-sm text-foreground-muted">Telas com dados fictícios, sem banco. Estas rotas respondem 404 em produção.</p>
      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h2 className="font-display text-base font-bold">{group.title}</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {group.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-foreground-muted underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-brand">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
