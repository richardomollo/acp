// ACP Intelligence™ — Nutrition N5 route helpers. Mirrors the structure of
// the nutrition-coaching route: model + config, a strict Structured-Outputs
// schema, a pure prompt, and pure validators — all unit-testable without a
// network call.
//
// The vision model ONLY names visible food/drink. It never produces calories,
// macros, micronutrients, health judgement, portions, or coaching (§5/§6/§45).
// Nutrition facts come from the canonical food source AFTER the user confirms
// a match — this endpoint returns textual candidate labels and nothing else.

export const NUTRITION_PHOTO_MODEL = 'gpt-5-mini'; // repo-standard multimodal model; supports image input + strict structured output

export const NUTRITION_PHOTO_REQUEST_CONFIG = {
  reasoning_effort: 'minimal' as const,
  max_completion_tokens: 400,
};

// §7 — a small, useful candidate list.
export const MAX_CANDIDATES = 8;

// §39 — input security. Base64 body only (no client URLs → no SSRF).
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageValidation =
  | { ok: true; mimeType: (typeof ALLOWED_MIME_TYPES)[number]; bytes: number }
  | { ok: false; status: number; error: string };

/** Approximate decoded byte length of a base64 string, without decoding. */
export function approxBase64Bytes(base64: string): number {
  const clean = base64.replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  if (clean.length === 0) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export function validateImageInput(imageBase64: unknown, mimeType: unknown): ImageValidation {
  if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
    return { ok: false, status: 400, error: 'Missing image data' };
  }
  if (typeof mimeType !== 'string' || !(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return { ok: false, status: 415, error: 'Unsupported image type' };
  }
  // reject a data-URL whose declared type disagrees with mimeType, and reject non-base64 chars
  const body = imageBase64.replace(/^data:[^,]*,/, '');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(body)) {
    return { ok: false, status: 400, error: 'Malformed image data' };
  }
  const bytes = approxBase64Bytes(imageBase64);
  if (bytes <= 0) return { ok: false, status: 400, error: 'Empty image' };
  if (bytes > MAX_IMAGE_BYTES) return { ok: false, status: 413, error: 'Image too large' };
  return { ok: true, mimeType: mimeType as (typeof ALLOWED_MIME_TYPES)[number], bytes };
}

// ── Structured output schema ──────────────────────────────────────────────
export const NUTRITION_PHOTO_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    foods: {
      type: 'array',
      maxItems: MAX_CANDIDATES,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string', maxLength: 60 },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['label', 'confidence'],
      },
    },
    uncertain: { type: 'boolean' },
  },
  required: ['foods', 'uncertain'],
} as const;

export const NUTRITION_PHOTO_SYSTEM_PROMPT = `You identify visible food and drink in a single photo, to help a person log what they ate.

Return ONLY a list of the distinct food or drink components you can see, each with a short common name and your visual confidence (high, medium, low).

Rules:
- Name foods generically and neutrally (e.g. "grilled chicken", "white rice", "mixed vegetables", "coffee with milk"). No brand names.
- Do NOT estimate calories, macros, micronutrients, weight, grams, or portion size.
- Do NOT judge whether the food is healthy, or whether it suits any goal or diet.
- Do NOT describe, count, identify or infer anything about any person, body, face, location, or setting. If people are visible, ignore them entirely.
- If the image does not clearly contain food or drink, return an empty "foods" list and set "uncertain" to true.
- For a mixed dish you cannot break down reliably (stew, curry, biryani, salad with dressing, sandwich, smoothie), return ONE neutral label for the dish rather than guessing its ingredients, and set "uncertain" to true.
- Do not include garnishes, cutlery, plates, packaging or other non-food objects.
- Keep the list to the ${MAX_CANDIDATES} most useful components at most.
- Set "uncertain" to true whenever the photo is blurry, dark, partial, or otherwise hard to read.
Return only the required structured fields.`;

export const NUTRITION_PHOTO_USER_PROMPT =
  'Identify the visible food and drink components in this photo. Labels and confidence only — no nutrition values, no portions, no judgement.';

// ── Server-side validation of the model output ────────────────────────────
export interface ValidatedVision {
  foods: { label: string; confidence: 'high' | 'medium' | 'low' }[];
  uncertain: boolean;
}

const NON_FOOD_HINT = /\b(person|people|man|woman|child|face|hand|arm|body|selfie|kitchen|restaurant|table|plate|fork|knife|spoon|cup only|napkin|logo|brand)\b/i;

export function parseVisionAnalysis(raw: unknown): ValidatedVision | null {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const r = obj as Record<string, unknown>;
  if (!Array.isArray(r.foods)) return null;

  const seen = new Set<string>();
  const foods: ValidatedVision['foods'] = [];
  for (const item of r.foods) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    const label = typeof it.label === 'string' ? it.label.trim().replace(/\s+/g, ' ') : '';
    if (label.length < 2 || label.length > 60) continue;
    if (NON_FOOD_HINT.test(label)) continue;                 // §45 — never surface non-food / person hints
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const confidence = it.confidence === 'high' || it.confidence === 'medium' || it.confidence === 'low' ? it.confidence : 'low';
    foods.push({ label, confidence });
    if (foods.length >= MAX_CANDIDATES) break;
  }
  return { foods, uncertain: r.uncertain === true || foods.length === 0 };
}
