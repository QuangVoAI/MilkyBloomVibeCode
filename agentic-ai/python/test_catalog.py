import sys, re
sys.path.append('.')
from tools.catalog_tool import _strip_budget_and_filler_words, _extract_budget_limit, CATALOG_FILLER_WORDS
print("Budget 300k:", _extract_budget_limit("Gợi ý cho tôi món đồ dưới 300k"))
print("Stripped 300k:", repr(_strip_budget_and_filler_words("Gợi ý cho tôi món đồ dưới 300k")))
print("Budget 500k:", _extract_budget_limit("cho tôi món hàng dưới 500k"))
print("Stripped 500k:", repr(_strip_budget_and_filler_words("cho tôi món hàng dưới 500k")))
