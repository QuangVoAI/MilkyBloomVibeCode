import sys
sys.path.append('agentic-ai/python')
from tools.shop_client import search_products_by_filters

res = search_products_by_filters(keyword="", max_price=500000, limit=10)
print(res)
