import re
from agentic_ai.python.tools.catalog_tool import _strip_budget_and_filler_words, _extract_budget_limit, CATALOG_FILLER_WORDS
print("Budget:", _extract_budget_limit("cho tôi món hàng dưới 500k"))
print("Stripped:", repr(_strip_budget_and_filler_words("cho tôi món hàng dưới 500k")))
