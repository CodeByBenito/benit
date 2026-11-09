"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createOrderAction } from "@/features/orders/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { MoneyInput, FormMessage } from "@/components/settings/shared";
import { formatCurrencyCents } from "@/lib/utils";
import type { FulfillmentType, Product } from "@/types/domain.types";

type Line = { productId: string; quantity: number; notes: string };

export function ManualOrderDialog({
  open,
  onOpenChange,
  storeId,
  products,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  storeId: string;
  products: Product[];
  onCreated: () => void;
}) {
  const available = products.filter((p) => p.is_available);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fulfillment, setFulfillment] = useState<FulfillmentType>("DINE_IN");
  const [table, setTable] = useState("");
  const [status, setStatus] = useState<"CONFIRMED" | "NEW">("CONFIRMED");
  const [payment, setPayment] = useState<"CASH" | "CARD_ON_DELIVERY" | "PIX_MANUAL">("CARD_ON_DELIVERY");
  const [discount, setDiscount] = useState(0);
  const [fee, setFee] = useState(0);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: available[0]?.id ?? "", quantity: 1, notes: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const idem = useRef(`man-${crypto.randomUUID?.() ?? Date.now()}`);

  const subtotal = useMemo(
    () => lines.reduce((n, l) => n + (products.find((p) => p.id === l.productId)?.price_cents ?? 0) * l.quantity, 0),
    [lines, products]
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const valid = lines.filter((l) => l.productId && l.quantity > 0);
    if (!valid.length) return setError("Adicione pelo menos um produto.");
    start(async () => {
      const res = await createOrderAction({
        storeId,
        source: "MANUAL",
        fulfillmentType: fulfillment,
        customerName: name,
        customerPhone: phone,
        tableOrReference: table || undefined,
        notes: notes || undefined,
        discountCents: discount,
        feeCents: fee,
        initialStatus: status,
        paymentMethod: payment,
        idempotencyKey: idem.current,
        items: valid.map((l) => ({ product_id: l.productId, quantity: l.quantity, option_ids: [], notes: l.notes || undefined })),
      });
      if (!res.success) return setError(res.error ?? "Não foi possível registrar.");
      toast.success(`Pedido #${res.data?.order_number} registrado.`);
      idem.current = `man-${crypto.randomUUID?.() ?? Date.now()}`;
      setName("");
      setPhone("");
      setTable("");
      setNotes("");
      setLines([{ productId: available[0]?.id ?? "", quantity: 1, notes: "" }]);
      onOpenChange(false);
      onCreated();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo pedido no balcão</DialogTitle>
          <DialogDescription>Para pedidos feitos por telefone, WhatsApp ou presencialmente.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mn">Cliente</Label>
              <Input id="mn" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp">Telefone / WhatsApp</Label>
              <Input id="mp" required inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <Segmented
              name="Atendimento"
              value={fulfillment}
              onChange={setFulfillment}
              options={[
                { value: "DINE_IN", label: "Mesa" },
                { value: "PICKUP", label: "Retirada" },
                { value: "DELIVERY", label: "Entrega" },
              ]}
            />
            <Input aria-label="Mesa ou referência" placeholder={fulfillment === "DINE_IN" ? "Mesa" : "Referência"} value={table} onChange={(e) => setTable(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Itens</Label>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_72px_1fr_36px] gap-2">
                <Select value={l.productId} onValueChange={(v) => setLines(lines.map((x, k) => (k === i ? { ...x, productId: v } : x)))}>
                  <SelectTrigger aria-label="Produto">
                    <SelectValue placeholder="Produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {formatCurrencyCents(p.price_cents)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input aria-label="Quantidade" type="number" min={1} className="font-mono" value={l.quantity} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, quantity: Number(e.target.value) } : x)))} />
                <Input aria-label="Observação do item" placeholder="Obs." value={l.notes} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, notes: e.target.value } : x)))} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remover item" onClick={() => setLines(lines.filter((_, k) => k !== i))} disabled={lines.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => setLines([...lines, { productId: available[0]?.id ?? "", quantity: 1, notes: "" }])}>
              <Plus className="h-3.5 w-3.5" /> Item
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <MoneyInput id="md" label="Desconto" cents={discount} onChange={(c) => setDiscount(c ?? 0)} />
            <MoneyInput id="mf" label="Taxa" cents={fee} onChange={(c) => setFee(c ?? 0)} />
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Pagamento</Label>
              <Segmented
                name="Pagamento"
                value={payment}
                onChange={setPayment}
                options={[
                  { value: "CARD_ON_DELIVERY", label: "Cartão" },
                  { value: "CASH", label: "Dinheiro" },
                  { value: "PIX_MANUAL", label: "Pix" },
                ]}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="mo">Observações</Label>
              <Input id="mo" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Segmented
              name="Status inicial"
              value={status}
              onChange={setStatus}
              options={[
                { value: "CONFIRMED", label: "Já confirmado" },
                { value: "NEW", label: "Novo" },
              ]}
            />
          </div>
          <FormMessage error={error} />
          <DialogFooter className="items-center sm:justify-between">
            <p className="font-mono text-sm text-foreground-muted">
              Total estimado {formatCurrencyCents(Math.max(0, subtotal - discount + fee))}
            </p>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Registrar pedido
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
