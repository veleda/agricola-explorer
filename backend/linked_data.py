"""
Linked Data HTML pages for the Agricola Knowledge Graph.

Generates:
  - /ontology        → HTML documentation of the ontology (classes, properties, individuals)
  - /{card-uuid}     → HTML page for a single card (dereferenceable IRI)
  - /deck_{code}     → HTML page for a deck instance
"""

import html as _html

NS = "http://agricola.veronahe.no/"

# ── Shared HTML scaffolding ──────────────────────────────────────────────────

_CSS = """
:root {
  --bg: #fafaf9; --fg: #1c1917; --muted: #78716c; --accent: #b45309;
  --border: #e7e5e4; --card-bg: #ffffff; --code-bg: #f5f5f4;
  --link: #b45309; --link-hover: #92400e;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "Inter", system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--fg); line-height: 1.6; }
a { color: var(--link); text-decoration: none; }
a:hover { color: var(--link-hover); text-decoration: underline; }
.container { max-width: 960px; margin: 0 auto; padding: 24px 20px; }
header { background: var(--fg); color: var(--bg); padding: 20px 0; margin-bottom: 32px; }
header .container { display: flex; align-items: center; gap: 16px; }
header h1 { font-size: 1.4rem; font-weight: 700; }
header .subtitle { color: var(--muted); font-size: 0.9rem; }
header a { color: var(--bg); opacity: 0.7; }
header a:hover { opacity: 1; text-decoration: none; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
.badge-class { background: #dbeafe; color: #1e40af; }
.badge-op { background: #dcfce7; color: #166534; }
.badge-dp { background: #fef3c7; color: #92400e; }
.badge-inst { background: #f3e8ff; color: #7c3aed; }
section { margin-bottom: 40px; }
section h2 { font-size: 1.2rem; font-weight: 700; border-bottom: 2px solid var(--accent); padding-bottom: 6px; margin-bottom: 16px; }
section h3 { font-size: 1rem; font-weight: 600; margin-bottom: 4px; }
.entry { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 12px; }
.entry .iri { font-family: "JetBrains Mono", monospace; font-size: 0.82rem; color: var(--muted); word-break: break-all; }
.entry .desc { margin-top: 6px; color: var(--fg); }
.meta-row { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 8px; font-size: 0.85rem; color: var(--muted); }
.meta-row span { white-space: nowrap; }
.meta-row .label { font-weight: 600; color: var(--fg); }
table.props { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
table.props th, table.props td { padding: 8px 12px; border-bottom: 1px solid var(--border); text-align: left; }
table.props th { font-weight: 600; background: var(--code-bg); }
.card-hero { display: flex; gap: 24px; flex-wrap: wrap; }
.card-img { width: 200px; border-radius: 8px; border: 1px solid var(--border); }
.card-details { flex: 1; min-width: 280px; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-top: 12px; }
.stat-box { background: var(--code-bg); border-radius: 6px; padding: 10px; text-align: center; }
.stat-box .val { font-size: 1.3rem; font-weight: 700; color: var(--accent); }
.stat-box .lbl { font-size: 0.75rem; color: var(--muted); }
.tag { display: inline-block; padding: 2px 8px; margin: 2px; border-radius: 12px; font-size: 0.78rem; background: var(--code-bg); border: 1px solid var(--border); }
.combo-list { list-style: none; padding: 0; }
.combo-list li { padding: 4px 0; border-bottom: 1px solid var(--border); }
.combo-list li:last-child { border-bottom: none; }
.combo-reason { font-size: 0.78rem; color: var(--muted); margin-left: 8px; }
footer { margin-top: 48px; padding: 20px 0; border-top: 1px solid var(--border); font-size: 0.8rem; color: var(--muted); text-align: center; }
.ns-table { font-family: monospace; font-size: 0.85rem; }
.ns-table td { padding: 4px 16px 4px 0; }
.back-link { font-size: 0.9rem; margin-bottom: 16px; display: block; }
@media (max-width: 600px) {
  .card-hero { flex-direction: column; }
  .card-img { width: 100%; max-width: 300px; }
}
"""


def _page(title: str, body: str, canonical: str = "") -> str:
    """Wrap body HTML in a full page with head, styles, etc."""
    canon = f'<link rel="canonical" href="{_html.escape(canonical)}" />' if canonical else ""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{_html.escape(title)}</title>
{canon}
<link rel="alternate" type="text/turtle" href="?format=turtle" />
<style>{_CSS}</style>
</head>
<body>
{body}
</body>
</html>"""


def _e(text) -> str:
    """HTML-escape helper."""
    return _html.escape(str(text)) if text else ""


def _iri_link(iri: str, label: str = "") -> str:
    """Make a clickable link from an IRI."""
    display = label or iri.replace(NS, ":")
    if iri.startswith(NS):
        local = iri[len(NS):]
        return f'<a href="/{_html.escape(local)}">{_e(display)}</a>'
    return f'<a href="{_html.escape(iri)}">{_e(display)}</a>'


# ── Ontology documentation page ──────────────────────────────────────────────

def build_ontology_page(all_cards: list, deck_info: list[dict]) -> str:
    """Generate HTML documentation for the Agricola ontology."""

    classes = [
        ("CardCategory", "Card Category", "Abstract superclass for all card types."),
        ("Occupation", "Occupation", "Occupation cards that represent workers and specialists."),
        ("MajorImprovement", "Major Improvement", "Shared improvement cards available to all players."),
        ("MinorImprovement", "Minor Improvement", "Personal improvement cards drafted by players."),
        ("CostPermutation", "Cost Permutation", "A unique combination of resources required to play a card."),
        ("Deck", "Deck", "A named card deck or expansion for Agricola."),
        ("Edition", "Edition", "A major Agricola game edition (Original 2007 or Revised 2016)."),
    ]

    object_props = [
        ("hasCost", "has cost", "CardCategory", "CostPermutation", "Links a card to its resource cost."),
        ("deck", "deck", "CardCategory", "Deck", "The deck this card belongs to."),
        ("gains", "gains", "CardCategory", "", "Resource or effect this card produces."),
        ("affects", "affects", "CardCategory", "", "Game mechanic this card interacts with."),
        ("relatedTo", "related to", "CardCategory", "CardCategory", "Another card referenced in this card's text."),
        ("compatibleWith", "compatible with", "Deck", "Edition", "Which Agricola edition a deck is compatible with."),
        ("costValue", "cost value", "CostPermutation", "", "Special cost resource reference."),
    ]

    datatype_props = [
        ("id", "card ID", "xsd:string", "Unique card UUID."),
        ("deckCode", "deck code", "xsd:string", "Short letter code identifying a deck."),
        ("description", "description", "xsd:string", "Human-readable description."),
        ("year", "year", "xsd:integer", "Year of publication."),
        ("publisher", "publisher", "xsd:string", "Game publisher name."),
        ("players", "minimum players", "xsd:string", "Minimum player count for this card."),
        ("prerequisite", "prerequisite", "xsd:string", "Prerequisite condition for playing this card."),
        ("cardText", "card text", "xsd:string", "Full rules text of the card."),
        ("bonusPoints", "bonus points", "xsd:string", "Victory points awarded by this card."),
        ("dealt", "times dealt", "xsd:double", "Number of times dealt in tournaments."),
        ("drafted", "times drafted", "xsd:double", "Number of times drafted in tournaments."),
        ("played", "times played", "xsd:double", "Number of times played in tournaments."),
        ("won", "times won", "xsd:double", "Number of times won with."),
        ("adp", "average draft position", "xsd:double", "Average pick number when drafted."),
        ("pwr", "power rating", "xsd:double", "Corrected power rating from tournament data."),
        ("playRatio", "play ratio", "xsd:double", "Proportion of drafts where card was played."),
        ("winRatio", "win ratio", "xsd:double", "Proportion of plays that resulted in a win."),
        ("banned", "banned", "xsd:boolean", "Whether this card is currently banned."),
        ("isNo", "in Norwegian deck", "xsd:boolean", "Whether this card is in the Norwegian tournament deck."),
    ]

    # Build sections
    parts = []

    # Header
    parts.append("""
<header>
<div class="container">
  <div>
    <h1>Agricola Card Ontology</h1>
    <div class="subtitle">Knowledge graph for the Agricola board game card database</div>
  </div>
  <div style="margin-left:auto">
    <a href="/">Explorer</a>
  </div>
</div>
</header>
""")

    parts.append('<div class="container">')

    # Namespace table
    parts.append("""
<section>
<h2>Namespace</h2>
<table class="ns-table">
<tr><td><strong>Prefix</strong></td><td><strong>IRI</strong></td></tr>
<tr><td>:</td><td>http://agricola.veronahe.no/</td></tr>
<tr><td>owl:</td><td>http://www.w3.org/2002/07/owl#</td></tr>
<tr><td>rdfs:</td><td>http://www.w3.org/2000/01/rdf-schema#</td></tr>
<tr><td>xsd:</td><td>http://www.w3.org/2001/XMLSchema#</td></tr>
</table>
</section>
""")

    # Stats overview
    n_cards = len(all_cards)
    n_occ = sum(1 for c in all_cards if c["type"] == "Occupation")
    n_minor = sum(1 for c in all_cards if c["type"] == "MinorImprovement")
    n_major = sum(1 for c in all_cards if c["type"] == "MajorImprovement")
    n_decks = len(deck_info)

    parts.append(f"""
<section>
<h2>Overview</h2>
<div class="stat-grid">
  <div class="stat-box"><div class="val">{n_cards}</div><div class="lbl">Cards</div></div>
  <div class="stat-box"><div class="val">{n_occ}</div><div class="lbl">Occupations</div></div>
  <div class="stat-box"><div class="val">{n_minor}</div><div class="lbl">Minor Improvements</div></div>
  <div class="stat-box"><div class="val">{n_major}</div><div class="lbl">Major Improvements</div></div>
  <div class="stat-box"><div class="val">{n_decks}</div><div class="lbl">Decks</div></div>
</div>
</section>
""")

    # Classes
    parts.append("<section><h2>Classes</h2>")
    for local, label, desc in classes:
        iri = NS + local
        parts.append(f"""
<div class="entry" id="{_e(local)}">
  <h3><span class="badge badge-class">Class</span> {_e(label)}</h3>
  <div class="iri">{_e(iri)}</div>
  <div class="desc">{_e(desc)}</div>
</div>""")
    parts.append("</section>")

    # Object Properties
    parts.append("<section><h2>Object Properties</h2>")
    for local, label, domain, range_, desc in object_props:
        iri = NS + local
        meta = []
        if domain:
            meta.append(f'<span><span class="label">Domain:</span> :{_e(domain)}</span>')
        if range_:
            meta.append(f'<span><span class="label">Range:</span> :{_e(range_)}</span>')
        parts.append(f"""
<div class="entry" id="{_e(local)}">
  <h3><span class="badge badge-op">ObjectProperty</span> {_e(label)}</h3>
  <div class="iri">{_e(iri)}</div>
  <div class="desc">{_e(desc)}</div>
  <div class="meta-row">{"".join(meta)}</div>
</div>""")
    parts.append("</section>")

    # Datatype Properties
    parts.append("<section><h2>Datatype Properties</h2>")
    for local, label, range_, desc in datatype_props:
        iri = NS + local
        parts.append(f"""
<div class="entry" id="{_e(local)}">
  <h3><span class="badge badge-dp">DatatypeProperty</span> {_e(label)}</h3>
  <div class="iri">{_e(iri)}</div>
  <div class="desc">{_e(desc)}</div>
  <div class="meta-row"><span><span class="label">Range:</span> {_e(range_)}</span></div>
</div>""")
    parts.append("</section>")

    # Footer
    parts.append("""
<footer>
  Agricola Card Ontology &middot; <a href="/api/export-rdf">Download as Turtle</a> &middot; <a href="/">Back to Explorer</a>
</footer>
""")
    parts.append("</div>")  # container

    return _page(
        "Agricola Card Ontology",
        "\n".join(parts),
        canonical=NS + "ontology",
    )


# ── Card detail page ─────────────────────────────────────────────────────────

def build_card_page(card: dict, all_cards_by_id: dict) -> str:
    """Generate an HTML page for a single card."""

    name = card["name"]
    card_type = card["type"]
    deck = card["deck"]
    text = card.get("text", "")
    img = card.get("imageUrl", "")
    cost_label = card.get("costLabel", "")
    prereq = card.get("prerequisite", "")

    parts = []

    # Header
    parts.append(f"""
<header>
<div class="container">
  <div>
    <h1>{_e(name)}</h1>
    <div class="subtitle">{_e(card_type)} &middot; Deck {_e(deck)}</div>
  </div>
  <div style="margin-left:auto">
    <a href="/">Explorer</a> &middot; <a href="/ontology">Ontology</a>
  </div>
</div>
</header>
""")

    parts.append('<div class="container">')
    parts.append(f'<a class="back-link" href="/">&larr; Back to Explorer</a>')

    # Hero: image + details
    parts.append('<div class="card-hero">')
    if img:
        # Use image proxy to avoid mixed content
        proxy_url = f"/api/imgproxy?url={img}"
        parts.append(f'<img class="card-img" src="{_e(proxy_url)}" alt="{_e(name)}" />')

    parts.append('<div class="card-details">')

    # Basic info table
    parts.append('<table class="props">')
    parts.append(f'<tr><th>IRI</th><td style="font-family:monospace;font-size:0.82rem;word-break:break-all">{_e(NS + card["id"])}</td></tr>')
    parts.append(f'<tr><th>Type</th><td>{_e(card_type)}</td></tr>')
    parts.append(f'<tr><th>Deck</th><td><a href="/deck_{_e(deck)}">{_e(deck)}</a></td></tr>')
    if cost_label:
        parts.append(f'<tr><th>Cost</th><td>{_e(cost_label)}</td></tr>')
    if prereq:
        parts.append(f'<tr><th>Prerequisite</th><td>{_e(prereq)}</td></tr>')
    if card.get("banned"):
        parts.append('<tr><th>Status</th><td style="color:#dc2626;font-weight:600">Banned</td></tr>')
    if card.get("isNo"):
        parts.append('<tr><th>Norwegian Deck</th><td>Yes</td></tr>')
    parts.append('</table>')

    # Card text
    if text:
        parts.append(f'<div style="margin-top:16px;padding:12px;background:var(--code-bg);border-radius:6px;font-size:0.9rem">{_e(text)}</div>')

    parts.append('</div></div>')  # card-details + card-hero

    # Tournament stats
    stats = [
        ("PWR", card.get("pwr", 0)),
        ("ADP", card.get("adp", 0)),
        ("Play Ratio", f"{card.get('playRatio', 0):.1%}" if card.get("playRatio") else "—"),
        ("Win Ratio", f"{card.get('winRatio', 0):.1%}" if card.get("winRatio") else "—"),
    ]
    parts.append('<section style="margin-top:24px"><h2>Tournament Statistics</h2>')
    parts.append('<div class="stat-grid">')
    for label, val in stats:
        display = val if isinstance(val, str) else f"{val:.2f}" if val else "—"
        parts.append(f'<div class="stat-box"><div class="val">{_e(str(display))}</div><div class="lbl">{_e(label)}</div></div>')
    parts.append('</div></section>')

    # Gains & Affects
    gains = card.get("gains", [])
    affects = card.get("affects", [])
    if gains or affects:
        parts.append('<section><h2>Semantic Tags</h2>')
        if gains:
            parts.append('<div style="margin-bottom:8px"><strong>Gains:</strong> ')
            parts.append(" ".join(f'<span class="tag">{_e(g)}</span>' for g in gains))
            parts.append('</div>')
        if affects:
            parts.append('<div><strong>Affects:</strong> ')
            parts.append(" ".join(f'<span class="tag">{_e(a)}</span>' for a in affects))
            parts.append('</div>')
        parts.append('</section>')

    # Combos
    combos = card.get("combos", [])
    if combos:
        parts.append('<section><h2>Works Well With</h2>')
        parts.append('<ul class="combo-list">')
        for c in combos[:20]:
            cid = c.get("id", "")
            cname = c.get("name", cid)
            reason = c.get("reasonLabel", c.get("reason", ""))
            parts.append(f'<li><a href="/{_e(cid)}">{_e(cname)}</a><span class="combo-reason">{_e(reason)}</span></li>')
        parts.append('</ul></section>')

    # RDF snippet — full card triples
    rdf_snippet = card_to_html_pre(card)

    parts.append(f"""
<section>
<h2>RDF (Turtle)</h2>
<pre style="background:var(--code-bg);padding:16px;border-radius:8px;font-size:0.8rem;overflow-x:auto;white-space:pre-wrap">{rdf_snippet}</pre>
</section>
""")

    # Footer
    parts.append("""
<footer>
  Agricola Card Ontology &middot; <a href="/ontology">Ontology Documentation</a> &middot; <a href="/">Explorer</a>
</footer>
""")
    parts.append('</div>')

    return _page(name + " — Agricola", "\n".join(parts), canonical=NS + card["id"])


# ── Deck detail page ─────────────────────────────────────────────────────────

def build_deck_page(deck: dict, cards_in_deck: list[dict]) -> str:
    """Generate an HTML page for a deck instance."""

    label = deck["label"]
    code = deck.get("code", "")
    desc = deck.get("description", "")
    year = deck.get("year", "")
    publisher = deck.get("publisher", "")
    compat = deck.get("compatible", [])

    parts = []

    parts.append(f"""
<header>
<div class="container">
  <div>
    <h1>{_e(label)}</h1>
    <div class="subtitle">Deck code: {_e(code)}</div>
  </div>
  <div style="margin-left:auto">
    <a href="/">Explorer</a> &middot; <a href="/ontology">Ontology</a>
  </div>
</div>
</header>
""")

    parts.append('<div class="container">')
    parts.append(f'<a class="back-link" href="/ontology">&larr; Back to Ontology</a>')

    # Info
    parts.append(f"""
<div class="entry">
  <div class="iri">{_e(NS + deck["local"])}</div>
  <div class="desc" style="margin-top:8px">{_e(desc)}</div>
  <div class="meta-row">
    {"<span><span class='label'>Year:</span> " + _e(str(year)) + "</span>" if year else ""}
    {"<span><span class='label'>Publisher:</span> " + _e(publisher) + "</span>" if publisher else ""}
    {"<span><span class='label'>Compatible with:</span> " + _e(', '.join(compat)) + "</span>" if compat else ""}
    <span><span class="label">Cards in deck:</span> {len(cards_in_deck)}</span>
  </div>
</div>
""")

    # Card list
    if cards_in_deck:
        # Group by type
        by_type: dict[str, list] = {}
        for c in cards_in_deck:
            by_type.setdefault(c["type"], []).append(c)

        parts.append('<section><h2>Cards</h2>')
        for ctype in sorted(by_type.keys()):
            clist = sorted(by_type[ctype], key=lambda c: c["name"])
            parts.append(f'<h3 style="margin-top:16px;margin-bottom:8px">{_e(ctype)} ({len(clist)})</h3>')
            parts.append('<table class="props">')
            parts.append('<tr><th>Name</th><th>PWR</th><th>ADP</th><th>Cost</th></tr>')
            for c in clist:
                pwr = f"{c['pwr']:.2f}" if c.get("pwr") else "—"
                adp = f"{c['adp']:.1f}" if c.get("adp") else "—"
                cost = c.get("costLabel", "") or "—"
                parts.append(f'<tr><td><a href="/{_e(c["id"])}">{_e(c["name"])}</a></td><td>{pwr}</td><td>{adp}</td><td>{_e(cost)}</td></tr>')
            parts.append('</table>')
        parts.append('</section>')

    parts.append("""
<footer>
  Agricola Card Ontology &middot; <a href="/ontology">Ontology Documentation</a> &middot; <a href="/">Explorer</a>
</footer>
""")
    parts.append('</div>')

    return _page(label + " — Agricola", "\n".join(parts), canonical=NS + deck["local"])


# ── Full card Turtle builder ──────────────────────────────────────────────────

def _card_triples(card: dict, use_prefix: bool = True) -> list[str]:
    """Build all Turtle triples for a card.

    If *use_prefix* is True, subjects/objects use the ``:`` prefix
    (compact Turtle for content-negotiated responses).
    If False, subjects/objects use full ``<IRI>`` form
    (for display inside ``<pre>`` on HTML pages).

    Predicates always use the ``:`` prefix form, and typed literals
    use ``xsd:`` datatype annotations matching the ontology.
    """
    iri = lambda local: f":{local}" if use_prefix else f"<{NS}{local}>"

    lines = [f'{iri(card["id"])} a :{card["type"]} ;']
    lines.append(f'    rdfs:label "{card["name"]}"@en ;')

    if card.get("deck"):
        lines.append(f'    :deck {iri("deck_" + card["deck"])} ;')

    if card.get("text"):
        escaped = card["text"].replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
        lines.append(f'    :cardText "{escaped}"@en ;')

    if card.get("costLabel"):
        lines.append(f'    :hasCost {iri(card["cost"])} ;')

    if card.get("prerequisite"):
        escaped = card["prerequisite"].replace('"', '\\"')
        lines.append(f'    :prerequisite "{escaped}"^^xsd:string ;')

    if card.get("pwr"):
        lines.append(f'    :pwr "{card["pwr"]:.4f}"^^xsd:double ;')

    if card.get("adp"):
        lines.append(f'    :adp "{card["adp"]:.4f}"^^xsd:double ;')

    if card.get("playRatio"):
        lines.append(f'    :playRatio "{card["playRatio"]:.4f}"^^xsd:double ;')

    if card.get("winRatio"):
        lines.append(f'    :winRatio "{card["winRatio"]:.4f}"^^xsd:double ;')

    if card.get("banned"):
        lines.append(f'    :banned "true"^^xsd:boolean ;')

    if card.get("isNo"):
        lines.append(f'    :isNo "true"^^xsd:boolean ;')

    for g in card.get("gains", []):
        lines.append(f'    :gains {iri(g)} ;')

    for a in card.get("affects", []):
        lines.append(f'    :affects {iri(a)} ;')

    for r in card.get("relations", []):
        lines.append(f'    :relatedTo {iri(r)} ;')

    # Replace last ; with .
    if lines[-1].endswith(" ;"):
        lines[-1] = lines[-1][:-2] + " ."
    else:
        lines.append("    .")

    return lines


def card_to_turtle(card: dict) -> str:
    """Return a complete Turtle document for a single card."""
    header = [
        f'@prefix : <{NS}> .',
        f'@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        f'@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
        '',
    ]
    return "\n".join(header + _card_triples(card, use_prefix=True))


def card_to_html_pre(card: dict) -> str:
    """Return HTML-escaped Turtle for use inside a <pre> tag.
    Includes @prefix declarations so the : shorthand is valid Turtle."""
    header = [
        f'@prefix : &lt;{NS}&gt; .',
        '@prefix rdfs: &lt;http://www.w3.org/2000/01/rdf-schema#&gt; .',
        '@prefix xsd: &lt;http://www.w3.org/2001/XMLSchema#&gt; .',
        '',
    ]
    lines = _card_triples(card, use_prefix=True)
    return "\n".join(header + [_e(line) for line in lines])


# ── About / documentation page ───────────────────────────────────────────────

def build_about_page(total_cards: int, total_decks: int) -> str:
    """Generate the About page with documentation, links, and credits."""

    parts = []

    # Header
    parts.append("""
<header>
<div class="container">
  <div>
    <h1>About Agricola Explorer</h1>
    <div class="subtitle">A companion web app for the Agricola board game community</div>
  </div>
  <div style="margin-left:auto">
    <a href="/">Explorer</a>
  </div>
</div>
</header>
""")

    parts.append('<div class="container">')
    parts.append('<a class="back-link" href="/">&larr; Back to Explorer</a>')

    # Intro
    parts.append(f"""
<section>
<h2>What is Agricola Explorer?</h2>
<div class="entry">
<p style="margin-bottom:12px">
  Agricola Explorer is a free, open-source companion app for
  <a href="https://boardgamegeek.com/boardgame/31260/agricola" target="_blank" rel="noopener">Agricola</a>,
  the beloved farming board game by Uwe Rosenberg. It is built for the Norwegian tournament community
  and anyone who wants to explore the full card database, track scores, and draft cards.
</p>
<p>
  The app currently covers <strong>{total_cards}</strong> cards across <strong>{total_decks}</strong> decks,
  enriched with tournament statistics from the competitive scene.
</p>
</div>
</section>
""")

    # Features
    parts.append("""
<section>
<h2>Features</h2>

<div class="entry">
  <h3>Card Explorer</h3>
  <p style="margin-top:6px">
    Browse all Agricola cards in a searchable, filterable interface. View cards as a table, gallery,
    or interactive force-directed knowledge graph. Filter by deck, type, gains, affects, and more.
    Run custom SPARQL queries against the full RDF knowledge graph.
  </p>
</div>

<div class="entry">
  <h3>Card Drafter</h3>
  <p style="margin-top:6px">
    Simulate a full 7-round card draft for Occupations and Minor Improvements.
    Save your drafted hands to the community database and discover twins &mdash;
    other players who drafted the exact same hand. Tag card combos and leave comments.
  </p>
</div>

<div class="entry">
  <h3>Community Hands</h3>
  <p style="margin-top:6px">
    Browse all saved draft hands from the community. Search by player name or card name,
    see the most popular picks, and find twin hands.
  </p>
</div>

<div class="entry">
  <h3>Score Sheet</h3>
  <p style="margin-top:6px">
    Record your game scores with a full scoring sheet. Tracks all standard categories (fields, pastures,
    grain, vegetables, sheep, boar, cattle, rooms, family members, improvements, bonus points, begging cards).
    Log which cards you played and browse the community score database.
  </p>
</div>

<div class="entry">
  <h3>Card Scanner (OCR)</h3>
  <p style="margin-top:6px">
    Take a photo of your physical Agricola cards and the app will identify them using AI vision
    (powered by Claude). Works from the Score Sheet &mdash; snap a photo and your played cards are
    automatically logged.
  </p>
</div>

<div class="entry">
  <h3>Backup &amp; Restore</h3>
  <p style="margin-top:6px">
    Export all your data (scores, drafts, community hands) as a JSON backup file.
    Import backups to restore your data. Also export the full card knowledge graph as RDF (Turtle format).
  </p>
</div>
</section>
""")

    # Install as mobile app
    parts.append("""
<section>
<h2>Install on Mobile</h2>
<div class="entry">
<p style="margin-bottom:12px">
  Agricola Explorer is a Progressive Web App (PWA). You can install it on your phone's home screen
  for a native app-like experience:
</p>
<p style="margin-bottom:8px"><strong>iPhone / iPad (Safari):</strong></p>
<ol style="margin-left:20px;margin-bottom:12px">
  <li>Open <a href="https://agricola.veronahe.no">agricola.veronahe.no</a> in Safari</li>
  <li>Tap the Share button (square with arrow)</li>
  <li>Scroll down and tap <em>Add to Home Screen</em></li>
</ol>
<p style="margin-bottom:8px"><strong>Android (Chrome):</strong></p>
<ol style="margin-left:20px">
  <li>Open <a href="https://agricola.veronahe.no">agricola.veronahe.no</a> in Chrome</li>
  <li>Tap the three-dot menu</li>
  <li>Tap <em>Add to Home screen</em> or <em>Install app</em></li>
</ol>
</div>
</section>
""")

    # Linked Data & Ontology
    parts.append(f"""
<section>
<h2>Linked Data &amp; Knowledge Graph</h2>
<div class="entry">
<p style="margin-bottom:12px">
  The entire card database is modelled as an RDF knowledge graph using OWL and
  <a href="https://ottr.xyz" target="_blank" rel="noopener">OTTR templates</a>.
  Every card and deck has a dereferenceable IRI that returns either HTML (for browsers)
  or Turtle RDF (for Semantic Web clients).
</p>

<p style="margin-bottom:8px"><strong>Key URLs:</strong></p>
<table class="props" style="margin-bottom:16px">
  <tr><td><a href="/ontology">Ontology Documentation</a></td><td>Classes, properties, and schema</td></tr>
  <tr><td><a href="/api/export-rdf">Full RDF Export</a></td><td>Download the complete knowledge graph as Turtle</td></tr>
  <tr><td><a href="/deck_E">Example: E Deck</a></td><td>Dereferenceable deck IRI (HTML)</td></tr>
</table>

<p style="margin-bottom:8px"><strong>Content negotiation example:</strong></p>
<pre style="background:var(--code-bg);padding:12px;border-radius:6px;font-size:0.82rem;overflow-x:auto">curl -H "Accept: text/turtle" https://agricola.veronahe.no/ontology</pre>

<p style="margin-top:12px">
  The namespace is <code style="background:var(--code-bg);padding:2px 6px;border-radius:4px;font-size:0.85rem">http://agricola.veronahe.no/</code>
</p>
</div>
</section>
""")

    # Links
    parts.append("""
<section>
<h2>Project Links</h2>
<div class="entry">
<table class="props">
  <tr>
    <td><a href="https://github.com/veleda/agricola-explorer" target="_blank" rel="noopener">GitHub Repository</a></td>
    <td>Source code, issues, and contributions</td>
  </tr>
  <tr>
    <td><a href="https://substack.com/home/post/p-192181152" target="_blank" rel="noopener">Substack Article</a></td>
    <td>Blog post about the project</td>
  </tr>
  <tr>
    <td><a href="https://github.com/veleda/agricola-explorer/issues" target="_blank" rel="noopener">Feedback &amp; Bug Reports</a></td>
    <td>Open an issue on GitHub</td>
  </tr>
</table>
</div>
</section>
""")

    # Acknowledgements
    parts.append("""
<section>
<h2>Acknowledgements</h2>
<div class="entry">
<p style="margin-bottom:12px">
  A huge thank you to <a href="https://agricola.no" target="_blank" rel="noopener">Agricola Norge</a>
  for invaluable feedback, encouragement, and for fostering such a wonderful tournament community in Norway.
</p>
</div>
</section>
""")

    # About me
    parts.append("""
<section>
<h2>About the Author</h2>
<div class="entry">
<p>
  Agricola Explorer is built by <strong>Veronika Heimsbakk</strong>, a developer and Agricola enthusiast from Norway.
  The project combines a love for board games with semantic web technologies, aiming to give the
  Agricola community a useful tool for exploring cards, tracking games, and sharing drafts.
</p>
</div>
</section>
""")

    # Footer
    parts.append("""
<footer>
  Agricola Explorer &middot; <a href="/">Back to Explorer</a> &middot; <a href="/ontology">Ontology</a> &middot;
  <a href="https://github.com/veleda/agricola-explorer" target="_blank" rel="noopener">GitHub</a>
</footer>
""")
    parts.append("</div>")

    return _page("About — Agricola Explorer", "\n".join(parts), canonical=NS + "about")
