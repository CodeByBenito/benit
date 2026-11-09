import type { OrderStatus } from "@/types/domain.types";

export const BOARD_COLUMNS: { status: OrderStatus; title: string; accent: string }[] = [
  { status: "NEW", title: "Novos", accent: "bg-brand" },
  { status: "CONFIRMED", title: "Confirmados", accent: "bg-sky-400" },
  { status: "PREPARING", title: "Em preparo", accent: "bg-warning" },
  { status: "READY", title: "Prontos", accent: "bg-success" },
];

export const NEXT_ACTION: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  NEW: { next: "CONFIRMED", label: "Confirmar" },
  CONFIRMED: { next: "PREPARING", label: "Iniciar preparo" },
  PREPARING: { next: "READY", label: "Marcar pronto" },
  READY: { next: "COMPLETED", label: "Concluir" },
};

export function minutesSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export function elapsedLabel(iso: string) {
  const m = minutesSince(iso);
  if (m < 1) return "agora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}`;
}

/** Subtle two-tone chime for new orders (no audio file needed). */
export function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* audio not available */
  }
}
