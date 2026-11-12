/**
 * Company data shown on /termos and /privacidade.
 *
 * Fill these in before opening to real customers. While a field is null the
 * pages show a visible "a preencher" marker instead of an invented value.
 */
export const LEGAL_ENTITY: {
  /** Razão social. */
  companyName: string | null;
  /** CNPJ, formatted. */
  taxId: string | null;
  /** Full address of the head office. */
  address: string | null;
  /** Name of the data protection officer (encarregado, LGPD art. 41). */
  dpoName: string | null;
  /** Contact e-mail of the data protection officer. */
  dpoEmail: string | null;
  /** City/state of the court of jurisdiction. */
  jurisdiction: string | null;
} = {
  companyName: null,
  taxId: null,
  address: null,
  dpoName: null,
  dpoEmail: null,
  jurisdiction: null,
};

/** Date of the last change to the legal texts (ISO). Update it with every edit. */
export const LEGAL_UPDATED_AT = "2026-11-12";

/**
 * True while the texts are templates awaiting legal review. Set to false only
 * after a lawyer has reviewed them and LEGAL_ENTITY is filled in: it removes
 * the review notice and the "a confirmar" markers.
 */
export const LEGAL_IS_DRAFT = true;

export const formatLegalDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
