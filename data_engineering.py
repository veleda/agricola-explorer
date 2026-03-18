import re
from collections import OrderedDict

import polars as pl

ns = "http://veronahe.no/agricola/"


# ─── Cost parsing helpers ─────────────────────────────────────────────────────

RESOURCE_ABBREV = OrderedDict([
    ("animal", "an"),
    ("boar",   "b"),
    ("cattle", "ca"),
    ("clay",   "c"),
    ("food",   "f"),
    ("grain",  "g"),
    ("reed",   "r"),
    ("sheep",  "sh"),
    ("stone",  "s"),
    ("vegetable", "v"),
    ("wood",   "w"),
])

COST_TOKEN_RE = re.compile(
    r'(\d+)\s*'
    r'(wild\s*boar|vegetable|cattle|sheep|grain|animal|stone|clay|reed|food|wood'
    r'|c|s|r|w|f|g|v|b)',
    re.IGNORECASE,
)

_ALIAS_TO_KEY = {
    "c": "clay", "s": "stone", "r": "reed", "w": "wood",
    "f": "food", "g": "grain", "v": "vegetable", "b": "boar",
    "wild boar": "boar", "wildboar": "boar",
    "clay": "clay", "stone": "stone", "reed": "reed", "wood": "wood",
    "food": "food", "grain": "grain", "vegetable": "vegetable",
    "cattle": "cattle", "sheep": "sheep", "animal": "animal",
    "boar": "boar",
}


def _parse_single_cost(cost_str: str) -> tuple[dict, str | None]:
    """Parse one cost alternative into ({resource: amount}, remainder)."""
    cost_str = cost_str.strip()
    if not cost_str:
        return {}, None

    parsed: dict[str, int] = {}
    spans: list[tuple[int, int]] = []

    for m in COST_TOKEN_RE.finditer(cost_str):
        amount = int(m.group(1))
        raw = m.group(2).lower().strip()
        key = _ALIAS_TO_KEY.get(raw, raw)
        parsed[key] = parsed.get(key, 0) + amount
        spans.append((m.start(), m.end()))

    remainder = cost_str
    for s, e in sorted(spans, reverse=True):
        remainder = remainder[:s] + remainder[e:]
    remainder = re.sub(r'[,\s]+', ' ', remainder).strip()
    return parsed, remainder or None


def _slug_for_alternative(parsed: dict, special: str | None) -> tuple[str, str]:
    tokens, labels = [], []
    for res in sorted(parsed, key=lambda r: RESOURCE_ABBREV.get(r, r)):
        abbr = RESOURCE_ABBREV.get(res, res[0])
        tokens.append(f"{parsed[res]}{abbr}")
        labels.append(f"{parsed[res]} {res}")
    if special:
        tokens.append(re.sub(r'[^a-zA-Z0-9]', '', special))
        labels.append(special)
    return "".join(tokens), ", ".join(labels)


def cost_to_iri(cost_str: str) -> dict | None:
    """Parse a cost string (may contain '/' alternatives) into IRI + metadata."""
    if not cost_str or not cost_str.strip():
        return None

    alternatives = re.split(r'\s*/\s*', cost_str.strip())
    slug_parts, label_parts = [], []
    primary_resources: dict | None = None
    special_iris: list[str] = []

    for alt in alternatives:
        parsed, special = _parse_single_cost(alt)
        if primary_resources is None:
            primary_resources = parsed.copy()
        slug, label = _slug_for_alternative(parsed, special)
        slug_parts.append(slug)
        label_parts.append(label)
        if special:
            special_iris.append(ns + re.sub(r'[^a-zA-Z0-9]', '', special))

    full_slug = "_or_".join(slug_parts)
    if not full_slug:
        return None

    return {
        "iri": ns + full_slug,
        "label": " / ".join(label_parts),
        "resources": primary_resources or {},
        "special_iri": special_iris[0] if special_iris else None,
    }


# ─── Card-text NLP extraction ────────────────────────────────────────────────

GAIN_PATTERNS = {
    "food":       re.compile(r'\b(?:receive|take|get|gives?\s+you|place)\b.*?\bfood\b|\bfood\b.*?\b(?:receive|take|get)\b|\bconvert\b.*?\bto\s+\d*\s*food\b|\b\d+\s*food\b', re.I),
    "wood":       re.compile(r'\b(?:receive|take|get)\b.*?\bwood\b|\bwood\b.*?\b(?:receive|take|get)\b|\b\d+\s*wood\b', re.I),
    "clay":       re.compile(r'\b(?:receive|take|get)\b.*?\bclay\b|\bclay\b.*?\b(?:receive|take|get)\b|\b\d+\s*clay\b', re.I),
    "stone":      re.compile(r'\b(?:receive|take|get)\b.*?\bstone\b|\bstone\b.*?\b(?:receive|take|get)\b|\b\d+\s*stone\b', re.I),
    "reed":       re.compile(r'\b(?:receive|take|get)\b.*?\breed\b|\breed\b.*?\b(?:receive|take|get)\b|\b\d+\s*reed\b', re.I),
    "grain":      re.compile(r'\b(?:receive|take|get|sow|plant)\b.*?\bgrain\b|\bgrain\b.*?\b(?:receive|take|get)\b|\b\d+\s*grain\b', re.I),
    "vegetable":  re.compile(r'\b(?:receive|take|get|sow|plant)\b.*?\bvegetable\b|\bvegetable\b.*?\b(?:receive|take|get)\b|\b\d+\s*vegetable\b', re.I),
    "sheep":      re.compile(r'\b(?:receive|take|get|buy)\b.*?\bsheep\b|\bsheep\b.*?\b(?:receive|take|get)\b|\b\d+\s*sheep\b', re.I),
    "boar":       re.compile(r'\b(?:receive|take|get|buy)\b.*?\b(?:wild\s*)?boar\b|\b(?:wild\s*)?boar\b.*?\b(?:receive|take|get)\b|\b\d+\s*(?:wild\s*)?boar\b', re.I),
    "cattle":     re.compile(r'\b(?:receive|take|get|buy)\b.*?\bcattle\b|\bcattle\b.*?\b(?:receive|take|get)\b|\b\d+\s*cattle\b', re.I),
    "room":       re.compile(r'\b(?:build|extend|add)\b.*?\broom\b|\broom\b.*?\b(?:build|add|extend)\b', re.I),
    "stable":     re.compile(r'\b(?:build|place)\b.*?\bstable\b|\bstable\b', re.I),
    "fence":      re.compile(r'\b(?:build|place)\b.*?\bfence\b|\bfence\b', re.I),
    "field":      re.compile(r'\b(?:plo(?:w|ugh)|field)\b', re.I),
    "renovation": re.compile(r'\brenovati?on\b', re.I),
    "bake":       re.compile(r'\bbake\s*(?:bread)?\b|\bbaking\b', re.I),
    "bonus_points": re.compile(r'\bbonus\s*point', re.I),
    "begging":    re.compile(r'\bbegging\s*card\b', re.I),
    "occupation": re.compile(r'\b(?:play|counts?\s+as)\b.*?\boccupation', re.I),
    "improvement": re.compile(r'\b(?:play|counts?\s+as)\b.*?\bimprovement', re.I),
    "family_growth": re.compile(r'\bfamily\s*growth\b|\boffspring\b|\bnewborn\b', re.I),
    "pasture":    re.compile(r'\bpasture\b', re.I),
    "action_space": re.compile(r'\baction\s*space\b', re.I),
    "cooking":    re.compile(r'\bcook(?:ing)?\b|\bconvert\b.*?\bto\s+food\b', re.I),
    "fireplace":  re.compile(r'\bfireplace\b', re.I),
    "cooking_hearth": re.compile(r'\bcooking\s*hearth\b', re.I),
}

AFFECT_PATTERNS = {
    "harvest":          re.compile(r'\bharvest\b', re.I),
    "feeding":          re.compile(r'\bfeed(?:ing)?\s*phase\b', re.I),
    "round_space":      re.compile(r'\bround\s*space\b', re.I),
    "sow":              re.compile(r'\bsow\b', re.I),
    "breeding":         re.compile(r'\bbreeding\b', re.I),
    "immediately":      re.compile(r'\bimmediately\b', re.I),
    "end_of_game":      re.compile(r'\bend\s*of\s*(?:the\s*)?game\b', re.I),
    "each_round":       re.compile(r'\beach\s*round\b|\bstart\s*of\s*(?:each|every)\s*round\b', re.I),
    "when_played":      re.compile(r'\bwhen\s*you\s*play\s*this\s*card\b', re.I),
    "whenever":         re.compile(r'\bwhenever\b', re.I),
    "once_per_round":   re.compile(r'\bonce\s*(?:per|each)\s*round\b|\bonce\s*during\b', re.I),
    "other_players":    re.compile(r'\bother\s*player\b|\ball\s*players\b|\bany\s*player\b', re.I),
    "minor_improvements": re.compile(r'\bminor\s*improvement', re.I),
    "major_improvements": re.compile(r'\bmajor\s*improvement', re.I),
}

# Known game terms that appear in quotes but are NOT card references
_NOT_CARD_REFS = {
    "sheep", "wild boar", "cattle", "grain", "vegetable", "wood", "clay",
    "stone", "reed", "food", "boar", "family growth", "fishing",
    "renovation", "bake bread", "travelling players", "traveling players",
    "sow and bake bread", "take 1 grain", "plough", "plow",
    "family growth without room", "newborn",
}

_KNOWN_CARD_RE = re.compile(
    r'\b(?:'
    r'Fireplace|Cooking\s*Hearth|Clay\s*Oven|Stone\s*Oven|Well|'
    r'Joinery|Pottery|Basketmaker\'?s?\s*Workshop|'
    r'Half-timbered\s*[Hh]ouse|Mansion|Corn\s*[Ss]torehouse|'
    r'Water\s*Mill|Windmill|Hand\s*Mill|'
    r'Chicken\s*[Cc]oop|Holiday\s*[Hh]ome|'
    r'Forest\s*Pasture|Bean\s*Field|Fruit\s*Tree|'
    r'Bread\s*Paddle|Bookshelf'
    r')\b',
    re.I,
)
_QUOTED_RE = re.compile(r"['\u201c\u201d\u2018\u2019\"]([A-Z][a-zA-Z\s\-]+?)['\u201c\u201d\u2018\u2019\"]")
_CARD_ID_REF_RE = re.compile(r'\b([EIKW][A-Z]?\d{2,5})\b')


def _normalise_ref(name: str) -> str:
    return re.sub(r'[^a-zA-Z0-9]', '', name.strip())


def extract_gains(text: str) -> list[str]:
    if not text:
        return []
    return sorted(k for k, pat in GAIN_PATTERNS.items() if pat.search(text))


def extract_affects(text: str) -> list[str]:
    if not text:
        return []
    return sorted(k for k, pat in AFFECT_PATTERNS.items() if pat.search(text))


def extract_relations(text: str) -> list[str]:
    """Extract references to other specific cards."""
    if not text:
        return []
    refs: set[str] = set()
    for m in _KNOWN_CARD_RE.finditer(text):
        refs.add(_normalise_ref(m.group(0)))
    for m in _QUOTED_RE.finditer(text):
        name = m.group(1).strip()
        if name.lower() not in _NOT_CARD_REFS and len(name) > 2:
            refs.add(_normalise_ref(name))
    for m in _CARD_ID_REF_RE.finditer(text):
        refs.add(m.group(1))
    return sorted(refs)


# ─── Helper: turn a list of strings into a comma-separated IRI string ────────

def _list_to_iris(items: list[str]) -> str:
    """Join items as comma-separated full IRIs."""
    if not items:
        return ""
    return ",".join(ns + item for item in items)


# ─── Main loader ─────────────────────────────────────────────────────────────

def _load_tournament_stats(csv_path: str = "data/agricola_cards_all.csv") -> dict:
    """Load tournament stats from the legacy CSV, keyed by normalised card name."""
    import os
    if not os.path.exists(csv_path):
        return {}
    stats_df = pl.read_csv(csv_path, infer_schema_length=10000)
    stats_df = stats_df.rename({c: c.replace(" ", "_") for c in stats_df.columns if " " in c})
    stats_cols = ["dealt", "drafted", "played", "won", "ADP",
                  "play_ratio", "win_ratio", "PWR", "PWR_no_log", "banned", "is_no"]
    lookup = {}
    for row in stats_df.iter_rows(named=True):
        name = (row.get("Name") or "").strip().lower()
        if name:
            lookup[name] = {col: row.get(col) for col in stats_cols}
    return lookup


def _load_database_xlsx(xlsx_path: str = "data/AgricolaCards_Database_260224.xlsx") -> dict:
    """Load the curated card database XLSX, keyed by card_uuid.

    Returns new fields: PWRcorr, Deck2, has_bonus_symbol.
    """
    import os
    if not os.path.exists(xlsx_path):
        return {}
    import openpyxl
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb["cards"]
    rows = list(ws.iter_rows(values_only=True))
    headers = [h for h in rows[0] if h is not None]
    lookup = {}
    for r in rows[1:]:
        d = {headers[i]: r[i] for i in range(len(headers))}
        uuid = d.get("card_uuid")
        if not uuid:
            continue
        # Normalise #N/A values
        def _clean(v):
            if v == "#N/A" or v == "N/A":
                return None
            return v
        lookup[uuid] = {
            "PWRcorr": _clean(d.get("PWRcorr")),
            "Deck2": d.get("Deck2"),
            "has_bonus_symbol": bool(d.get("has_bonus_symbol")),
        }
    wb.close()
    return lookup


def _load_alt_images(agricola_json: str = "data/agricola.json") -> dict[str, str]:
    """Build a name→full_url map from agricola.json alt_image field."""
    import json as _json
    ALT_IMG_BASE = "https://hauk88.github.io/PlayAgricolaStatistics/img/"
    try:
        with open(agricola_json, "r") as f:
            data = _json.load(f)
        return {
            entry["name"].strip().lower(): ALT_IMG_BASE + entry["alt_image"]
            for entry in data
            if entry.get("alt_image")
        }
    except FileNotFoundError:
        return {}


def load_cards(json_path: str = "data/cards.json",
               stats_csv: str = "data/agricola_cards_all.csv") -> pl.DataFrame:
    """Load cards from cards.json (single source of truth), enrich with
    tournament stats from the legacy CSV, merge curated XLSX data, and build IRIs."""
    import json as _json

    with open(json_path, "r") as f:
        raw_cards = _json.load(f)

    # Load tournament stats for merge
    stats = _load_tournament_stats(stats_csv)

    # Load curated database XLSX (PWRcorr, Deck2, has_bonus_symbol)
    db_xlsx = _load_database_xlsx()

    # Load alt images from agricola.json (preferred over cards.json images)
    alt_images = _load_alt_images()

    # Build rows
    rows = []
    for c in raw_cards:
        name = c.get("card_name", "")
        name_lower = name.strip().lower()
        st = stats.get(name_lower, {})
        xlsx = db_xlsx.get(c.get("card_uuid", ""), {})

        # Use first deck for primary deck column; keep all decks as comma-sep
        decks = c.get("decks") or []
        primary_deck = decks[0] if decks else ""
        all_decks = ",".join(decks)

        # Cost string: new JSON uses "1W,1C" with commas → replace with spaces
        cost_raw = (c.get("cost") or "").replace(",", " ")

        # Image: prefer alt_image from agricola.json, fall back to cards.json
        name_key = name.strip().lower().replace(" ", "").replace("'", "").replace("-", "")
        alt_url = alt_images.get(name_key)
        if not alt_url:
            # Also try the raw lowercase name with spaces removed
            alt_url = alt_images.get(name.strip().lower())
        imgs = c.get("card_image_urls") or []
        image_url = alt_url or (imgs[0] if imgs else None)

        rows.append({
            "Card_ID": c.get("card_uuid", ""),
            "Name": name,
            "Type": c.get("card_type", ""),
            "Deck": primary_deck,
            "Decks": all_decks,
            "Players": str(c.get("min_no_players") or "") if c.get("min_no_players") else None,
            "Cost": cost_raw or None,
            "Prerequisite": c.get("requirement") or None,
            "Card_Text": c.get("card_text") or None,
            "Bonus_Points": str(c.get("victory_points")) if c.get("victory_points") else None,
            "image_url": image_url,
            "card_creator": c.get("card_creator") or None,
            "is_passing_minor": c.get("is_passing_minor", False),
            # Tournament stats (merged from CSV)
            "dealt": st.get("dealt"),
            "drafted": st.get("drafted"),
            "played": st.get("played"),
            "won": st.get("won"),
            "ADP": st.get("ADP"),
            "play_ratio": st.get("play_ratio"),
            "win_ratio": st.get("win_ratio"),
            "PWR": st.get("PWR"),
            "PWR_no_log": st.get("PWR_no_log"),
            "banned": st.get("banned"),
            "is_no": st.get("is_no"),
            # Curated database XLSX fields (merged on card_uuid)
            "PWRcorr": xlsx.get("PWRcorr"),
            "Deck2": xlsx.get("Deck2"),
            "has_bonus_symbol": xlsx.get("has_bonus_symbol", False),
        })

    df = pl.DataFrame(rows)

    # ── Subject IRI (use UUID) ────────────────────────────────────────────
    df = df.with_columns(
        (pl.lit(ns) + pl.col("Card_ID")).alias("subject")
    )

    # ── Type IRI (CamelCase) ──────────────────────────────────────────────
    df = df.with_columns(
        (pl.lit(ns) + pl.col("Type").str.replace(" ", "")).alias("Type")
    )

    # ── Cost IRI ──────────────────────────────────────────────────────────
    cost_col = df["Cost"].to_list()
    cost_iris, cost_labels = [], []
    cost_clay, cost_stone, cost_reed, cost_wood = [], [], [], []
    cost_food, cost_grain, cost_vegetable, cost_special = [], [], [], []

    for raw in cost_col:
        result = cost_to_iri(raw)
        if result is None:
            cost_iris.append(None); cost_labels.append(None)
            cost_clay.append(None); cost_stone.append(None)
            cost_reed.append(None); cost_wood.append(None)
            cost_food.append(None); cost_grain.append(None)
            cost_vegetable.append(None); cost_special.append(None)
        else:
            cost_iris.append(result["iri"])
            cost_labels.append(result["label"])
            res = result["resources"]
            cost_clay.append(res.get("clay")); cost_stone.append(res.get("stone"))
            cost_reed.append(res.get("reed")); cost_wood.append(res.get("wood"))
            cost_food.append(res.get("food")); cost_grain.append(res.get("grain"))
            cost_vegetable.append(res.get("vegetable"))
            cost_special.append(result["special_iri"])

    df = df.with_columns(
        pl.Series("hasCost", cost_iris, dtype=pl.Utf8),
        pl.Series("cost_label", cost_labels, dtype=pl.Utf8),
        pl.Series("cost_clay", cost_clay, dtype=pl.Int64),
        pl.Series("cost_stone", cost_stone, dtype=pl.Int64),
        pl.Series("cost_reed", cost_reed, dtype=pl.Int64),
        pl.Series("cost_wood", cost_wood, dtype=pl.Int64),
        pl.Series("cost_food", cost_food, dtype=pl.Int64),
        pl.Series("cost_grain", cost_grain, dtype=pl.Int64),
        pl.Series("cost_vegetable", cost_vegetable, dtype=pl.Int64),
        pl.Series("cost_special", cost_special, dtype=pl.Utf8),
    )

    return df


def build_card_annotations(cards_df: pl.DataFrame) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    """Build exploded DataFrames for gains, affects, and relations.

    Each row is a (subject, value) pair so maplib can produce one IRI triple per row.
    """
    texts = cards_df["Card_Text"].to_list()
    subjects = cards_df["subject"].to_list()
    gains_rows: list[dict] = []
    affects_rows: list[dict] = []
    relations_rows: list[dict] = []

    for subj, text in zip(subjects, texts):
        for g in extract_gains(text):
            gains_rows.append({"subject": subj, "gain": ns + g})
        for a in extract_affects(text):
            affects_rows.append({"subject": subj, "affect": ns + a})
        for r in extract_relations(text):
            relations_rows.append({"subject": subj, "relation": ns + r})

    gains_df = pl.DataFrame(gains_rows) if gains_rows else pl.DataFrame(schema={"subject": pl.Utf8, "gain": pl.Utf8})
    affects_df = pl.DataFrame(affects_rows) if affects_rows else pl.DataFrame(schema={"subject": pl.Utf8, "affect": pl.Utf8})
    relations_df = pl.DataFrame(relations_rows) if relations_rows else pl.DataFrame(schema={"subject": pl.Utf8, "relation": pl.Utf8})

    return gains_df, affects_df, relations_df


# ─── Cost permutation DataFrame (for the CostPermutation RDF instances) ──────

def build_cost_permutations(cards_df: pl.DataFrame) -> pl.DataFrame:
    """Build a DataFrame of unique CostPermutation resources for the template."""
    rows = []
    seen = set()

    for row in cards_df.iter_rows(named=True):
        iri = row.get("hasCost")
        if not iri or iri in seen:
            continue
        seen.add(iri)
        rows.append({
            "subject": iri,
            "label": row.get("cost_label", ""),
            "clay": row.get("cost_clay"),
            "stone": row.get("cost_stone"),
            "reed": row.get("cost_reed"),
            "wood": row.get("cost_wood"),
            "food": row.get("cost_food"),
            "grain": row.get("cost_grain"),
            "vegetable": row.get("cost_vegetable"),
            "costValue": row.get("cost_special"),
        })

    return pl.DataFrame(rows)


cards = load_cards()
cost_permutations = build_cost_permutations(cards)
card_gains, card_affects, card_relations = build_card_annotations(cards)

# Columns the OTTR Card template does NOT know about – drop before maplib mapping
_EXTRA_COLS = {"image_url", "card_creator", "is_passing_minor", "Decks",
               "PWRcorr", "Deck2", "has_bonus_symbol"}
cards_for_rdf = cards.drop([c for c in _EXTRA_COLS if c in cards.columns])
#print()
#print(card_gains.head(5))
#print(card_affects.head(5))
#print(card_relations.head(5))
