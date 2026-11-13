"use client";

import * as React from "react";
import { ImagePlus, Loader2, Minus, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ACCEPT_ATTRIBUTE,
  BRAND_IMAGE_SPEC,
  MAX_ZOOM,
  MIN_ZOOM,
  clampOffset,
  cropScale,
  validateImageFile,
  type BrandImageKind,
} from "@/lib/images/brand-assets";
import { loadImageFromFile, renderCrop, type CroppedImage } from "@/lib/images/encode";
import { cn } from "@/lib/utils";

export type ImageResult = { ok: true; url: string | null } | { ok: false; error: string };

export interface BrandImageIO {
  /** Uploads the cropped image and persists it on the store. */
  save: (kind: BrandImageKind, image: CroppedImage) => Promise<ImageResult>;
  /** Clears the image from the store. */
  remove: (kind: BrandImageKind) => Promise<ImageResult>;
}

const COPY: Record<BrandImageKind, { title: string; hint: string; cropTitle: string; empty: string }> = {
  logo: {
    title: "Logo",
    hint: "Quadrado, aparece no cardápio, no acompanhamento do pedido e ao compartilhar o link.",
    cropTitle: "Ajuste o logo",
    empty: "Enviar logo",
  },
  banner: {
    title: "Capa",
    hint: "Faixa no topo do cardápio. Uma foto do prato da casa funciona bem.",
    cropTitle: "Ajuste a capa",
    empty: "Enviar capa",
  },
};

/**
 * Upload with preview and crop. The chosen file (max 2 MB) is cropped in the
 * browser to the exact size the layout uses, so nothing heavy is stored and
 * every store image has the same proportions.
 */
export function ImageUploadField({
  kind,
  value,
  onChange,
  io,
  disabled,
  fallbackInitial,
}: {
  kind: BrandImageKind;
  value: string | null;
  onChange: (url: string | null) => void;
  io: BrandImageIO;
  disabled?: boolean;
  fallbackInitial?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"saving" | "removing" | null>(null);
  const [pending, setPending] = React.useState<{ image: HTMLImageElement; revoke: () => void } | null>(null);
  const copy = COPY[kind];
  const inputId = React.useId();
  const errorId = `${inputId}-error`;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    const invalid = validateImageFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    try {
      setPending(await loadImageFromFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ler esta imagem.");
    }
  }

  function closeCrop() {
    pending?.revoke();
    setPending(null);
  }

  async function confirmCrop(cropped: CroppedImage) {
    closeCrop();
    setBusy("saving");
    const res = await io.save(kind, cropped);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else onChange(res.url);
  }

  async function remove() {
    setError(null);
    setBusy("removing");
    const res = await io.remove(kind);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else onChange(null);
  }

  const isLogo = kind === "logo";
  return (
    <div className={cn("flex gap-4", isLogo ? "items-center" : "flex-col")}>
      <div
        className={cn(
          "relative shrink-0 overflow-hidden border border-border bg-surface-card",
          isLogo ? "h-24 w-24 rounded-2xl" : "aspect-[8/3] w-full max-w-xl rounded-2xl"
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={isLogo ? "Logo atual da loja" : "Capa atual do cardápio"} className="h-full w-full object-cover" />
        ) : isLogo && fallbackInitial ? (
          <div aria-hidden className="flex h-full w-full items-center justify-center bg-brand font-display text-4xl font-extrabold text-white">
            {fallbackInitial}
          </div>
        ) : (
          <div aria-hidden className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_20%_0%,rgba(255,106,0,0.28),transparent_60%)] text-foreground-subtle">
            <ImagePlus className="h-6 w-6" />
          </div>
        )}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
            <span className="sr-only">{busy === "saving" ? "Enviando imagem" : "Removendo imagem"}</span>
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-foreground-muted">{copy.hint} JPG, PNG ou WebP, até 2 MB.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            onChange={onFile}
            disabled={disabled || Boolean(busy)}
            aria-label={value ? `Trocar ${copy.title.toLowerCase()}` : copy.empty}
            aria-describedby={error ? errorId : undefined}
          />
          <Button type="button" variant="secondary" size="sm" disabled={disabled || Boolean(busy)} onClick={() => inputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            {value ? "Trocar" : copy.empty}
          </Button>
          {value ? (
            <Button type="button" variant="ghost" size="sm" disabled={disabled || Boolean(busy)} onClick={remove}>
              <Trash2 className="h-3.5 w-3.5" />
              Remover
            </Button>
          ) : null}
        </div>
        {error ? (
          <p id={errorId} role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>

      {pending ? <CropDialog kind={kind} image={pending.image} title={copy.cropTitle} onCancel={closeCrop} onConfirm={confirmCrop} /> : null}
    </div>
  );
}

function CropDialog({
  kind,
  image,
  title,
  onCancel,
  onConfirm,
}: {
  kind: BrandImageKind;
  image: HTMLImageElement;
  title: string;
  onCancel: () => void;
  onConfirm: (cropped: CroppedImage) => void;
}) {
  const spec = BRAND_IMAGE_SPEC[kind];
  const frameRef = React.useRef<HTMLDivElement>(null);
  const [frame, setFrame] = React.useState({ width: 0, height: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ offsetX: 0, offsetY: 0 });
  const [working, setWorking] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const drag = React.useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Radix mounts the content in a portal, so measure through a callback ref.
  const measure = React.useCallback((node: HTMLDivElement | null) => {
    frameRef.current = node;
    if (node) setFrame({ width: node.clientWidth, height: node.clientHeight });
  }, []);
  React.useEffect(() => {
    const onResize = () => {
      if (frameRef.current) setFrame({ width: frameRef.current.clientWidth, height: frameRef.current.clientHeight });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const base = { imageWidth: image.naturalWidth, imageHeight: image.naturalHeight, viewWidth: frame.width, viewHeight: frame.height };
  const view = { ...base, zoom, ...offset };
  const ready = frame.width > 0;
  const scale = ready ? cropScale(view) : 1;
  const clamped = ready ? clampOffset(view) : offset;

  const move = (dx: number, dy: number) => setOffset((prev) => clampOffset({ ...base, zoom, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy }));
  const changeZoom = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    setZoom(z);
    setOffset((prev) => clampOffset({ ...base, zoom: z, ...prev }));
  };

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 24 : 8;
    const keys: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (keys[e.key]) {
      e.preventDefault();
      move(...keys[e.key]);
    } else if (e.key === "+" || e.key === "=") changeZoom(zoom + 0.1);
    else if (e.key === "-") changeZoom(zoom - 0.1);
  }

  async function confirm() {
    setWorking(true);
    setFailure(null);
    try {
      onConfirm(await renderCrop(image, { ...view, ...clamped }, spec.width, spec.height, kind === "logo" ? "image/png" : "image/jpeg"));
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "Não foi possível processar a imagem.");
      setWorking(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className={kind === "banner" ? "max-w-2xl" : "max-w-md"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Arraste para posicionar e use o controle para aproximar. O que estiver dentro da moldura é o que vai aparecer.</DialogDescription>
        </DialogHeader>

        <div
          ref={measure}
          role="img"
          aria-label="Área de recorte. Use as setas do teclado para mover a imagem."
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: clamped.offsetX, oy: clamped.offsetY };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setOffset(clampOffset({ ...base, zoom, offsetX: drag.current.ox + e.clientX - drag.current.x, offsetY: drag.current.oy + e.clientY - drag.current.y }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={(e) => changeZoom(zoom - e.deltaY * 0.0015)}
          className={cn(
            "relative mx-auto w-full cursor-grab touch-none select-none overflow-hidden bg-background outline-none ring-1 ring-border focus-visible:ring-2 focus-visible:ring-brand/60 active:cursor-grabbing",
            kind === "logo" ? "aspect-square max-w-[320px] rounded-3xl" : "aspect-[8/3] rounded-2xl"
          )}
        >
          {ready ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: image.naturalWidth * scale,
                height: image.naturalHeight * scale,
                transform: `translate(calc(-50% + ${clamped.offsetX}px), calc(-50% + ${clamped.offsetY}px))`,
              }}
            />
          ) : null}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button type="button" variant="secondary" size="icon" aria-label="Afastar" onClick={() => changeZoom(zoom - 0.2)} disabled={zoom <= MIN_ZOOM}>
            <Minus className="h-4 w-4" />
          </Button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-elevated accent-brand"
          />
          <Button type="button" variant="secondary" size="icon" aria-label="Aproximar" onClick={() => changeZoom(zoom + 0.2)} disabled={zoom >= MAX_ZOOM}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {failure ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {failure}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={working}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirm} disabled={working || !ready}>
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Usar este recorte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
