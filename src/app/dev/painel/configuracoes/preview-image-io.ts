"use client";

import type { BrandImageIO } from "@/components/settings/image-upload";

/** Preview-only: keeps the cropped image in memory instead of uploading it. */
export const previewImageIO: BrandImageIO = {
  async save(_kind, { blob }) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true, url: URL.createObjectURL(blob) };
  },
  async remove() {
    return { ok: true, url: null };
  },
};
