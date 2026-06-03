import type { WorkbenchId } from "@/lib/workbenches";
import promptPolicy from "@/lib/prompt-policy";

const { referenceIsolationPolicy } = promptPolicy as {
  referenceIsolationPolicy: () => string;
};

export type InputImageMeta = {
  url: string;
  backend?: "kie-file-upload" | "blob" | "local";
  originalName?: string;
  sourceUrl?: string;
  size?: number;
  mimeType?: string;
  uploadedAt?: number;
  expiresAt?: number;
};

export type InputPayloadV2 = {
  v: 2;
  product_urls: string[];
  reference_urls: string[];
  merged_urls: string[];
};

export type InputPayloadV3 = {
  v: 3;
  product_images: InputImageMeta[];
  reference_images: InputImageMeta[];
  product_urls: string[];
  reference_urls: string[];
  merged_urls: string[];
};

export function normalizeInputImageMeta(value: unknown): InputImageMeta | null {
  if (typeof value === "string") {
    return value ? { url: value } : null;
  }
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<InputImageMeta>;
  if (typeof item.url !== "string" || item.url.length === 0) return null;
  return {
    url: item.url,
    backend:
      item.backend === "kie-file-upload" ||
      item.backend === "blob" ||
      item.backend === "local"
        ? item.backend
        : undefined,
    originalName:
      typeof item.originalName === "string" ? item.originalName : undefined,
    sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : undefined,
    size:
      typeof item.size === "number" && Number.isFinite(item.size)
        ? item.size
        : undefined,
    mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
    uploadedAt:
      typeof item.uploadedAt === "number" && Number.isFinite(item.uploadedAt)
        ? item.uploadedAt
        : undefined,
    expiresAt:
      typeof item.expiresAt === "number" && Number.isFinite(item.expiresAt)
        ? item.expiresAt
        : undefined,
  };
}

export function normalizeInputImageList(value: unknown): InputImageMeta[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeInputImageMeta(item))
    .filter((item): item is InputImageMeta => item != null);
}

export function buildInputUrlsStorage(
  productInputs: Array<string | InputImageMeta>,
  referenceInputs: Array<string | InputImageMeta>
): string {
  const productImages = productInputs
    .map((item) => normalizeInputImageMeta(item))
    .filter((item): item is InputImageMeta => item != null);
  const referenceImages = referenceInputs
    .map((item) => normalizeInputImageMeta(item))
    .filter((item): item is InputImageMeta => item != null);
  const productUrls = productImages.map((item) => item.url);
  const referenceUrls = referenceImages.map((item) => item.url);
  const merged = [...productUrls, ...referenceUrls];
  const payload: InputPayloadV3 = {
    v: 3,
    product_images: productImages,
    reference_images: referenceImages,
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
  productImages: InputImageMeta[];
  referenceImages: InputImageMeta[];
} {
  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) {
      const arr = v.filter((x): x is string => typeof x === "string");
      const images = arr.map((url) => ({ url }));
      return {
        product: arr,
        reference: [],
        merged: arr,
        productImages: images,
        referenceImages: [],
      };
    }
    if (v && typeof v === "object" && (v as InputPayloadV3).v === 3) {
      const p = v as InputPayloadV3;
      const productImages = normalizeInputImageList(p.product_images);
      const referenceImages = normalizeInputImageList(p.reference_images);
      const product = productImages.map((item) => item.url);
      const reference = referenceImages.map((item) => item.url);
      const merged = Array.isArray(p.merged_urls)
        ? p.merged_urls.filter((x) => typeof x === "string")
        : [...product, ...reference];
      return { product, reference, merged, productImages, referenceImages };
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
      return {
        product,
        reference,
        merged,
        productImages: product.map((url) => ({ url })),
        referenceImages: reference.map((url) => ({ url })),
      };
    }
  } catch {
    /* fallthrough */
  }
  return {
    product: [],
    reference: [],
    merged: [],
    productImages: [],
    referenceImages: [],
  };
}

export function buildAugmentedPrompt(params: {
  userPrompt: string;
  workbenchId: WorkbenchId;
  workbenchDefinition?: string;
  productCount: number;
  referenceCount: number;
  variantIndex: number;
  variantTotal: number;
}): string {
  const {
    userPrompt,
    workbenchId,
    workbenchDefinition,
    productCount,
    referenceCount,
    variantIndex,
    variantTotal,
  } = params;
  const pc = Math.max(0, productCount);
  const rc = Math.max(0, referenceCount);
  if (workbenchId === "default") {
    return userPrompt.trim();
  }
  const blocks: string[] = [];
  const definition = workbenchDefinition?.trim();
  if (definition) {
    blocks.push(`[Workbench definition]\n${definition}`);
  }

  blocks.push(
    `[Global hard requirement]\n` +
      `Use a realistic photography style. The output must look like a real camera photograph with physically plausible lighting, shadows, perspective, depth of field, materials, texture, color, and lens behavior. Avoid illustration, CGI, render, cartoon, plastic-smooth surfaces, overprocessed AI aesthetics, impossible anatomy, impossible object contact, fake reflections, and surreal compositions unless the user explicitly asks for a non-photographic style.`
  );
  blocks.push(referenceIsolationPolicy());

  if (workbenchId === "sku-background") {
    const backgroundLine =
      rc > 0
        ? `• Images ${pc + 1}..${pc + rc}: BACKGROUND references. Preserve the background scene, composition, lighting direction, perspective, surface contact, shadows, and mood. If a background image contains another product, replace that product with the current SKU product instead of keeping both products.`
        : `• No background image was supplied. Create a clean commercial background from the workbench definition and user brief.`;
    blocks.push(
      `[Image roles — order matches input_urls exactly]\n` +
        `• Image 1: CURRENT SKU product photo. Keep this SKU's identity, shape, material, color, markings, and proportions accurate.\n` +
        backgroundLine
    );
    blocks.push(
      `[SKU background replacement]\n` +
        `Create one finished SKU image for product ${variantIndex + 1} of ${variantTotal}. The product must be derived from Image 1 only; do not substitute, hallucinate, or mix in unrelated products, props, body parts, or objects from the background references. Treat every background/reference image as scene-only guidance: ignore any product, hand-held item, package, logo, label, foreground subject, or commercial object visible in those images. Place the current SKU naturally into the chosen background. Match the background's light direction, shadow softness, perspective, scale, contact shadows, reflections, depth of field, and color temperature. Keep the product identity consistent and preserve crisp high-definition material detail, texture, edges, markings, color, transparency, and proportions. The product must be the clear visual focus, fully visible, unobstructed, and not hidden behind hands, props, text, foreground objects, blur, glare, or crop. Do not invent hands, arms, fingers, people, floating limbs, disconnected wrists, hovering props, or other AI-looking support objects. If the source product photo includes a hand or holder, either remove it cleanly while keeping the product intact, or keep it only when it remains anatomically natural, connected, physically plausible, properly lit, and clearly in contact with the product and scene. Avoid surreal floating-hand compositions; the product should feel grounded in the background with believable contact, support, and shadow logic. Remove or replace any existing product in the background image, while preserving the background environment and commercial styling.`
    );
  }

  if (workbenchId === "etsy" || workbenchId === "story-set") {
    const referenceLine =
      rc > 0
        ? workbenchId === "story-set"
          ? `• Images ${pc + 1}..${pc + rc}: SET REFERENCES for story, scene logic, visual tone, background atmosphere, composition, camera language, lighting, and set dressing only. Do not copy products, props, hands, packaging, logos, labels, or main objects from these references; never replace the product.`
          : `• Images ${pc + 1}..${pc + rc}: REFERENCE for background mood, lighting, composition, lens language, set dressing, and commercial photography style only. Do not copy products, props, hands, packaging, logos, labels, or main objects from these references; never replace the product.`
        : workbenchId === "story-set"
          ? `• No set reference images were supplied. Build the story set from the product photos, workbench definition, and user brief.`
          : `• No reference images were supplied. Build the scene from the product photos, workbench definition, and user brief.`;
    blocks.push(
      `[Image roles — order matches input_urls exactly]\n` +
        `• Images 1..${pc}: PRODUCT source photos. Keep the product identity consistent (shape, materials, colors, logos/prints).\n` +
        referenceLine
    );
  }

  if (workbenchId === "story-set") {
    const storyboard = [
      "Hero image: a polished main visual that establishes the product and the set's overall mood.",
      "Scene establishing image: show the product in a coherent environment that starts the story.",
      "Use or placement image: show how the product sits, works, or is arranged in real use.",
      "Detail close-up: focus on material, texture, craftsmanship, or a distinctive product feature.",
      "Scale or spatial relationship: show size, hand-held context, tabletop context, or surrounding objects.",
      "Alternate angle: keep the same tone while revealing a useful new side or composition.",
      "Packaging, gift, or display image: present the product as a ready-to-buy or ready-to-gift item.",
      "Atmosphere detail: a quieter supporting image with consistent props, light, and emotional tone.",
      "Closing summary image: bring the set together as a final cohesive product story.",
      "Extension image: create a useful additional variation that still belongs to the same story set.",
    ];
    const frame = storyboard[Math.min(variantIndex, storyboard.length - 1)];
    blocks.push(
      `[Story set direction]\n` +
        `Create a coherent image set with unified lighting, color palette, atmosphere, camera language, and commercial presentation. Each image should feel like part of the same product story while showing a distinct useful angle.\n\n` +
        `[Current frame]\n` +
        `This is image ${variantIndex + 1} of ${variantTotal}. ${frame}`
    );
  }

  if (variantTotal > 1) {
    if (workbenchId !== "story-set") {
      const instruction =
        workbenchId === "etsy"
          ? "Create a meaningfully different marketing shot while preserving the same product."
          : workbenchId === "sku-background"
            ? "Use the current SKU product for this output; do not mix it with other SKU products."
          : "Create a meaningfully different output while respecting the workbench definition and user brief.";
      blocks.push(
        `[Variation] This is output ${variantIndex + 1} of ${variantTotal}. ${instruction}`
      );
    }
  }

  blocks.push(`[User brief]\n${userPrompt.trim()}`);
  return blocks.join("\n\n");
}
