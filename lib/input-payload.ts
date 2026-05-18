export type InputPayloadV2 = {
  v: 2;
  product_urls: string[];
  reference_urls: string[];
  merged_urls: string[];
};

export function buildInputUrlsStorage(
  productUrls: string[],
  referenceUrls: string[]
): string {
  const merged = [...productUrls, ...referenceUrls];
  const payload: InputPayloadV2 = {
    v: 2,
    product_urls: productUrls,
    reference_urls: referenceUrls,
    merged_urls: merged,
  };
  return JSON.stringify(payload);
}

export function parseInputPayload(raw: string): {
  product: string[];
  reference: string[];
  merged: string[];
} {
  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) {
      const arr = v.filter((x): x is string => typeof x === "string");
      return { product: arr, reference: [], merged: arr };
    }
    if (v && typeof v === "object" && (v as InputPayloadV2).v === 2) {
      const p = v as InputPayloadV2;
      const product = Array.isArray(p.product_urls)
        ? p.product_urls.filter((x) => typeof x === "string")
        : [];
      const reference = Array.isArray(p.reference_urls)
        ? p.reference_urls.filter((x) => typeof x === "string")
        : [];
      const merged = Array.isArray(p.merged_urls)
        ? p.merged_urls.filter((x) => typeof x === "string")
        : [...product, ...reference];
      return { product, reference, merged };
    }
  } catch {
    /* fallthrough */
  }
  return { product: [], reference: [], merged: [] };
}

export function buildAugmentedPrompt(params: {
  userPrompt: string;
  productCount: number;
  referenceCount: number;
  variantIndex: number;
  variantTotal: number;
}): string {
  const {
    userPrompt,
    productCount,
    referenceCount,
    variantIndex,
    variantTotal,
  } = params;
  const pc = Math.max(0, productCount);
  const rc = Math.max(0, referenceCount);
  const roleBlock =
    `[Image roles — order matches input_urls exactly]\n` +
    `• Images 1..${pc}: PRODUCT source photos. Keep the product identity consistent (shape, materials, colors, logos/prints) for Etsy-style listing imagery.\n` +
    `• Images ${pc + 1}..${pc + rc}: REFERENCE for mood/lighting/composition/set dressing only. Match atmosphere and style; do not replace the product with unrelated items from these references.\n`;

  const varBlock =
    variantTotal > 1
      ? `\n[Variation] This is output ${variantIndex + 1} of ${variantTotal}. Create a meaningfully different marketing shot while preserving the same product.\n`
      : "";

  return `${roleBlock}${varBlock}\n[User brief]\n${userPrompt.trim()}`;
}
