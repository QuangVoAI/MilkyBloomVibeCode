"""
Prompt Registry — versioned prompt and policy metadata.

Centralize version labels so traces, evals, and A/B comparisons stay aligned.
"""

PROMPT_VERSIONS = {
    "router": "ROUTER_PROMPT_V2",
    "action": "ACTION_PROMPT_V2",
    "empathy": "EMPATHY_PROMPT_V4",
    "inquiry": "INQUIRY_PROMPT_V3",
    "casual": "CASUAL_PROMPT_V2",
    "rewrite": "REWRITE_PROMPT_V3",
    "reviewer": "REVIEWER_PROMPT_V1",
}

POLICY_VERSION = "POLICY_V2"


def prompt_header(domain: str) -> str:
    version = PROMPT_VERSIONS.get(domain, f"{domain.upper()}_PROMPT_V1")
    return f"[{version} | {POLICY_VERSION}]"


def prompt_meta(domain: str) -> dict:
    return {
        "prompt_version": PROMPT_VERSIONS.get(domain, f"{domain.upper()}_PROMPT_V1"),
        "policy_version": POLICY_VERSION,
        "domain": domain,
    }
