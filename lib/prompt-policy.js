function referenceIsolationPolicy() {
  return (
    `[Product identity isolation]\n` +
    `Target product identity must come only from PRODUCT source images. ` +
    `Reference images are for background atmosphere, story logic, set dressing, composition, camera angle, lens language, depth of field, lighting direction, color temperature, and commercial photography mood only. ` +
    `Do not copy, preserve, substitute, borrow, blend, or hallucinate products, hands, props, logos, packaging, labels, foreground objects, or main subjects from reference images. ` +
    `If a reference image contains a product or main object, ignore that object's identity and use only the scene, light, perspective, and visual language. ` +
    `Product consistency has highest priority: keep the uploaded product's shape, material, color, markings, scale, proportions, and distinctive details faithful to the PRODUCT source images.`
  );
}

module.exports = { referenceIsolationPolicy };
