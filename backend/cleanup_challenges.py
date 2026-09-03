"""
One-time cleanup: delete ALL challenges and challenge_attempts from the DB,
while PRESERVING all drafts (hands) — drafts.challengeId is set to NULL so
those hands remain visible in Community Hands under their normal categories
(full draft, occs, etc.).

Usage (local):
    python cleanup_challenges.py              # shows counts, asks for confirmation
    python cleanup_challenges.py --yes        # runs without interactive prompt

Usage on Fly.io:
    fly ssh console -a <app>
    cd /app/backend  (or wherever server.py is)
    DRAFTS_DB_PATH=/data/drafts.db python cleanup_challenges.py --yes

The DB path is taken from the DRAFTS_DB_PATH env var, falling back to
./data/drafts.db relative to the project root (same logic as server.py).
"""
import argparse
import os
import sqlite3
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
DRAFTS_DB_PATH = os.environ.get(
    "DRAFTS_DB_PATH",
    os.path.join(PROJECT_ROOT, "data", "drafts.db"),
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    parser.add_argument("--db", default=DRAFTS_DB_PATH, help="Path to SQLite DB")
    args = parser.parse_args()

    db_path = args.db
    if not os.path.exists(db_path):
        print(f"ERROR: Database not found at {db_path}", file=sys.stderr)
        return 1

    print(f"Using DB: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Gather counts first (read-only, safe)
    def _count(sql: str) -> int:
        cur = conn.execute(sql)
        row = cur.fetchone()
        return int(row[0]) if row else 0

    n_challenges = _count("SELECT COUNT(*) FROM challenges")
    n_attempts = _count("SELECT COUNT(*) FROM challenge_attempts")
    n_drafts_linked = _count(
        "SELECT COUNT(*) FROM drafts WHERE challengeId IS NOT NULL"
    )
    n_drafts_total = _count("SELECT COUNT(*) FROM drafts")

    print()
    print("Current state:")
    print(f"  challenges rows ............ {n_challenges}")
    print(f"  challenge_attempts rows .... {n_attempts}")
    print(f"  drafts total ............... {n_drafts_total}")
    print(f"  drafts with challengeId .... {n_drafts_linked}  (will be UNLINKED, not deleted)")
    print()

    if n_challenges == 0 and n_attempts == 0 and n_drafts_linked == 0:
        print("Nothing to do — no challenges or linked drafts present.")
        conn.close()
        return 0

    print("This will:")
    print("  1. DELETE every row from challenge_attempts")
    print("  2. UPDATE drafts SET challengeId = NULL for every linked draft (hands preserved)")
    print("  3. DELETE every row from challenges")
    print()

    if not args.yes:
        try:
            answer = input("Proceed? Type 'yes' to confirm: ").strip().lower()
        except EOFError:
            answer = ""
        if answer != "yes":
            print("Aborted — no changes made.")
            conn.close()
            return 1

    # Do the work in a single transaction.
    try:
        conn.execute("BEGIN")
        conn.execute("DELETE FROM challenge_attempts")
        conn.execute("UPDATE drafts SET challengeId = NULL WHERE challengeId IS NOT NULL")
        conn.execute("DELETE FROM challenges")
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}", file=sys.stderr)
        conn.close()
        return 1

    # Verify post-state
    post_challenges = _count("SELECT COUNT(*) FROM challenges")
    post_attempts = _count("SELECT COUNT(*) FROM challenge_attempts")
    post_linked = _count("SELECT COUNT(*) FROM drafts WHERE challengeId IS NOT NULL")
    post_drafts_total = _count("SELECT COUNT(*) FROM drafts")

    print()
    print("Done. Post-cleanup state:")
    print(f"  challenges rows ............ {post_challenges}")
    print(f"  challenge_attempts rows .... {post_attempts}")
    print(f"  drafts total ............... {post_drafts_total}  (unchanged)")
    print(f"  drafts with challengeId .... {post_linked}")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
