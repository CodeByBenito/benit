export type MembershipRole = "OWNER" | "MANAGER" | "ATTENDANT" | "KITCHEN";
export type OrderSource = "DIGITAL_MENU" | "MANUAL";
export type FulfillmentType = "DINE_IN" | "PICKUP" | "DELIVERY";
export type OrderStatus =
  | "NEW"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";
export type StockMovementType =
  | "INITIAL"
  | "ENTRY"
  | "EXIT"
  | "ADJUSTMENT"
  | "ORDER_DEDUCTION"
  | "ORDER_REVERSAL";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_platform_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  document_number: string | null;
  plan_tier: string;
  subscription_status: string;
  max_stores: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  organization_id: string;
  store_id: string | null;
  user_id: string;
  role: MembershipRole;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  currency: string;
  is_open: boolean;
  is_published: boolean;
  last_order_number: number;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductOption {
  id: string;
  store_id: string;
  group_id: string;
  name: string;
  price_cents: number;
  is_available: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductOptionGroup {
  id: string;
  store_id: string;
  product_id: string;
  name: string;
  min_select: number;
  max_select: number;
  is_required: boolean;
  sort_order: number;
  options?: ProductOption[];
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  store_id: string;
  category_id: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_available: boolean;
  is_archived: boolean;
  track_stock: boolean;
  stock_quantity: number;
  low_stock_threshold: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  category?: Category | null;
  option_groups?: ProductOptionGroup[];
}

export interface Customer {
  id: string;
  store_id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  total_orders: number;
  total_spent_cents: number;
  last_order_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemOption {
  id: string;
  store_id: string;
  order_item_id: string;
  option_id: string | null;
  group_name_snapshot: string;
  option_name_snapshot: string;
  price_cents: number;
  created_at: string;
}

export interface OrderItem {
  id: string;
  store_id: string;
  order_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  unit_price_cents: number;
  options_unit_price_cents: number;
  quantity: number;
  total_item_cents: number;
  notes: string | null;
  created_at: string;
  options?: OrderItemOption[];
}

export interface OrderStatusHistory {
  id: string;
  store_id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  reason: string | null;
  changed_by: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  store_id: string;
  customer_id: string | null;
  order_number: number;
  source: OrderSource;
  fulfillment_type: FulfillmentType;
  table_or_reference: string | null;
  status: OrderStatus;
  customer_name_snapshot: string;
  customer_phone_snapshot: string;
  subtotal_cents: number;
  discount_cents: number;
  fee_cents: number;
  total_cents: number;
  notes: string | null;
  stock_deducted: boolean;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  status_history?: OrderStatusHistory[];
}

export interface StockMovement {
  id: string;
  store_id: string;
  product_id: string;
  order_id: string | null;
  movement_type: StockMovementType;
  quantity_delta: number;
  previous_quantity: number;
  new_quantity: number;
  reference_key: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  product?: Pick<Product, "id" | "name" | "sku"> | null;
}

export interface TenantContext {
  user: {
    id: string;
    email: string;
    full_name: string;
  };
  organization: Organization;
  membership: Membership;
  store: Store;
  stores: Store[];
}

