# Why I Built a Board Game Companion App on a Knowledge Graph

*How maplib and RDF turned 1,900 Agricola cards into a queryable, interconnected data model — and what I learned along the way.*

---

In a busy everyday life with two small children and work around the clock, there isn't much time for one of my favourite hobbies: board games with adults. Snakes and ladders won't cut it. But luckily, there's a community of Agricola fans in Norway, and it happens to be my favourite game. They organise tournaments at sea — among other venues — playing for a whole weekend. Whenever one of those weekends fits my calendar, I jump on it.

There's a catch, though. I don't own the tournament card decks, the Revised cards in my core game aren't much use in competitive play, and when you only sit down to play with adults every other year, you can't just rely on memory. Nearly 2,000 unique cards across dozens of decks and expansions — you need a way to study them, browse them, draft practice hands, and understand which cards work well together.

So I built Agricola Explorer: a web app for browsing, drafting, and analysing the full card pool, with iterative updates and improvements shaped by feedback from the Norwegian Agricola community. I built it through vibe coding with my friend Claude — rapid back-and-forth sessions turning ideas into features.

The interesting technical part isn't the React frontend or the FastAPI server. It's what sits between them: a knowledge graph powered by maplib, a Python library for building RDF graphs from tabular data using OTTR templates.

## The problem with flat data

The card data starts its life as a JSON file — 1,898 entries, each with a name, type, deck, cost string, card text, and some tournament statistics. A CSV file adds competitive play data: how often each card is drafted, played, and wins. An Excel spreadsheet contributes curated corrections and a definitive Norwegian tournament deck list of 965 cards.

Three sources, different schemas, overlapping but not identical card pools. The classic data integration headache.

A relational database could handle this, but the interesting questions about Agricola cards aren't tabular. They're relational in the graph sense: "Which cards produce grain?" leads to "Which cards cost grain?" leads to "So which cards work well together?" That's a traversal, not a join.

## Enter maplib

maplib is a Python library built on Apache Arrow that lets you define RDF graph templates (using the OTTR template language) and then map tabular data — Polars DataFrames — directly into those templates. The result is a fully queryable RDF knowledge graph that you can run SPARQL against.

The core idea is simple: you define what a "Card" looks like in your ontology, then point maplib at your DataFrame and say "each row is a Card." It handles the rest — minting IRIs, creating triples, enforcing types.

Here's the actual template that defines an Agricola card in the system:

```turtle
:Card [
    ? xsd:string ?Card_ID,
      xsd:string ?Name,
    ? ottr:IRI   ?Type,
    ? xsd:string ?Deck,
    ? xsd:string ?Cost,
    ? xsd:string ?Card_Text,
    ? xsd:double ?win_ratio,
    ? ottr:IRI   ?hasCost,
      ottr:IRI   ?subject ] :: {
  ottr:Triple(?subject, rdfs:label, ?Name),
  ottr:Triple(?subject, rdf:type, ?Type),
  ottr:Triple(?subject, def:Deck, ?Deck),
  ottr:Triple(?subject, :hasCost, ?hasCost),
  ...
} .
```

And here's how the mapping happens in Python:

```python
from maplib import Model

m = Model()
m.add_template(open("tpl/tpl.ttl").read())
m.map(ns + "Card", cards_dataframe)
m.map(ns + "CardGain", gains_dataframe)
m.map(ns + "CardAffect", affects_dataframe)
m.map(ns + "CardRelation", relations_dataframe)
m.map(ns + "CostPermutation", cost_permutations)
m.read("ontology.ttl")
```

Five template mappings, five DataFrames, and the graph is built. The model loads at server startup and stays in memory, ready for SPARQL queries.

## What the graph makes possible

Once the data lives in a graph, queries that would be awkward in SQL become natural. The Card Explorer exposes a SPARQL editor where users can write arbitrary queries against the live model. But behind the scenes, the more interesting use is in the structured filter system.

When a user selects filters — say, cards that gain grain and affect sowing — the frontend builds a SPARQL query:

```sparql
PREFIX : <http://veronahe.no/agricola/>
SELECT ?name ?deck ?winRatio
WHERE {
  ?card rdfs:label ?name ; def:Deck ?deck ; def:win_ratio ?winRatio .
  ?card :gains :grain .
  ?card :affects ?aff . FILTER(?aff IN (:sow))
}
ORDER BY DESC(?winRatio)
```

This hits the maplib model on the backend and returns results in milliseconds. The graph pattern matching is doing real work here — it's not just filtering columns, it's traversing relationships between cards, their gains, their costs, and their effects.

## Inferring card combos from graph structure

The most ambitious use of the graph is combo detection. Agricola strategy revolves around card synergies — cards that are individually decent but become powerful together. The system infers these combos from the graph structure using rules that would be natural datalog but are currently implemented in Python:

**Supply chain combos**: if Card A gains grain and Card B costs grain, they have a supply-chain synergy. With nearly 2,000 cards, there are only 13 that cost grain, so these connections are genuinely meaningful.

**Animal husbandry combos**: cards that gain animals are matched with cards that affect breeding, but only if the animal-producing card also provides infrastructure (pastures, fences, stables). This tightening avoids the combinatorial explosion of connecting every sheep card to every breeding card.

**Baking strategy combos**: grain producers are linked to baking cards, but only those that also affect sowing or harvesting — identifying cards that support a complete grain-to-bread pipeline.

**Card reference combos**: many Agricola cards mention other cards by name in their text. The system parses these references, resolves them to graph subjects, and creates bidirectional combo links.

These rules produce thousands of combo pairs that surface in the UI when users browse or draft cards. The graph representation makes these rules readable and composable — each one is a pattern over the same underlying triples.

## The data engineering pipeline

Getting clean data into the graph turned out to be the hardest part. The card text is natural language, and extracting structured information from it required building a domain-specific NLP pipeline (really a collection of regex patterns and keyword extractors tuned to Agricola's vocabulary).

The pipeline runs through several stages:

1. **Load and merge**: cards.json provides the base card data, the tournament CSV adds competitive statistics, and the curated Excel database contributes corrected power ratings and the definitive Norwegian deck membership (matched by UUID for exactness).

2. **Cost parsing**: card costs like "1 Wood, 2 Clay" are parsed into structured resource vectors and minted as IRI nodes so the graph can reason about resource requirements.

3. **Text annotation**: card text is scanned for gain keywords (grain, wood, sheep, family growth...), effect keywords (sow, harvest, breed, renovate...), and card name references. Each annotation becomes a separate triple in the graph.

4. **Combo inference**: the rules described above run over the annotation DataFrames to produce synergy pairs.

5. **Template mapping**: the cleaned DataFrames are mapped through OTTR templates into the RDF model.

All of this runs at server startup. The entire pipeline — loading three data sources, parsing 1,898 card texts, inferring combos, and building the graph — completes in a few seconds.

## Why not just use a database?

Fair question. A PostgreSQL database with a few well-designed tables could serve card data and handle filtering. For a simpler app, that would be the right choice.

The knowledge graph earns its keep in three ways. First, the SPARQL interface gives power users (and the Agricola community is full of them) the ability to ask questions nobody anticipated — "show me all 3+ player occupations from the Globus deck that cost food and affect renovation" is a valid SPARQL query, not a feature request. Second, the combo inference rules are more naturally expressed as graph patterns than as SQL joins, especially when they need to chain multiple relationship types. Third, the OTTR template approach made the data model remarkably easy to evolve — adding a new card property means adding a column to the DataFrame and a line to the template, not a database migration.

## The tech stack

For anyone considering a similar approach: the full stack is **Polars** for data engineering (fast, expressive DataFrame library), **maplib** for RDF graph construction and SPARQL querying, **FastAPI** for the backend API, **React** for the frontend, and **SQLite** for the mutable data (saved draft hands and scores). The knowledge graph handles the read-heavy, relationship-rich card data; SQLite handles the write-heavy, simple-schema user data. Each tool does what it's good at.

maplib is still a relatively young library, but for the pattern of "I have tabular data and I want to query it as a graph," it's remarkably smooth. The OTTR templates are a clean abstraction over raw RDF, and the Polars integration means you can do heavy data wrangling before anything touches the graph.

## What I'd do differently

If I were starting over, I'd invest earlier in a formal ontology. The current one grew organically, and some naming choices (like using a `def:` prefix for properties that should be in the main namespace) reflect early experiments that stuck around. I'd also explore using maplib's SHACL validation to catch data quality issues at graph construction time rather than discovering them when queries return unexpected results.

The combo inference rules are also ready to graduate from Python functions to proper graph-native rules. maplib's roadmap includes datalog-style rule support, which would let the combo logic live alongside the data in the graph rather than in a separate processing step.

## Wrapping up

Building a board game companion app might seem like overkill territory for knowledge graphs. But Agricola's card pool is genuinely complex — thousands of entities with typed relationships, strategic interdependencies, and a community that asks sophisticated analytical questions. A knowledge graph didn't just fit the problem; it made features possible that would have been painful to build any other way.

If you're working with richly interconnected domain data — whether it's board game cards, recipe ingredients, or hardware components — and you find yourself writing increasingly tortured SQL queries to express relationship patterns, it might be worth reaching for maplib and seeing what your data looks like as a graph.

---

*Agricola Explorer is an open-source project. The maplib library is available on PyPI. OTTR (Reasonable Ontology Templates) is a W3C Member Submission for templated RDF construction.*
