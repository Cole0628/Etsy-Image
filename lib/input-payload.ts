import type { WorkbenchId } from "@/lib/workbenches";

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
  const blocks: string[] = [];
  const definition = workbenchDefinition?.trim();
  if (definition) {
    blocks.push(`[Workbench definition]\n${definition}`);
  }

  if (workbenchId === "etsy" || workbenchId === "story-set") {
    const referenceLine =
      rc > 0
        ? workbenchId === "story-set"
          ? `• Images ${pc + 1}..${pc + rc}: SET REFERENCES such as hero image, lifestyle scene, detail close-up, packaging, use case, and atmosphere. Use them to unify story, scene logic, and visual tone; do not copy unrelated objects or replace the product.`
          : `• Images ${pc + 1}..${pc + rc}: REFERENCE for mood/lighting/composition/set dressing only. Match atmosphere and style; do not replace the product with unrelated items from these references.`
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
          : "Create a meaningfully different output while respecting the workbench definition and user brief.";
      blocks.push(
        `[Variation] This is output ${variantIndex + 1} of ${variantTotal}. ${instruction}`
      );
    }
  }

  blocks.push(`[User brief]\n${userPrompt.trim()}`);
  return blocks.join("\n\n");
}
