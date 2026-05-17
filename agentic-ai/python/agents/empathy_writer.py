"""
Empathy Writer — Sinh phản hồi thấu cảm cho khách hàng.
Groq là backend chính; Featherless chỉ là fallback OpenAI-compatible.
"""
import sys
import re
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from typing import AsyncGenerator, Callable, Awaitable, Optional

from agents.llm_client import (
    groq_complete, groq_stream_complete,
    featherless_complete, featherless_stream_complete,
    GROQ_MODEL_FAST,
    FEATHERLESS_MODEL_FAST,
)
from agents.prompt_registry import prompt_header, brand_voice_block
from agents.response_postprocess import normalize_vietnamese_output, should_rewrite_to_vietnamese
from config import EMPATHY_MODE
from tools.order_tool import extract_order_id, extract_phone_number

EMPATHY_SYSTEM_PROMPT = f"""{prompt_header('empathy')}
{brand_voice_block('support', 'order')}
Bạn là EmpathAI - trợ lý CSKH của MyKingdom (chuỗi cửa hàng đồ chơi trẻ em hàng đầu Việt Nam).

THÔNG TIN LIÊN HỆ MYKINGDOM:
- Hotline: 1900 1208 (Thứ 2-7: 08:00-17:00, CN: 08:00-12:00)
- Email: hotro@mykingdom.com.vn
- Website: https://www.mykingdom.com.vn
- Hệ thống: Hơn 200 cửa hàng toàn quốc

KHẢ NĂNG THỰC THI CỦA HỆ THỐNG:
Hệ thống CÓ THỂ tự động thực hiện các tác vụ sau ngay trong chat:
- Đổi/cập nhật địa chỉ giao hàng (khi đơn đang processing hoặc shipping)
- Hủy đơn hàng (khi đơn đang processing)
- Tạo yêu cầu hoàn tiền
- Tạo yêu cầu đổi trả hàng
- Tra cứu tồn kho / thông tin sản phẩm live
- Hỗ trợ checkout từ giỏ hàng của tài khoản đã đăng nhập
Khi khách muốn thực hiện một trong các tác vụ trên, hãy yêu cầu đăng nhập hoặc xác minh OTP của tài khoản chủ đơn nếu chưa xác minh chủ đơn.
Nếu khách không nhớ mã đơn, hãy ưu tiên gợi ý: đăng nhập tài khoản đã đặt đơn, xác minh OTP, mã truy cập đơn hàng trong email xác nhận, hoặc email họ dùng khi đặt hàng để họ tìm email xác nhận.
KHÔNG BAO GIỜ nói "không có quyền truy cập" hay đẩy sang hotline khi còn có thể tự xác minh trong chat.

QUY TẮC BẮT BUỘC:
1. KHÔNG BAO GIờ nói "Chúng tôi rất tiếc", "Xin lỗi vì sự bất tiện", "theo chính sách công ty", "theo chính sách của chúng tôi"
2. Thấu cảm THỰC SỰ bằng cảm xúc chân thật. Ví dụ: "Nghe bạn nói xong mình cũng thấy bực mình thay..."
3. NHƯỢNG BỘ THÔNG MINH: Đề xuất giải pháp CỤ THỂ dựa trên chính sách MyKingdom (đổi trả 7 ngày, bảo hành, MyPoints...)
4. Chỉ hỏi thêm khi thật sự thiếu thông tin để xử lý; nếu đã có hướng giải quyết thì kết thúc ngắn gọn, không cần gợi câu hỏi mở
5. KHÔNG BAO GIỜ cãi lại khách, không đổ lỗi cho khách
6. Trả lời tự nhiên, thân thiện như người thật đang nhắn tin
7. Dựa trên CHÍNH SÁCH được cung cấp để đề xuất giải pháp cụ thể
8. Chỉ đề cập hotline 1900 1208 khi không thể tự xử lý
- Nếu có dữ liệu catalog live, hãy dùng nó thay vì đoán về tồn kho / giá / biến thể
- Nếu hệ thống tạo yêu cầu xử lý, hãy trả về rõ mã yêu cầu và mô tả đã xử lý; không gọi đó là ticket hỗ trợ.

VĂN MẪU BỊ CẤM TUYỆT ĐỐI (KHÔNG ĐƯỢC DÙNG BẤT KỲ DẠNG NÀO):
- "Chúng tôi rất tiếc về sự bất tiện này"
- "theo chính sách công ty" / "theo chính sách của chúng tôi" / "theo quy định"
  ĐƯỢC PHÉP: "Theo chính sách đổi trả của MyKingdom, ..." (có brand + nội dung cụ thể)
  => Tốt hơn là dùng câu chủ động: "MyKingdom hỗ trợ đổi trả 7 ngày" hoặc "Mình có thể giúp bạn..."
- "Xin quý khách vui lòng chờ..."
- "Chúng tôi sẽ chuyển vấn đề này..."
- Bất kỳ câu nào nghe như robot/copy-paste
- KHÔNG DÙNG "Vui lòng..." — nghe như lệnh/form. Thay bằng "Bạn + động từ" hoặc "Bạn giúp mình..."
  Ví dụ: thay "Vui lòng cho mình biết" → "Bạn cho mình biết nhé", "Bạn giúp mình chụp ảnh được không"

TUYỆT ĐỐI KHÔNG SUY ĐOÁN KHI CHƯA CÓ THÔNG TIN ĐƠN:
- KHÔNG ĐƯỢC kết luận "đơn đã quá hạn", "không thể hoàn tiền", "không đủ điều kiện" khi chưa xác minh chủ đơn
- KHÔNG ĐƯỢC áp dụng giới hạn thời gian từ chính sách (7 ngày, 72 giờ...) cho đơn chưa được kiểm tra
- Nếu khách muốn hoàn tiền / đổi trả / hủy đơn mà CHƯA xác minh chủ đơn → HỎI thông tin xác minh trước: đăng nhập, mã truy cập đơn hàng, hoặc email đặt hàng; không kết luận gì cả

Độ dài phản hồi: TỐI ĐA 4-5 câu, ngắn gọn, đúng trọng tâm.

PHONG CÁCH PHẢN HỒI:
- Thân thiện, dùng "mình/bạn" thay vì "chúng tôi/quý khách"
- Dùng emoji vừa phải (1-2 cái)
- Nói như đang nhắn tin với bạn bè
- Không viết theo form mẫu 5 phần. Ưu tiên 2-4 câu ngắn, mỗi câu 1 ý.
- Nếu khách đang bực, mở đầu bằng 1 câu ghi nhận ngắn rồi vào giải pháp cụ thể ngay.
- Không lặp lại cùng một ý xin lỗi / an ủi / hỏi lại nhiều lần.
"""

CASUAL_SYSTEM_PROMPT = (
    f"{prompt_header('casual')}\n"
    f"{brand_voice_block('casual')}\n"
    "Bạn là EmpathAI, trợ lý CSKH thân thiện. "
    "Trả lời ngắn gọn, lịch sự, tự nhiên, chỉ dùng tiếng Việt. "
    "Nếu khách hỏi về sản phẩm/dịch vụ, khuyên họ mô tả cụ thể hơn."
)

INQUIRY_SYSTEM_PROMPT = f"""{prompt_header('inquiry')}
{brand_voice_block('sales', 'catalog', 'loyalty')}
Bạn là EmpathAI - trợ lý CSKH của MyKingdom, thân thiện và chuyên nghiệp.

KHẢ NĂNG THỰC THI:
Hệ thống CÓ THỂ tự động thực hiện ngay trong chat:
- Đổi/cập nhật địa chỉ giao hàng
- Hủy đơn hàng (khi đơn đang processing)
- Tạo yêu cầu hoàn tiền / đổi trả
- Tra cứu tồn kho / thông tin sản phẩm live
- Hỗ trợ checkout từ giỏ hàng của tài khoản đã đăng nhập
Nếu khách hỏi CÁCH làm một trong các việc trên, hãy cho biết hệ thống làm được và yêu cầu đăng nhập hoặc xác minh OTP của tài khoản chủ đơn nếu chưa xác minh chủ đơn.
KHÔNG hướng dẫn thủ công khi có thể tự xử lý.
Nếu chưa xác minh chủ đơn, hãy yêu cầu đăng nhập, xác minh OTP, mã truy cập đơn hàng trong email xác nhận, hoặc email đặt hàng để họ tìm email xác nhận; không hỏi hotline trước.

QUY TẮC:
- Trả lời dựa trên chính sách được cung cấp, rõ ràng, cụ thể
- Dùng "mình/bạn", thân thiện như nhắn tin với bạn bè
- KHÔNG nói "không có quyền truy cập" hay chuyển hotline khi hệ thống tự làm được
- KHÔNG dùng "theo chính sách công ty/của chúng tôi" — thay bằng câu chủ động như "MyKingdom hỗ trợ đổi trả trong 7 ngày"
- KHÔNG dùng "Vui lòng..." — thay bằng "Bạn + động từ" hoặc "Bạn giúp mình..."
- KHÔNG KẾT LUẬN "quá hạn", "không đủ điều kiện" khi chưa xác minh chủ đơn — hỏi thông tin xác minh trước
- Trả lời tối đa 4-5 câu, ngắn gọn
\
"""


def _deduplicate_response(text: str) -> str:
    """Remove repeated consecutive paragraphs/sentences that LLMs produce when looping."""
    # Split by paragraph
    paragraphs = [p.strip() for p in text.strip().split("\n") if p.strip()]
    seen = []
    for p in paragraphs:
        # Skip if identical or highly similar to a recent paragraph
        if not any(p == s or (len(p) > 20 and p in s) for s in seen[-3:]):
            seen.append(p)
    return "\n".join(seen)


def _finalize_response(text: str) -> str:
    normalized = _deduplicate_response(normalize_vietnamese_output(text))
    if should_rewrite_to_vietnamese(normalized):
        normalized = normalize_vietnamese_output(normalized)
    return normalized


def _fallback_casual_reply(question: str) -> str:
    compact = re.sub(r"\s+", "", question or "")
    if extract_order_id(question) or extract_phone_number(question) or re.fullmatch(r"[\d\+\-\(\)]{8,}", compact):
        return (
            "Mình đã nhận được mã/số liên hệ rồi nhé. "
            "Để mình kiểm tra trạng thái đơn hàng cho bạn tiếp nè, bạn chờ mình chút nha."
        )

    return "Xin chào, mình là trợ lý MilkyBloom. Bạn cần hỏi về sản phẩm, đơn hàng, vận chuyển, đổi trả hay chính sách nào?"


def _is_simple_greeting_text(question: str) -> bool:
    normalized = re.sub(r"\s+", " ", (question or "").strip().lower())
    normalized = normalized.strip("!?.,:;~")
    return normalized in {
        "alo",
        "a lo",
        "a lô",
        "chao",
        "chào",
        "hi",
        "hey",
        "hello",
        "yo",
        "xin chao",
        "xin chào",
    }


def _is_catalog_request_text(question: str) -> bool:
    q = (question or "").lower()
    return any(marker in q for marker in (
        "mua",
        "gợi ý",
        "goi y",
        "đề xuất",
        "de xuat",
        "sản phẩm",
        "san pham",
        "món đồ",
        "mon do",
        "ngân sách",
        "ngan sach",
        "budget",
        "giá",
        "gia",
    ))


def _is_order_help_request_text(question: str) -> bool:
    q = (question or "").lower()
    return any(marker in q for marker in (
        "đơn",
        "don",
        "order",
        "tracking",
        "theo dõi",
        "theo doi",
        "vận chuyển",
        "van chuyen",
        "giao hàng",
        "giao hang",
        "hủy",
        "huy",
        "đổi trả",
        "doi tra",
        "bảo hành",
        "bao hanh",
    ))


def _fallback_inquiry_reply(question: str, evidence_text: str, order_info=None, catalog_info=None) -> str:
    if _is_simple_greeting_text(question):
        return _fallback_casual_reply(question)

    order_context = _build_order_context(order_info or {})
    catalog_context = _build_catalog_context(catalog_info or {})

    if _is_catalog_request_text(question):
        return _finalize_response(
            "Mình gợi ý nhanh cho bạn nè. "
            "Bạn cho mình biết ngân sách, độ tuổi hoặc chủ đề bạn thích là mình lọc ngay cho bạn."
        )

    if _is_order_help_request_text(question):
        return _finalize_response(
            "Mình có thể hỗ trợ bạn kiểm tra đơn hàng, giao hàng, đổi trả hoặc bảo hành. "
            "Bạn cho mình mã đơn, số điện thoại hoặc email đặt hàng nhé."
        )

    if order_context or catalog_context:
        return _finalize_response(
            f"{question}\n\n{order_context}{catalog_context}"
        )
    return (
        "Mình có thể giúp bạn hỏi về sản phẩm, đơn hàng, vận chuyển, đổi trả hoặc chính sách. "
        "Bạn nói ngắn thêm một chút để mình hỗ trợ đúng ý nhé."
    )


def _fallback_empathy_reply(question: str, sentiment: str = "") -> str:
    text = (question or "").strip()
    if sentiment in {"frustrated", "toxic", "disappointed"}:
        return "Mình hiểu rồi, mình sẽ giúp bạn gỡ từng bước cho nhanh nhất có thể."
    if text:
        return "Mình đang hỗ trợ bạn đây, bạn nói ngắn thêm một chút để mình xử lý tiếp nha."
    return "Mình đang bị lỗi AI tạm thời, nhưng mình vẫn có thể hỗ trợ bạn hỏi về sản phẩm, đơn hàng hoặc chính sách."

def _build_action_context(action_result: dict, action_intent: dict) -> str:
    """Build context block thông báo kết quả thực thi action cho LLM."""
    if not action_result or not action_intent:
        return ""
    action = action_intent.get("action", "no_action")
    if action == "no_action":
        return ""

    if action_result.get("success"):
        msg = action_result.get("message", "")
        ticket = action_result.get("ticket_id", "")
        return (
            f"\nHỆ THỐNG ĐÃ THỰC HIỆN THÀNH CÔNG:\n"
            f"{msg}\n"
            f"=> Hãy BÁO CHO KHÁCH BIẾT hệ thống đã xử lý xong, "
            f"cung cấp mã yêu cầu {ticket} nếu có.\n"
        )
    elif action_result.get("needs_order_id") or action_intent.get("needs_order_id"):
        action_labels = {
            "update_address": "cập nhật địa chỉ giao hàng",
            "cancel_order": "hủy đơn hàng",
            "request_refund": "yêu cầu hoàn tiền",
            "process_return": "đổi trả hàng",
            "check_order_status": "kiểm tra tình trạng đơn hàng",
        }
        label = action_labels.get(action, "xử lý yêu cầu")
        return (
            f"\nKHÁCH YÊU CẦU: {label}.\n"
            f"HỆ THỐNG CÓ THỂ TỰ ĐỘNG THỰC HIỆN ngay bây giờ.\n"
            f"=> Khách CHƯA ĐƯỢC XÁC MINH CHỦ ĐƠN.\n"
            f"=> Hãy yêu cầu khách đăng nhập tài khoản đã đặt đơn, xác minh OTP, gửi mã truy cập đơn hàng trong email xác nhận, hoặc cho biết email đặt hàng để họ tìm email xác nhận.\n"
            f"KHÔNG được nói 'không có quyền' hay đẩy sang hotline khi hệ thống có thể tự xử lý sau khi xác minh.\n"
        )
    elif action_result.get("blocked"):
        reason = action_result.get("message", "")
        return (
            f"\n⛔ HỆ THỐNG ĐÃ TỪ CHỐI HÀNH ĐỘNG — BẮT BUỘC TUÂN THỦ:\n"
            f"Lý do từ hệ thống: {reason}\n"
            f"=> Bạn CHỈ được GIẢI THÍCH lý do không thể xử lý "
            f"và đề xuất giải pháp thay thế phù hợp với flow hiện tại (đăng nhập / mã truy cập đơn hàng / ra cửa hàng nếu thật sự cần).\n"
            f"=> KHÔNG ĐƯỢC nói 'mình có thể hỗ trợ đổi trả/hoàn tiền/hủy' vì hệ thống ĐÃ TỪ CHỐI.\n"
            f"=> KHÔNG ĐƯỢC dùng thông tin từ CHÍNH SÁCH THAM KHẢO bên dưới để vượt qua quyết định blocked.\n"
            f"   Ví dụ: nếu chính sách ghi '7 ngày' nhưng hệ thống từ chối vì 'quá 72h', thì kết quả hệ thống WIN.\n"
            f"=> BẮT ĐẦU bằng thấu cảm, SAU ĐÓ giải thích lý do blocked, RỒI đề xuất giải pháp thay thế.\n"
        )
    elif (action_result.get("needs_more_info") or action_intent.get("needs_more_info")) and action == "update_address":
        return (
            f"\nKHÁCH MUỐN ĐỔI ĐỊA CHỈ nhưng CHƯA CUNG CẤP địa chỉ mới.\n"
            f"=> Hãy HỎI LẠI địa chỉ mới để cập nhật (ngắn gọn, thân thiện).\n"
        )
    return ""


def _build_order_context(order_info: dict) -> str:
    """Build order context block từ kết quả tra cứu đơn hàng."""
    if not order_info:
        return ""
    if order_info.get("verification_required"):
        return (
            f"\nTHÔNG TIN ĐƠN HÀNG:\n"
            f"Chưa xác minh được chủ đơn, không được phép tra cứu.\n"
            f"=> Hãy yêu cầu khách đăng nhập, xác minh OTP, cung cấp mã truy cập đơn hàng đã gửi qua email xác nhận, hoặc cho biết email đặt hàng để họ tìm email xác nhận.\n"
        )
    if not order_info.get("found"):
        oid = order_info.get("order_id", "")
        lookup_hints = order_info.get("lookup_hints") or []
        if lookup_hints:
            if len(lookup_hints) == 1:
                lookup_text = lookup_hints[0]
            else:
                lookup_text = ", ".join(lookup_hints[:-1]) + f", hoặc {lookup_hints[-1]}"
        else:
            lookup_text = "đăng nhập tài khoản đã đặt đơn, xác minh OTP, hoặc gửi mã truy cập đơn hàng trong email xác nhận"
        return (
            f"\nTHÔNG TIN ĐƠN HÀNG:\n"
            f"Mã đơn **{oid}** KHÔNG TÌM THẤY trong hệ thống.\n"
            f"=> TUYỆT ĐỐI KHÔNG được suy đoán trạng thái đơn, KHÔNG được áp dụng chính sách đổi trả/hoàn tiền cho đơn này.\n"
            f"=> Hãy yêu cầu khách {lookup_text} để kiểm tra tiếp.\n"
        )

    summary = order_info.get("summary", "")
    actions = order_info.get("suggested_actions", [])
    actions_str = ", ".join(actions) if actions else "không có"
    return (
        f"\nTHÔNG TIN ĐƠN HÀNG (đã tra cứu):\n{summary}\n"
        f"Action gợi ý hệ thống: {actions_str}\n"
        f"=> Sử dụng thông tin này để trả lời CỤ THỂ, KHÔNG hỏi lại mã đơn nếu đã xác minh chủ đơn.\n"
    )


def _build_catalog_context(catalog_info: dict) -> str:
    if not catalog_info:
        return ""
    if not catalog_info.get("found"):
        hints = catalog_info.get("lookup_hints") or []
        hint_text = ", ".join(hints) if hints else "tên sản phẩm hoặc mã sản phẩm"
        return (
            f"\nTHÔNG TIN CATALOG LIVE:\n"
            f"Không tìm thấy sản phẩm khớp.\n"
            f"=> Hãy hỏi khách mô tả rõ hơn: {hint_text}.\n"
        )
    summary = catalog_info.get("summary", "")
    return (
        f"\nTHÔNG TIN CATALOG LIVE:\n"
        f"{summary}\n"
        f"=> Dùng dữ liệu live này để trả lời về giá / tồn kho / biến thể.\n"
    )


def _build_empathy_prompt(question, evidence_text, sentiment="", score=0, compensation="", order_info=None, action_result=None, action_intent=None, catalog_info=None, session_summary_text=""):
    """Build prompt cho empathy response."""
    sentiment_context = ""
    if sentiment:
        sentiment_guide = {
            "toxic": "Khách ĐANG RẤT TỨC GIẬN. Cần xả hơi trước, sau đó mới đề xuất giải pháp. Nhượng bộ MẠNH.",
            "frustrated": "Khách đang BỰC BỘI, ĐÃ CỐ GẮNG KIÊN NHẪN. Ghi nhận sự kiên nhẫn của họ, giải quyết nhanh.",
            "disappointed": "Khách THẤT VỌNG, BUỒN. Cần an ủi nhẹ nhàng, thể hiện sự quan tâm chân thành.",
            "neutral": "Khách hỏi bình thường. Trả lời thân thiện, chuyên nghiệp.",
        }
        sentiment_context = f"\nMỨC ĐỘ CẢM XÚC: {sentiment} (score: {score})\nHƯỚNG DẪN: {sentiment_guide.get(sentiment, '')}\n"

    compensation_context = ""
    if compensation:
        compensation_context = f"\nBỒI THƯỜNG ÁP DỤNG: {compensation}\nHÃY ĐỀ XUẤT BỒI THƯỜNG CỤ THỂ NÀY CHO KHÁCH.\n"

    session_context = ""
    if session_summary_text:
        session_context = f"\nNGỮ CẢNH PHIÊN:\n{session_summary_text}\n"

    order_context = _build_order_context(order_info or {})
    catalog_context = _build_catalog_context(catalog_info or {})
    action_context = _build_action_context(action_result or {}, action_intent or {})

    if not evidence_text or len(evidence_text) < 30:
        return (
            f"KHÁCH HÀNG GỬI:\n{question}\n\n"
            f"{session_context}"
            f"{sentiment_context}"
            f"{order_context}"
            f"{catalog_context}"
            f"{compensation_context}\n"
            f"CHÍNH SÁCH: Không tìm thấy chính sách cụ thể. "
            f"Hãy xử lý linh hoạt, thấu cảm và đề nghị chuyển lên cấp trên nếu cần.\n"
            f"{action_context}"
        )

    # Khi order not found: cắt evidence để tránh LLM hallucinate policy cho đơn không tồn tại
    order_not_found = order_info and not order_info.get("found") and order_info.get("order_id")
    # Khi action blocked: đặt action_context SAU evidence để LLM weight nó cao hơn
    action_blocked = action_result and action_result.get("blocked")

    if order_not_found:
        evidence_block = (
            "CHÍNH SÁCH THAM KHẢO: KHÔNG ÁP DỤNG — đơn hàng không tồn tại, "
            "KHÔNG được trích dẫn bất kỳ chính sách đổi trả/hoàn tiền nào cho đơn này.\n"
        )
    else:
        evidence_block = f"CHÍNH SÁCH THAM KHẢO:\n{evidence_text[:4000]}\n"

    if action_context and action_blocked:
        # Blocked: evidence trước, action_context cuối (LLM weight cuối prompt cao hơn)
        closing = f"{evidence_block}\n\nNHIỆM VỤ BẮT BUỘC (ưu tiên cao nhất):\n{action_context}"
    elif action_context:
        closing = f"NHIỆM VỤ CỦA BẠN:\n{action_context}\n\n{evidence_block}"
    else:
        closing = f"{evidence_block}\n\nHãy phản hồi khách hàng bằng cách thấu cảm + đề xuất giải pháp cụ thể dựa trên chính sách."

    return (
        f"KHÁCH HÀNG GỬI:\n{question}\n\n"
        f"{session_context}"
        f"{sentiment_context}"
        f"{order_context}"
        f"{catalog_context}"
        f"{compensation_context}\n"
        f"{closing}"
    )


async def generate_empathy_response(question, evidence_text, sentiment="", score=0, compensation="", order_info=None, catalog_info=None):
    """Non-streaming empathy response."""
    prompt = _build_empathy_prompt(question, evidence_text, sentiment, score, compensation, order_info, catalog_info=catalog_info)

    messages = [
        {"role": "system", "content": EMPATHY_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    if EMPATHY_MODE == "featherless":
        try:
            return _finalize_response(await featherless_complete(
                messages=messages,
                model=FEATHERLESS_MODEL_FAST,
                max_tokens=512,
                temperature=0.7,
            ))
        except Exception as e:
            console.print(f"[red]  EmpathyWriter featherless error: {str(e)[:200]}[/]")
            return _fallback_empathy_reply(question, sentiment)

    try:
        return _finalize_response(await groq_complete(
            prompt=prompt,
            system_prompt=EMPATHY_SYSTEM_PROMPT,
            model=GROQ_MODEL_FAST,
            max_tokens=512,
            temperature=0.7,
        ))
    except Exception as e:
        console.print(f"[red]  EmpathyWriter error: {str(e)[:200]}[/]")
        return _fallback_empathy_reply(question, sentiment)


async def generate_empathy_streaming(
    question, evidence_text,
    sentiment="", score=0,
    compensation="",
    order_info=None,
    action_result=None,
    action_intent=None,
    catalog_info=None,
    session_summary_text="",
    stream_callback=None,
):
    """Streaming empathy response."""
    prompt = _build_empathy_prompt(
        question,
        evidence_text,
        sentiment,
        score,
        compensation,
        order_info,
        action_result,
        action_intent,
        catalog_info=catalog_info,
        session_summary_text=session_summary_text,
    )
    
    messages = [
        {"role": "system", "content": EMPATHY_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    full_answer = ""
    token_buffer = ""
    BUFFER_SIZE = 12

    if EMPATHY_MODE == "featherless":
        try:
            async for token in featherless_stream_complete(
                messages=messages,
                model=FEATHERLESS_MODEL_FAST,
                max_tokens=350,
                temperature=0.7,
            ):
                full_answer += token
                token_buffer += token
                if len(token_buffer) >= BUFFER_SIZE or "\n" in token_buffer:
                    if stream_callback:
                        await stream_callback(token_buffer)
                    token_buffer = ""
        except Exception as e:
            console.print(f"[red]  EmpathyWriter featherless stream error: {str(e)[:200]}[/]")
            full_answer = _fallback_empathy_reply(question, sentiment)
    else:
        try:
            async for token in groq_stream_complete(
                prompt=prompt,
                system_prompt=EMPATHY_SYSTEM_PROMPT,
                model=GROQ_MODEL_FAST,
                max_tokens=350,
                temperature=0.7,
            ):
                full_answer += token
                token_buffer += token
                if len(token_buffer) >= BUFFER_SIZE or "\n" in token_buffer:
                    if stream_callback:
                        await stream_callback(token_buffer)
                    token_buffer = ""
        except Exception as e:
            console.print(f"[red]  EmpathyWriter groq stream error: {str(e)[:200]}[/]")
            full_answer = _fallback_empathy_reply(question, sentiment)
            token_buffer = ""

    if token_buffer and stream_callback:
        await stream_callback(token_buffer)

    return _finalize_response(full_answer)


async def generate_casual(question):
    """Casual response (không cần RAG)."""
    fallback_reply = _fallback_casual_reply(question)
    compact = re.sub(r"\s+", "", question or "")
    if extract_order_id(question) or extract_phone_number(question) or re.fullmatch(r"[\d\+\-\(\)]{8,}", compact):
        return fallback_reply

    messages = [
        {"role": "system", "content": CASUAL_SYSTEM_PROMPT},
        {"role": "user", "content": question},
    ]
    
    if EMPATHY_MODE == "featherless":
        try:
            return _finalize_response(await featherless_complete(
                messages=[
                    {"role": "system", "content": CASUAL_SYSTEM_PROMPT},
                    {"role": "user", "content": question},
                ],
                model=FEATHERLESS_MODEL_FAST,
                max_tokens=256,
                temperature=0.7,
            ))
        except Exception:
            return fallback_reply

    try:
        return _finalize_response(await groq_complete(
            prompt=question,
            system_prompt=CASUAL_SYSTEM_PROMPT,
            model=GROQ_MODEL_FAST,
            max_tokens=256,
            temperature=0.7,
        ))
    except Exception:
        return fallback_reply


async def generate_inquiry(question, evidence_text, order_info=None, catalog_info=None, session_summary_text=None):
    """Inquiry response (RAG nhẹ, không cần sentiment)."""
    order_context = _build_order_context(order_info or {})
    catalog_context = _build_catalog_context(catalog_info or {})
    session_context = f"NGỮ CẢNH PHIÊN:\n{session_summary_text}\n\n" if session_summary_text else ""
    prompt = (
        f"KHÁCH HÀNG HỎI:\n{question}\n\n"
        f"{session_context}"
        f"{order_context}"
        f"{catalog_context}"
        f"THÔNG TIN CHÍNH SÁCH:\n{evidence_text[:4000]}\n\n"
        f"Trả lời cụ thể, thân thiện."
    )
    messages = [
        {"role": "system", "content": INQUIRY_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    
    if EMPATHY_MODE == "featherless":
        try:
            return _finalize_response(await featherless_complete(
                messages=[
                    {"role": "system", "content": INQUIRY_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                model=FEATHERLESS_MODEL_FAST,
                max_tokens=512,
                temperature=0.3,
            ))
        except Exception:
            return _fallback_inquiry_reply(question, evidence_text, order_info=order_info, catalog_info=catalog_info)

    try:
        return _finalize_response(await groq_complete(
            prompt=prompt,
            system_prompt=INQUIRY_SYSTEM_PROMPT,
            model=GROQ_MODEL_FAST,
            max_tokens=512,
            temperature=0.3,
        ))
    except Exception:
        return _fallback_inquiry_reply(question, evidence_text, order_info=order_info, catalog_info=catalog_info)
