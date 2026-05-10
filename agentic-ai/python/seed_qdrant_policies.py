#!/usr/bin/env python3
"""
Seed MyKingdom policy documents into Qdrant for EmpathAI retrieval.

Usage:
  cd agentic-ai
  source /Users/springwang/miniforge3/etc/profile.d/conda.sh && conda activate deeplearning
  python python/seed_qdrant_policies.py --recreate
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent))

from agents.model_registry import get_embed_model  # noqa: E402
from retrieval.qdrant_client import QdrantWrapper  # noqa: E402
from utils.console import console  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
POLICY_FILE = ROOT / "data" / "mykingdom_policies.json"


def load_policies() -> dict:
    if not POLICY_FILE.exists():
        raise FileNotFoundError(f"Policy source not found: {POLICY_FILE}")
    return json.loads(POLICY_FILE.read_text(encoding="utf-8"))


def build_nodes(payload: dict) -> list[dict]:
    metadata = payload.get("metadata", {})
    policies = payload.get("policies", [])
    nodes: list[dict] = []

    for policy_index, policy in enumerate(policies, 1):
        policy_id = policy.get("id", f"policy_{policy_index}")
        title = policy.get("title", f"Policy {policy_index}")
        summary = policy.get("summary", "")
        keywords = ", ".join(policy.get("keywords", []))
        url = policy.get("url", "")
        sections = policy.get("sections", [])

        if not sections:
            nodes.append(
                {
                    "node_id": len(nodes),
                    "level": 0,
                    "doc_id": policy_index,
                    "doc_title": title,
                    "text": "\n".join(
                        part for part in [
                            f"Tên chính sách: {title}",
                            f"Tóm tắt: {summary}",
                            f"Từ khóa: {keywords}",
                            f"URL: {url}",
                        ]
                        if part
                    ),
                    "metadata": {
                        "policy_id": policy_id,
                        "category": title,
                        "url": url,
                        "source": metadata.get("source", ""),
                        "company": metadata.get("company", ""),
                        "brand": metadata.get("brand", ""),
                    },
                }
            )
            continue

        for section_index, section in enumerate(sections, 1):
            heading = section.get("heading", "")
            content = section.get("content", "")
            text = "\n".join(
                part for part in [
                    f"Tên chính sách: {title}",
                    f"Tóm tắt: {summary}",
                    f"Từ khóa: {keywords}",
                    f"URL: {url}",
                    f"Phần: {heading}",
                    content,
                ]
                if part
            )
            nodes.append(
                {
                    "node_id": len(nodes),
                    "level": 0,
                    "doc_id": policy_index,
                    "doc_title": title,
                    "text": text,
                    "metadata": {
                        "policy_id": policy_id,
                        "category": title,
                        "url": url,
                        "section_heading": heading,
                        "section_index": section_index,
                        "section_count": len(sections),
                        "source": metadata.get("source", ""),
                        "company": metadata.get("company", ""),
                        "brand": metadata.get("brand", ""),
                    },
                }
            )

    return nodes


def main():
    parser = argparse.ArgumentParser(description="Seed policy docs into Qdrant")
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="Delete and recreate the Qdrant collection before seeding",
    )
    args = parser.parse_args()

    payload = load_policies()
    nodes = build_nodes(payload)
    if not nodes:
        console.print("[yellow]No policy nodes found to seed.[/]")
        return 1

    console.print(f"[cyan]Loaded {len(nodes)} policy nodes from {POLICY_FILE.name}[/]")
    qdrant = QdrantWrapper()
    qdrant.create_collection(recreate=args.recreate)

    model = get_embed_model()
    texts = [node["text"] for node in nodes]
    embeddings = model.encode(texts, normalize_embeddings=True, batch_size=32)
    qdrant.upsert_nodes(nodes, embeddings)

    info = qdrant.get_collection_info()
    console.print(f"[green]Seed complete:[/] {info}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
