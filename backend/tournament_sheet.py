"""
Live tournament spreadsheet for the tournament admin view.

Uses exactly the same rules as the Excel export (tournament_export.py):
* per table: RelSc = score - table average, table rank (Excel RANK), points 10/6/3/1
  (players with the same score share the points for the places they occupy equally)
* ZTurnP / ZRelSc = cumulative points / relative score
* standings by ZTurnP, then ZRelSc
* final (optional): points x weight, placings decided table by table
Players seated by the draw who have not reported yet are listed as missing; the
table is then computed among the scores that are in (marked incomplete).
"""

from __future__ import annotations

from statistics import mean

try:
    from tournament_export import (FINAL_GAME, _excel_rank, _nb_key, _points, _shared_points, _prepare)
except ModuleNotFoundError:
    from backend.tournament_export import (FINAL_GAME, _excel_rank, _nb_key, _points, _shared_points, _prepare)


def compute_sheet(tournament: dict, scores: list[dict]) -> dict:
    players, rounds, notes = _prepare(tournament, scores, include_empty_draw_rounds=True)
    P = {p["key"]: p for p in players}
    weight = float(tournament.get("finalWeight") or 1.25)
    cum = {k: (0.0, 0.0) for k in P}
    prev_rank = None
    out_rounds, missing = [], []

    for idx, rnd in enumerate(rounds):
        is_final = rnd["game"] == FINAL_GAME
        label = "Final" if is_final else f"Game {rnd['game']}"
        tables_out = []
        K, G = {x: 0 for x in P}, {x: 0.0 for x in P}
        seated = set()
        for t, keys in rnd["tables"]:
            keys = [x for x in keys if x in P]
            seated.update(keys)
            reported = [x for x in keys if x in rnd["scores"] and rnd["scores"][x] is not None]
            vals = [float(rnd["scores"][x]) for x in reported]
            avg = mean(vals) if vals else 0.0
            seats = []
            for x in keys:
                has = x in reported
                if has:
                    v = float(rnd["scores"][x])
                    rank = _excel_rank(v, vals)
                    pts = _shared_points(v, vals) * (weight if is_final else 1)
                    K[x], G[x] = pts, v - avg
                else:
                    missing.append({"game": rnd["game"], "label": label, "table": t, "name": P[x]["name"]})
                seats.append({
                    "name": P[x]["name"],
                    "scoreId": rnd["ids"].get(x),
                    "score": rnd["scores"].get(x),
                    "relSc": round(G[x], 2) if has else None,
                    "tabRank": _excel_rank(float(rnd["scores"][x]), vals) if has else None,
                    "turnP": K[x] if has else None,
                    "tie": has and vals.count(float(rnd["scores"][x])) > 1,
                })
            tables_out.append({"table": t, "complete": len(reported) == len(keys), "seats": seats})

        M = {x: cum[x][0] + K[x] for x in P}
        N = {x: cum[x][1] + G[x] for x in P}
        if is_final:
            ranked, offset = [], 0
            for t, keys in rnd["tables"]:
                ks = [x for x in keys if x in P]
                ranked += sorted(ks, key=lambda x: (-M[x], -N[x], _nb_key(P[x]["name"])))
            rest = [x for x in P if x not in set(ranked)]
            ranked += sorted(rest, key=lambda x: (-M[x], -N[x], _nb_key(P[x]["name"])))
        else:
            ranked = sorted(P, key=lambda x: (-M[x], -N[x], _nb_key(P[x]["name"])))
        standings = [{"rank": i + 1, "name": P[x]["name"], "turnP": round(M[x], 2), "relSc": round(N[x], 2),
                      "prevRank": prev_rank.get(x) if prev_rank else None}
                     for i, x in enumerate(ranked)]
        any_scores = any(rnd["scores"].values())
        out_rounds.append({
            "game": rnd["game"] if rnd["game"] != FINAL_GAME else "Final",
            "label": label, "isFinal": is_final, "tables": tables_out,
            "notSeated": [P[x]["name"] for x in P if x not in seated],
            "standings": standings, "hasScores": any_scores,
            "complete": all(t["complete"] for t in tables_out) and bool(tables_out),
        })
        if any_scores:
            cum = {x: (M[x], N[x]) for x in P}
            prev_rank = {x: i + 1 for i, x in enumerate(ranked)}

    played = [r for r in out_rounds if r["hasScores"]]
    return {
        "players": [p["name"] for p in players],
        "rounds": out_rounds,
        "standings": played[-1]["standings"] if played else [],
        "standingsAfter": played[-1]["label"] if played else None,
        "missing": [m for m in missing if any(r["label"] == m["label"] and r["hasScores"] for r in out_rounds)],
        "notes": notes,
    }
