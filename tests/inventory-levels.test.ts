import { describe, expect, it } from "vitest";
import { byUrgency, isBelowMinimum, levelBar, previewAdjustment, stockLevel } from "@/lib/inventory/levels";

const p = (name: string, qty: number, min: number, tracked = true) => ({ name, track_stock: tracked, stock_quantity: qty, low_stock_threshold: min });

describe("inventory: level of a product", () => {
  it("classifies sold out, low, healthy and untracked", () => {
    expect(stockLevel(p("a", 0, 5))).toBe("out");
    expect(stockLevel(p("a", 5, 5))).toBe("low");
    expect(stockLevel(p("a", 6, 5))).toBe("ok");
    expect(stockLevel(p("a", 0, 5, false))).toBe("untracked");
  });

  it("'abaixo do mínimo' includes sold-out products and never untracked ones", () => {
    expect(isBelowMinimum(p("a", 0, 5))).toBe(true);
    expect(isBelowMinimum(p("a", 3, 5))).toBe(true);
    expect(isBelowMinimum(p("a", 9, 5))).toBe(false);
    expect(isBelowMinimum(p("a", 0, 5, false))).toBe(false);
  });

  it("draws the bar on a scale of three times the minimum, never overflowing", () => {
    expect(levelBar(p("a", 5, 10))).toEqual({ fill: (5 / 30) * 100, marker: (10 / 30) * 100 });
    expect(levelBar(p("a", 0, 10)).fill).toBe(0);
    const full = levelBar(p("a", 500, 10));
    expect(full.fill).toBe(100);
    expect(full.marker).toBeCloseTo(2);
    expect(levelBar(p("a", 4, 0))).toEqual({ fill: 100, marker: null });
    expect(levelBar(p("a", 4, 5, false))).toEqual({ fill: 0, marker: null });
  });

  it("sorts what needs buying first", () => {
    const list = [p("Limonada", 0, 5, false), p("Smash", 42, 10), p("Refri", 3, 12), p("Veggie", 0, 4), p("Batata", 6, 8)];
    expect(list.sort(byUrgency).map((x) => x.name)).toEqual(["Veggie", "Refri", "Batata", "Smash", "Limonada"]);
  });
});

describe("inventory: quick adjustment preview", () => {
  it("adds on entry and subtracts on exit", () => {
    expect(previewAdjustment(10, "ENTRY", 5)).toEqual({ next: 15, error: null });
    expect(previewAdjustment(10, "EXIT", 4)).toEqual({ next: 6, error: null });
  });

  it("never lets an exit go below zero", () => {
    expect(previewAdjustment(3, "EXIT", 4)).toEqual({ next: 3, error: "Só há 3 em estoque." });
  });

  it("a count sets the absolute quantity, zero included", () => {
    expect(previewAdjustment(10, "ADJUSTMENT", 0)).toEqual({ next: 0, error: null });
    expect(previewAdjustment(10, "ADJUSTMENT", 37)).toEqual({ next: 37, error: null });
  });

  it("rejects zero, negative, fractional and empty quantities", () => {
    expect(previewAdjustment(10, "ENTRY", 0).error).toBe("Informe uma quantidade maior que zero.");
    for (const bad of [-1, 1.5, NaN]) expect(previewAdjustment(10, "ENTRY", bad).error).toBe("Informe uma quantidade inteira.");
  });
});
