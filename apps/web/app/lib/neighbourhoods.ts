export const NEIGHBOURHOODS = [
  { label: "Kilimani / Kileleshwa / Lavington",  keywords: ["kilimani", "kileleshwa", "lavington"] },
  { label: "Upper Hill / CBD / Hurlingham",       keywords: ["upper hill", "cbd", "hurlingham", "central business"] },
  { label: "Westlands / Parklands / Riverside",   keywords: ["westlands", "parklands", "riverside"] },
  { label: "Karen / Lang'ata",                    keywords: ["karen", "lang'ata", "langata"] },
  { label: "South B / South C / Nairobi West",    keywords: ["south b", "south c", "nairobi west"] },
  { label: "Mbagathi / Madaraka",                 keywords: ["mbagathi", "madaraka"] },
  { label: "Roysambu / Githurai / Zimmerman",     keywords: ["roysambu", "githurai", "zimmerman"] },
  { label: "Kasarani / Mwiki / Ruai",             keywords: ["kasarani", "mwiki", "ruai"] },
  { label: "Eastleigh / Pangani / Ngara",         keywords: ["eastleigh", "pangani", "ngara"] },
  { label: "Buruburu / Umoja / Donholm",          keywords: ["buruburu", "umoja", "donholm"] },
  { label: "Ruaka / Ridgeways / Muthaiga",        keywords: ["ruaka", "ridgeways", "muthaiga"] },
] as const;

export type Neighbourhood = typeof NEIGHBOURHOODS[number];
export const NEIGHBOURHOOD_LABELS = NEIGHBOURHOODS.map((n) => n.label);
