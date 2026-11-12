"use client";

import { StoreTab } from "@/components/settings/store-tab";
import type { Store } from "@/types/domain.types";
import { previewImageIO } from "./preview-image-io";

export function StoreTabPreview({ store }: { store: Store }) {
  return <StoreTab store={store} canManage imageIO={previewImageIO} />;
}
