# KFCT / FAO Kenyan Food Recipes — source data

**Source:** FAO / Government of Kenya. 2018. *Kenyan Food Recipes — A Recipe
Book of Common Mixed Dishes with Nutrient Values.*
<http://www.fao.org/3/I8897EN/I8897en.pdf>

Nutrient values in this dataset were calculated by the source from the
revised **Kenya Food Composition Tables (KFCT) 2018** using mixed-recipe
calculations, measured yield factors and nutrient-retention factors, per
100 g edible portion (fresh weight).

This is a **structured extraction** of that publication (142 recipes), not
the original PDF/book. The full 351-page source PDF is intentionally **not**
checked into this repository (size + licensing scope — see `Import_Notes`
context below); only the structured facts needed for import are kept here.

## Files

| File | Rows (excl. header) | Contents |
|---|---|---|
| `kenyan_recipes.csv` | 142 | One row per recipe: KFCT code, name, category, servings, preparation/cooking time, instructions text, and the full per-100g nutrient composition in wide-column form (the authoritative import source — see `composition_method`/`nutrient_status` columns). |
| `kenyan_recipe_ingredients.csv` | 837 | One row per recipe ingredient: KFCT code, ingredient name, **grams (authoritative)**, household measure (display-only, source-stated as approximate), sort order. |
| `kenyan_recipe_nutrients.csv` | 3834 | The same nutrient composition as `kenyan_recipes.csv`, normalized long-form (one row per recipe × nutrient). Kept for cross-validation only — `import-kfct-recipes.ts` imports from the wide `kenyan_recipes.csv` form. |

## Known facts (validated against the source)

- 142 quantified recipes; 140 have a complete nutrient profile.
- 2 do **not** have a nutrient profile and must never be coerced to zero:
  - `KFCT 15135` — Mkate Kuta (yield factors missing from the source)
  - `KFCT 15050` — Ikalanga / Sheep Tail Fat (fresh sheep-tail-fat composition unavailable)
- Blank nutrient cells mean **unavailable / not reported** in the source —
  never zero. A source-reported zero is kept as `0`.
- KFCT codes are unique except intentional subcodes for one dish split into
  two recipes (`15066r` rice component, `15066s` stew component — Swahili
  Biryani) — these are distinct rows, never merged.
- Gram ingredient weights are the source's authoritative measured
  quantities; household cup/spoon measures are explicitly approximate in
  the source and are display-only here.

## Attribution / reuse

Structured factual nutrition data and recipe facts (ingredient lists,
quantities, nutrient composition) are imported. The book's narrative prose
is **not** reproduced wholesale — see `import-kfct-recipes.ts` for exactly
which fields are imported. Preserve the citation above wherever this data
is surfaced in-product.
