import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents import graph
from agents import router

SCENARIOS = [
    # VIEW CART (Expected: checkout)
    ("cho tôi xem sản phẩm trong giỏ", "checkout"),
    ("giỏ hàng có gì", "checkout"),
    ("mở giỏ hàng", "checkout"),
    ("cart của tôi", "checkout"),
    ("xem giỏ", "checkout"),
    ("trong giỏ có gì vậy", "checkout"),
    ("check giỏ hàng", "checkout"),
    ("hiển thị giỏ hàng", "checkout"),
    ("có gì trong giỏ hàng", "checkout"),
    ("kiểm tra giỏ hàng", "checkout"),

    # CHECKOUT (Expected: checkout)
    ("đặt hàng đi", "checkout"),
    ("thanh toán nhé", "checkout"),
    ("chốt đơn", "checkout"),
    ("tạo đơn cho tôi", "checkout"),
    ("checkout", "checkout"),
    ("mua ngay", "checkout"),
    ("tiến hành thanh toán", "checkout"),
    ("xác nhận đơn", "checkout"),
    ("tôi muốn thanh toán", "checkout"),
    ("đặt hàng", "checkout"),

    # ADD TO CART (Expected: checkout)
    ("thêm Stardust Picnic Box vào giỏ", "checkout"),
    ("mua 1 cái Nova Sprout", "checkout"),
    ("lấy món này", "checkout"),
    ("cho tôi mua món đó", "checkout"),
    ("thêm vào cart", "checkout"),
    ("mua 2 hộp", "checkout"),
    ("lấy cho mình 1 chiếc", "checkout"),
    ("đặt mua Moon Parade", "checkout"),
    ("bỏ vào giỏ", "checkout"),
    ("mua sản phẩm này", "checkout"),

    # CATALOG BUDGET (Expected: catalog)
    ("tìm quà sinh nhật dưới 500k", "catalog"),
    ("món nào tầm 300 ngàn", "catalog"),
    ("tư vấn đồ chơi dưới 1 triệu", "catalog"),
    ("dưới 200k có gì", "catalog"),
    ("gợi ý đồ dưới 50k", "catalog"),
    ("muốn mua món tầm 100k", "catalog"),
    ("tầm 150.000đ thì mua gì", "catalog"),
    ("ngân sách khoảng 300k", "catalog"),
    ("budget 500k", "catalog"),
    ("đồ chơi giá rẻ dưới 100k", "catalog"),

    # CATALOG RECOMMENDATION (Expected: catalog)
    ("bé gái 5 tuổi nên tặng gì", "catalog"),
    ("tư vấn quà sinh nhật", "catalog"),
    ("có món nào hay không", "catalog"),
    ("tư vấn đồ chơi xếp hình", "catalog"),
    ("gợi ý quà tặng", "catalog"),
    ("mua quà gì cho bé trai", "catalog"),
    ("chưa biết mua gì", "catalog"),
    ("chọn giúp 1 món", "catalog"),
    ("món nào đang hot", "catalog"),
    ("có gì phù hợp làm quà không", "catalog"),

    # CATALOG INFO (Expected: catalog)
    ("Stardust Picnic Box bao nhiêu tiền", "catalog"),
    ("Moon Parade giá bao nhiêu", "catalog"),
    ("còn hàng không shop", "catalog"),
    ("so sánh 2 mẫu", "catalog"),
    ("món này có mấy màu", "catalog"),
    ("loại classic và shimmer khác gì nhau", "catalog"),
    ("có hàng sẵn không", "catalog"),
    ("còn tồn kho không", "catalog"),
    ("chi tiết Nova Sprout", "catalog"),
    ("có món nào khác không", "catalog"),

    # ORDER LOOKUP (Expected: complaint)
    ("tra đơn MK123", "complaint"),
    ("đơn hàng 0901234567 tới đâu rồi", "complaint"),
    ("kiểm tra đơn hàng", "complaint"),
    ("check order", "complaint"),
    ("xem đơn của tôi", "complaint"),
    ("tình trạng đơn hàng", "complaint"),
    ("đơn này gửi chưa", "complaint"),
    ("đơn hàng ở đâu rồi", "complaint"),
    ("bao giờ thì nhận được hàng", "complaint"),
    ("đơn MK099", "complaint"),

    # ORDER CANCEL/COMPLAINT (Expected: complaint)
    ("hủy đơn MK123", "complaint"),
    ("tôi không muốn mua nữa, hủy đơn", "complaint"),
    ("cancel order giúp", "complaint"),
    ("giao thiếu hàng", "complaint"),
    ("đồ lừa đảo, hàng vỡ rồi", "complaint"),
    ("sản phẩm bị lỗi", "complaint"),
    ("đổi trả như thế nào", "complaint"),
    ("tôi muốn trả hàng", "complaint"),
    ("thái độ phục vụ quá tệ", "complaint"),
    ("đổi địa chỉ", "complaint"),

    # INQUIRY/POLICY (Expected: inquiry)
    ("phí ship bao nhiêu", "inquiry"),
    ("có freeship không", "inquiry"),
    ("bao lâu thì giao", "inquiry"),
    ("shop ở đâu", "inquiry"),
    ("thanh toán cod được không", "inquiry"),
    ("điểm loyalty là gì", "inquiry"),
    ("chính sách bảo hành", "inquiry"),
    ("hạng thành viên", "inquiry"),
    ("thanh toán trả góp", "inquiry"),
    ("hướng dẫn dùng", "inquiry"),

    # CASUAL / OTHERS
    ("xin chào", "casual"),
    ("alo shop", "casual"),
    ("cảm ơn bạn", "casual"),
    ("tạm biệt", "casual"),
    ("ok", "casual"),
    ("dạ", "casual"),
    ("bye", "casual"),
    ("bạn khỏe không", "casual"),
    ("hello", "casual"),
    ("hi", "casual"),
]

def make_state(question: str) -> dict:
    # Build a basic state matching what router expects
    intent = router.classify(question)
    return {
        "session_id": "test_100",
        "question": question,
        "history": [],
        "shop_context": {},
        "intent": intent,
        "capability": "",
        "capability_reason": "",
        "order_info": {},
        "order_id": "",
        "phone_number": "",
        "email_address": "",
        "action_result": {},
        "action_intent": {},
        "pending_action_intent": {},
        "agent_trace": {},
    }

def run_tests():
    graph._session_guest_checkout_profiles.clear()
    graph._session_order_profiles.clear()
    graph._session_catalog_profiles.clear()

    failed = []
    for question, expected in SCENARIOS:
        state = make_state(question)
        route = graph.route_by_intent(state)
        # Note: sometimes 'casual' might route to 'clarify' if confidence is low, 
        # but let's strictly check for now.
        if route != expected and not (expected == 'casual' and route in ['casual', 'clarify', 'inquiry']):
            failed.append((question, expected, route))

    print(f"\n--- RESULTS ---")
    print(f"Total: {len(SCENARIOS)}")
    print(f"Passed: {len(SCENARIOS) - len(failed)}")
    print(f"Failed: {len(failed)}")

    if failed:
        print("\n--- FAILED CASES ---")
        for q, e, r in failed:
            print(f"Q: {q}\n  Expected: {e} | Got: {r}")

if __name__ == "__main__":
    run_tests()
