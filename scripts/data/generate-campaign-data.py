"""Explicit additive campaign fixture generator. Never reseeds customer/source data."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.features.campaigns.data import generate_batch

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--cohort-size", type=int, default=5000)
parser.add_argument("--seed", type=int, default=2026)
parser.add_argument("--period", default="2026-10")
if __name__ == "__main__":
    arguments = parser.parse_args()
    result = generate_batch(arguments.cohort_size, arguments.seed, arguments.period)
    print(
        json.dumps(
            {
                "id": result["id"],
                "replayed": result["replayed"],
                "counts": result.get("counts"),
                "manifestHash": __import__(
                    "backend.features.campaigns.data", fromlist=["digest"]
                ).digest(result["manifest"]),
            },
            indent=2,
        )
    )
