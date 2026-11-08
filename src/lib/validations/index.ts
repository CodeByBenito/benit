import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
});

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Informe seu nome completo (mínimo 2 caracteres)."),
  email: z.string().trim().email("Informe um e-mail válido."),
  phone: z.string().trim().optional(),
  password: z
    .string()
    .min(6, "A senha deve ter pelo menos 6 caracteres."),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
});

export const onboardingSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, "O nome da empresa deve ter pelo menos 2 caracteres."),
  storeName: z
    .string()
    .trim()
    .min(2, "O nome da loja deve ter pelo menos 2 caracteres."),
  storeSlug: z
    .string()
    .trim()
    .min(2, "O endereço do cardápio deve ter pelo menos 2 caracteres.")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use apenas letras minúsculas, números e hífens (ex: benit-burger)."
    ),
  phone: z
    .string()
    .trim()
    .min(8, "Informe um telefone ou WhatsApp válido."),
  whatsapp: z.string().trim().optional(),
  description: z.string().trim().max(300).optional(),
  address: z.string().trim().max(250).optional(),
});

export const storeSettingsSchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().trim().min(2, "O nome da loja é obrigatório."),
  slug: z
    .string()
    .trim()
    .min(2, "Slug inválido.")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use apenas letras minúsculas, números e hífens."
    ),
  description: z.string().trim().max(400).optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().optional().nullable(),
  address: z.string().trim().max(250).optional().nullable(),
  logoUrl: z.string().trim().url().optional().nullable().or(z.literal("")),
  bannerUrl: z.string().trim().url().optional().nullable().or(z.literal("")),
  isOpen: z.boolean(),
  isPublished: z.boolean(),
});

export const categorySchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().trim().min(1, "O nome da categoria é obrigatório."),
  description: z.string().trim().max(250).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const productOptionItemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Nome do opcional é obrigatório."),
  priceCents: z.coerce.number().int().min(0, "Preço não pode ser negativo."),
  isAvailable: z.boolean().default(true),
});

export const productOptionGroupSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Nome do grupo é obrigatório."),
  minSelect: z.coerce.number().int().min(0).default(0),
  maxSelect: z.coerce.number().int().min(1).default(1),
  isRequired: z.boolean().default(false),
  options: z.array(productOptionItemSchema).default([]),
});

export const productSchema = z.object({
  storeId: z.string().uuid(),
  categoryId: z.string().uuid().optional().nullable().or(z.literal("")),
  sku: z.string().trim().max(50).optional().nullable(),
  name: z.string().trim().min(1, "O nome do produto é obrigatório."),
  description: z.string().trim().max(500).optional().nullable(),
  priceCents: z.coerce
    .number()
    .int()
    .min(0, "O preço deve ser igual ou maior que zero."),
  imageUrl: z.string().trim().optional().nullable(),
  isAvailable: z.boolean().default(true),
  trackStock: z.boolean().default(true),
  stockQuantity: z.coerce
    .number()
    .int()
    .min(0, "O estoque não pode ser negativo.")
    .default(0),
  lowStockThreshold: z.coerce
    .number()
    .int()
    .min(0, "O alerta de estoque mínimo não pode ser negativo.")
    .default(5),
  sortOrder: z.coerce.number().int().min(0).default(0),
  optionGroups: z.array(productOptionGroupSchema).optional().default([]),
});

export const stockAdjustmentSchema = z.object({
  storeId: z.string().uuid(),
  productId: z.string().uuid(),
  movementType: z.enum(["INITIAL", "ENTRY", "EXIT", "ADJUSTMENT"]),
  quantity: z.coerce
    .number()
    .int()
    .min(0, "Informe uma quantidade válida."),
  reason: z.string().trim().max(240).optional(),
});

export const orderItemInputSchema = z.object({
  product_id: z.string().uuid("Produto inválido."),
  quantity: z.coerce
    .number()
    .int()
    .min(1, "A quantidade mínima de cada item é 1."),
  option_ids: z.array(z.string().uuid()).optional().default([]),
  notes: z.string().trim().max(240).optional(),
});

export const createOrderSchema = z.object({
  storeId: z.string().uuid(),
  source: z.enum(["DIGITAL_MENU", "MANUAL"]),
  fulfillmentType: z.enum(["DINE_IN", "PICKUP", "DELIVERY"]).default("PICKUP"),
  customerName: z
    .string()
    .trim()
    .min(2, "Informe o nome do cliente."),
  customerPhone: z
    .string()
    .trim()
    .min(8, "Informe um telefone válido com DDD."),
  tableOrReference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(400).optional(),
  discountCents: z.coerce.number().int().min(0).default(0),
  feeCents: z.coerce.number().int().min(0).default(0),
  initialStatus: z.enum(["NEW", "CONFIRMED"]).default("NEW"),
  idempotencyKey: z.string().trim().max(120).optional(),
  items: z
    .array(orderItemInputSchema)
    .min(1, "Adicione pelo menos 1 produto ao pedido."),
});

export const transitionOrderStatusSchema = z.object({
  storeId: z.string().uuid(),
  orderId: z.string().uuid(),
  newStatus: z.enum([
    "NEW",
    "CONFIRMED",
    "PREPARING",
    "READY",
    "COMPLETED",
    "CANCELLED",
  ]),
  reason: z.string().trim().max(250).optional(),
});

