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
    .min(8, "A senha deve ter pelo menos 8 caracteres.")
    .max(72, "A senha deve ter no máximo 72 caracteres."),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "A senha deve ter pelo menos 8 caracteres.")
      .max(72, "A senha deve ter no máximo 72 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
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
  isOpen: z.boolean(),
  isPublished: z.boolean(),
});

/** Logo/cover are set by upload only: the client sends a storage path, never a URL. */
export const storeBrandImageSchema = z.object({
  storeId: z.string().uuid(),
  kind: z.enum(["logo", "banner"]),
  path: z.string().trim().min(1).max(200).nullable(),
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
  paymentMethod: z.enum(["CASH", "CARD_ON_DELIVERY", "PIX_MANUAL"]).optional(),
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


// ---------------------------------------------------------------------------
// Checkout, delivery, coupons, payments
// ---------------------------------------------------------------------------
export const paymentMethodSchema = z.enum(["ONLINE_PIX", "ONLINE_CARD", "CASH", "CARD_ON_DELIVERY", "PIX_MANUAL"]);
export const offlinePaymentMethodSchema = z.enum(["CASH", "CARD_ON_DELIVERY", "PIX_MANUAL"]);

export const deliveryAddressSchema = z.object({
  street: z.string().trim().min(2, "Informe a rua.").max(160),
  number: z.string().trim().max(20).optional().default(""),
  complement: z.string().trim().max(120).optional().default(""),
  neighborhood: z.string().trim().min(2, "Escolha o bairro.").max(80),
  reference: z.string().trim().max(160).optional().default(""),
});

export const checkoutSchema = z
  .object({
    slug: z.string().trim().min(2),
    storeId: z.string().uuid(),
    fulfillmentType: z.enum(["DINE_IN", "PICKUP", "DELIVERY"]),
    customerName: z.string().trim().min(2, "Informe seu nome."),
    customerPhone: z
      .string()
      .trim()
      .refine((v) => v.replace(/\D/g, "").length >= 10, "Informe seu WhatsApp com DDD."),
    tableOrReference: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(400).optional(),
    items: z.array(orderItemInputSchema).min(1, "Sua sacola está vazia."),
    paymentMethod: paymentMethodSchema,
    delivery: deliveryAddressSchema.optional(),
    couponCode: z
      .string()
      .trim()
      .toUpperCase()
      .max(24)
      .optional()
      .transform((v) => (v ? v : undefined)),
    changeForCents: z.coerce.number().int().min(0).optional(),
    idempotencyKey: z.string().trim().min(8).max(120),
  })
  .superRefine((d, ctx) => {
    if (d.fulfillmentType === "DELIVERY" && !d.delivery) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["delivery"], message: "Informe o endereço de entrega." });
    }
    if (d.fulfillmentType === "DINE_IN" && !d.tableOrReference) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tableOrReference"], message: "Informe o número da mesa." });
    }
  });

export const quoteSchema = z.object({
  slug: z.string().trim().min(2),
  items: z.array(orderItemInputSchema).min(1),
  fulfillmentType: z.enum(["DINE_IN", "PICKUP", "DELIVERY"]),
  neighborhood: z.string().trim().max(80).optional(),
  couponCode: z.string().trim().max(24).optional(),
  customerPhone: z.string().trim().max(30).optional(),
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido (use HH:MM).");

export const businessHoursSchema = z.object({
  storeId: z.string().uuid(),
  slots: z
    .array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          opensAt: timeSchema,
          closesAt: timeSchema,
        })
        .refine((s) => s.opensAt !== s.closesAt, "Abertura e fechamento não podem ser iguais.")
    )
    .max(28),
});

export const deliveryZoneSchema = z.object({
  storeId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Dê um nome à zona.").max(60),
  neighborhoods: z
    .array(z.string().trim().min(2).max(80))
    .min(1, "Adicione pelo menos um bairro.")
    .max(200),
  feeCents: z.coerce.number().int().min(0).max(100_000),
  minOrderCents: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
  etaMinutes: z.coerce.number().int().min(0).max(600).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const couponSchema = z
  .object({
    storeId: z.string().uuid(),
    id: z.string().uuid().optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,24}$/, "Use de 3 a 24 letras, números, - ou _."),
    description: z.string().trim().max(120).optional().nullable(),
    kind: z.enum(["PERCENT", "FIXED"]),
    value: z.coerce.number().int().positive("Informe o valor do desconto."),
    maxDiscountCents: z.coerce.number().int().positive().nullable().optional(),
    minOrderCents: z.coerce.number().int().min(0).default(0),
    startsAt: z.string().datetime({ offset: true }).nullable().optional(),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
    usageLimit: z.coerce.number().int().positive().nullable().optional(),
    perCustomerLimit: z.coerce.number().int().positive().nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((c) => c.kind !== "PERCENT" || c.value <= 100, { path: ["value"], message: "Percentual máximo é 100%." })
  .refine((c) => !c.startsAt || !c.endsAt || new Date(c.endsAt) > new Date(c.startsAt), {
    path: ["endsAt"],
    message: "O fim deve ser depois do início.",
  });

export const checkoutSettingsSchema = z
  .object({
    storeId: z.string().uuid(),
    minOrderCents: z.coerce.number().int().min(0).max(1_000_000),
    defaultEtaMinutes: z.coerce.number().int().min(0).max(600),
    acceptsDelivery: z.boolean(),
    acceptsPickup: z.boolean(),
    acceptsDineIn: z.boolean(),
    offlineMethods: z.array(offlinePaymentMethodSchema),
    pixKey: z.string().trim().max(140).optional().nullable(),
    onlinePaymentEnabled: z.boolean(),
    paymentWindowMinutes: z.coerce.number().int().min(5).max(120),
    notifyOwnerEmail: z.boolean(),
  })
  .refine((s) => s.acceptsDelivery || s.acceptsPickup || s.acceptsDineIn, {
    message: "Ative pelo menos uma forma de atendimento.",
  })
  .refine((s) => !s.offlineMethods.includes("PIX_MANUAL") || Boolean(s.pixKey), {
    path: ["pixKey"],
    message: "Informe a chave Pix para aceitar Pix na entrega.",
  })
  .refine((s) => s.onlinePaymentEnabled || s.offlineMethods.length > 0, {
    message: "Ative pelo menos uma forma de pagamento.",
  });

export const cardPaymentSchema = z.object({
  publicToken: z.string().regex(/^[0-9a-f]{64}$/),
  token: z.string().min(10).max(200),
  paymentMethodId: z.string().min(2).max(40),
  issuerId: z.string().max(40).optional().nullable(),
  installments: z.number().int().min(1).max(12),
  payerEmail: z.string().email(),
  identificationType: z.string().max(10).optional(),
  identificationNumber: z.string().max(20).optional(),
});

// --- Team -------------------------------------------------------------------

const invitableRole = z.enum(["MANAGER", "ATTENDANT", "KITCHEN"], {
  errorMap: () => ({ message: "Escolha Gerente, Atendente ou Cozinha." }),
});

export const inviteTeamMemberSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254),
  fullName: z.string().trim().max(80).optional().or(z.literal("")),
  role: invitableRole,
  /** null = every store of the organization. */
  storeId: z.string().uuid().nullable(),
});

export const updateTeamMemberRoleSchema = z.object({
  membershipId: z.string().uuid(),
  role: invitableRole,
});

export const teamMembershipSchema = z.object({
  membershipId: z.string().uuid(),
});
