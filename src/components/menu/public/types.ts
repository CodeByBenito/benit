import type { PaymentMethod } from "@/types/domain.types";

export interface PublicOptionItem {
  id: string;
  name: string;
  price_cents: number;
}

export interface PublicOptionGroup {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  is_required: boolean;
  options: PublicOptionItem[];
}

export interface PublicProduct {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_available: boolean;
  in_stock: boolean;
  option_groups: PublicOptionGroup[];
}

export interface PublicCategory {
  id: string;
  name: string;
  description: string | null;
}

export interface PublicDeliveryZone {
  id: string;
  name: string;
  neighborhoods: string[];
  fee_cents: number;
  min_order_cents: number | null;
  eta_minutes: number | null;
}

export interface PublicStoreInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  is_open: boolean;
  accepting_now: boolean;
  min_order_cents: number;
  default_eta_minutes: number;
  fulfillment: { delivery: boolean; pickup: boolean; dine_in: boolean };
  offline_methods: PaymentMethod[];
  pix_key: string | null;
  online_payment: { enabled: boolean; public_key: string | null };
  hours: { weekday: number; opens_at: string; closes_at: string }[];
}

export interface CartItem {
  key: string;
  productId: string;
  name: string;
  unitCents: number; // product + options, display only (server recalculates)
  quantity: number;
  options: PublicOptionItem[];
  notes: string;
}
