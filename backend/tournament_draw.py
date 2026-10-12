"""
Table draw for Agricola tournaments.

* table_sizes(): split N players into tables of 4, filling up with 3- or
  5-player tables (or a fixed number of tables chosen by the director).
* draw_rounds(): draws all preliminary rounds so that as many players as
  possible meet each other and as few as possible meet twice. It also spreads
  the odd-sized tables (3 or 5 players) fairly, so nobody gets stuck at a
  3-table every round.
* seat_final(): seats the final by standings (top players at table 1).
"""

from __future__ import annotations

import math
import random
from itertools import combinations


def table_sizes(n: int, fill: str = "3", num_tables: int | None = None) -> list[int]:
    """Bigger tables first. fill="3": tables of 4 + 3-tables; fill="5": tables of 4 + 5-tables."""
    if n <= 0:
        return []
    if num_tables and num_tables > 0:
        t = num_tables
    elif fill == "5":
        t = max(1, n // 4)
    else:
        t = max(1, math.ceil(n / 4))
    t = max(1, min(t, n))
    base, extra = divmod(n, t)
    return [base + 1] * extra + [base] * (t - extra)


def size_warnings(sizes: list[int]) -> list[str]:
    w = []
    if any(s < 3 for s in sizes):
        w.append("Some tables have fewer than 3 players.")
    if any(s > 5 for s in sizes):
        w.append("Some tables have more than 5 players.")
    return w


def _pair(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


def _meet_cost(count: int) -> float:
    # 0 earlier meetings = free, 1 = costly, 2+ = very costly
    return 0.0 if count == 0 else 10.0 * (4 ** (count - 1))


def draw_rounds(names: list[str], rounds: int, sizes: list[int], seed: int | None = None,
                restarts: int = 12, history: dict | None = None) -> tuple[list[list[list[str]]], dict]:
    """Return (rounds, stats). rounds = [[table1_names, table2_names, ...], ...]."""
    rng = random.Random(seed)
    meet: dict[tuple[str, str], int] = dict(history or {})
    odd_count = {n: 0 for n in names}        # times seated at an odd-sized (3/5) table
    odd_sizes = {s for s in sizes if s != 4} if 4 in sizes else set()
    result = []

    def table_cost(tbl, size):
        c = sum(_meet_cost(meet.get(_pair(a, b), 0)) for a, b in combinations(tbl, 2))
        if size in odd_sizes:
            c += sum(3.0 * odd_count[p] ** 2 for p in tbl)
        return c

    for _ in range(rounds):
        best, best_cost = None, math.inf
        for _attempt in range(restarts):
            perm = names[:]
            rng.shuffle(perm)
            tables, i = [], 0
            for sz in sizes:
                tables.append(perm[i:i + sz]); i += sz
            costs = [table_cost(t, sizes[k]) for k, t in enumerate(tables)]
            improved = True
            passes = 0
            while improved and passes < 25:
                improved = False
                passes += 1
                for ti in range(len(tables)):
                    for tj in range(ti + 1, len(tables)):
                        for ai in range(len(tables[ti])):
                            for bj in range(len(tables[tj])):
                                a, b = tables[ti][ai], tables[tj][bj]
                                tables[ti][ai], tables[tj][bj] = b, a
                                ci, cj = table_cost(tables[ti], sizes[ti]), table_cost(tables[tj], sizes[tj])
                                if ci + cj < costs[ti] + costs[tj] - 1e-9:
                                    costs[ti], costs[tj] = ci, cj
                                    improved = True
                                else:
                                    tables[ti][ai], tables[tj][bj] = a, b
            total = sum(costs)
            if total < best_cost - 1e-9:
                best, best_cost = [t[:] for t in tables], total
            if best_cost == 0:
                break
        for k, tbl in enumerate(best):
            for a, b in combinations(tbl, 2):
                meet[_pair(a, b)] = meet.get(_pair(a, b), 0) + 1
            if sizes[k] in odd_sizes:
                for p in tbl:
                    odd_count[p] += 1
        result.append(best)

    return result, draw_stats(names, result)


def best_draw(names: list[str], rounds: int, sizes: list[int], seed: int | None = None,
              time_budget: float = 2.0) -> tuple[list[list[list[str]]], dict]:
    """Run several complete draws within a time budget and keep the best one
    (fewest repeat meetings, then lowest max meetings, then most even opponent spread)."""
    import time
    master = random.Random(seed)
    deadline = time.time() + time_budget
    best, best_key = None, None
    tries = 0
    while tries < 3 or time.time() < deadline:
        tries += 1
        rds, st = draw_rounds(names, rounds, sizes, seed=master.randrange(1 << 30))
        key = (st["repeatMeetings"], st["maxMeetings"], st["maxOpponents"] - st["minOpponents"])
        if best_key is None or key < best_key:
            best, best_key = (rds, st), key
        if key[0] == 0 and key[2] <= 1:
            break
        if tries >= 400:
            break
    best[1]["attempts"] = tries
    return best


def draw_stats(names: list[str], rounds: list[list[list[str]]]) -> dict:
    meet: dict[tuple[str, str], int] = {}
    for rnd in rounds:
        for tbl in rnd:
            for a, b in combinations(tbl, 2):
                meet[_pair(a, b)] = meet.get(_pair(a, b), 0) + 1
    n = len(names)
    possible = n * (n - 1) // 2
    met = len(meet)
    repeats = sum(c - 1 for c in meet.values() if c > 1)
    opponents = {p: set() for p in names}
    for (a, b) in meet:
        if a in opponents: opponents[a].add(b)
        if b in opponents: opponents[b].add(a)
    per_player = [len(v) for v in opponents.values()] or [0]
    return {
        "pairsPossible": possible,
        "pairsMet": met,
        "repeatMeetings": repeats,
        "maxMeetings": max(meet.values()) if meet else 0,
        "minOpponents": min(per_player),
        "maxOpponents": max(per_player),
        "repeatPairs": sorted([[a, b, c] for (a, b), c in meet.items() if c > 1], key=lambda x: -x[2])[:50],
    }


def seat_final(ranked_names: list[str], sizes: list[int]) -> list[list[str]]:
    """Top of the standings at table 1, and so on (bigger tables first)."""
    tables, i = [], 0
    for sz in sorted(sizes, reverse=True):
        tables.append(ranked_names[i:i + sz]); i += sz
    return [t for t in tables if t]
