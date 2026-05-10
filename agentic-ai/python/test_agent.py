"""
EmpathAI — Test Script cho Agentic Pipeline.

Chạy từ thư mục python/:
    python test_agent.py

3 cấp độ test:
  [L1] Order Tool     — không cần deps, chạy ngay
  [L2] LangGraph Full — cần GROQ_API_KEY + Qdrant (hoặc chạy không có RAG)
  [L3] Hướng dẫn full stack (Docker + Rust)
"""
import sys
import os
import asyncio
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
os.environ["PYTHONIOENCODING"] = "utf-8"

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import box

console = Console(force_terminal=True)

# ══════════════════════════════════════════════════════
# LEVEL 1 — Order Tool (không cần bất kỳ service nào)
# ══════════════════════════════════════════════════════

def test_order_tool():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1 — Order Tool Unit Test[/]\n"
        "[dim]Không cần API key hay Docker[/]",
        border_style="cyan"
    ))

    from tools.order_tool import extract_order_id, get_order_info, determine_suggested_actions

    # --- Test 1: Regex extraction ---
    console.print("\n[bold]1. Kiểm tra Regex nhận dạng mã đơn[/]")
    test_phrases = [
        ("đơn hàng MK002 của tôi bị lỗi", "MK002"),
        ("mã đơn MK003, sao chưa giao?", "MK003"),
        ("đơn số MK007 giao trễ quá", "MK007"),
        ("tôi muốn hủy đơn #MK004", "MK004"),
        ("giao hàng lâu quá không thấy đơn đâu", None),   # Không có mã
        ("order id MK001 where is my package", "MK001"),
    ]

    table = Table(box=box.SIMPLE_HEAVY, show_header=True)
    table.add_column("Tin nhắn", style="white", max_width=45)
    table.add_column("Expected", style="dim")
    table.add_column("Got", style="bold")
    table.add_column("✓", justify="center")

    all_pass = True
    for phrase, expected in test_phrases:
        got = extract_order_id(phrase)
        ok = got == expected
        all_pass = all_pass and ok
        table.add_row(
            phrase,
            str(expected),
            str(got),
            "[green]✓[/]" if ok else "[red]✗[/]"
        )

    console.print(table)
    console.print(f"  Kết quả: {'[bold green]TẤT CẢ PASS[/]' if all_pass else '[bold red]CÓ LỖI[/]'}")

    # --- Test 2: Order lookup ---
    console.print("\n[bold]2. Kiểm tra tra cứu đơn hàng[/]")

    test_cases = [
        ("MK001", "shipping",    None),
        ("MK002", "delivered",   True),    # 24h → eligible
        ("MK003", "delivered",   False),   # 120h → NOT eligible
        ("MK004", "cancelled",   None),
        ("MK005", "processing",  None),
        ("MK006", "delivered",   True),    # 48h → eligible
        ("MK007", "shipping",    None),
        ("INVALID99", None,      None),    # Không tồn tại
    ]

    table2 = Table(box=box.SIMPLE_HEAVY, show_header=True)
    table2.add_column("Mã đơn", style="cyan")
    table2.add_column("Status", style="white")
    table2.add_column("Return Eligible")
    table2.add_column("Actions gợi ý", max_width=40)
    table2.add_column("Found", justify="center")

    for order_id, exp_status, exp_eligible in test_cases:
        info = get_order_info(order_id)
        found = info.get("found", False)
        status = info.get("status", "—") if found else "NOT FOUND"
        eligible = info.get("return_eligible")
        eligible_str = ("✅" if eligible else "⛔") if eligible is not None else "—"
        actions = ", ".join(info.get("suggested_actions", [])) if found else info.get("suggested_actions", ["ask_reconfirm_order_id"])[0]

        ok = (status == exp_status) if exp_status else (not found)
        table2.add_row(
            order_id,
            f"[green]{status}[/]" if found else f"[red]{status}[/]",
            eligible_str,
            actions[:38],
            "[green]✓[/]" if ok else "[red]✗[/]"
        )

    console.print(table2)

    # --- Test 3: suggested_actions với sentiment ---
    console.print("\n[bold]3. Kiểm tra suggested_actions theo sentiment[/]")
    info_mk003 = get_order_info("MK003")  # delivered >72h

    for sentiment in ["neutral", "frustrated", "toxic"]:
        actions = determine_suggested_actions(info_mk003, sentiment)
        console.print(f"  [dim]MK003 + sentiment=[/][cyan]{sentiment}[/] → {actions}")

    console.print("\n[bold green]✓ Level 1 hoàn thành[/]\n")


# ══════════════════════════════════════════════════════
# LEVEL 1b — Multi-turn Action Unit Test (không cần API)
# ══════════════════════════════════════════════════════

def test_multi_turn_action():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1b — Multi-turn Action Unit Test[/]\n"
        "[dim]Không cần API key[/]",
        border_style="cyan"
    ))

    from tools.action_tool import detect_action_intent, resume_action_intent
    from tools.order_tool import get_order_info

    # --- Turn 1: customer asks to change address, no order_id ---
    question_t1 = "Đổi địa chỉ giúp mình"
    order_info_empty = {}
    intent_t1 = detect_action_intent(question_t1, order_info_empty)

    console.print(f"\n[bold]Turn 1:[/] {question_t1}")
    console.print(f"  Action: {intent_t1.get('action')}, needs_order_id: {intent_t1.get('needs_order_id')}")
    assert intent_t1["action"] == "update_address", "Expected update_address intent"
    assert intent_t1["needs_order_id"] is True, "Expected needs_order_id=True when no order"

    # --- Turn 2: customer provides order_id ---
    order_info_mk001 = get_order_info("MK001")
    pending = {"action": "update_address"}
    question_t2 = "MK001"
    intent_t2 = resume_action_intent(question_t2, order_info_mk001, pending)

    console.print(f"\n[bold]Turn 2:[/] {question_t2} (resume pending)")
    console.print(f"  Action: {intent_t2.get('action')}, needs_more_info: {intent_t2.get('needs_more_info')}")
    assert intent_t2["action"] == "update_address", "Expected resumed update_address"
    assert intent_t2["needs_more_info"] is True, "Expected needs_more_info=True (no new address in 'MK001')"

    # --- Turn 3: customer provides new address ---
    question_t3 = "Địa chỉ mới là 123 Nguyễn Văn A, Quận 1"
    intent_t3 = resume_action_intent(question_t3, order_info_mk001, pending)

    console.print(f"\n[bold]Turn 3:[/] {question_t3} (resume pending)")
    console.print(f"  Action: {intent_t3.get('action')}, executable: {intent_t3.get('executable')}")
    assert intent_t3["action"] == "update_address", "Expected resumed update_address"
    assert intent_t3["executable"] is True, "Expected executable=True when address provided and order found"
    assert "123 Nguyễn Văn A" in (intent_t3.get("new_address") or ""), "Expected extracted address"

    console.print("\n[bold green]✓ Level 1b (Multi-turn) hoàn thành[/]\n")


def test_order_cache():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1c — Order Cache Unit Test[/]\n"
        "[dim]Không cần API key[/]",
        border_style="cyan"
    ))

    from tools.order_tool import _load_orders, _orders_cache, _orders_mtime
    import time

    # Load twice — second time should use cache
    t0 = time.time()
    orders1 = _load_orders()
    t1 = time.time()
    orders2 = _load_orders()
    t2 = time.time()

    delta_first = (t1 - t0) * 1000
    delta_second = (t2 - t1) * 1000

    assert orders1 is orders2, "Expected same cached object"
    # On fast SSD both may be ~0ms; assert cache is at least as fast and object is identical
    assert delta_second <= max(delta_first, 1.0), f"Expected cache hit to be fast: first={delta_first:.2f}ms, second={delta_second:.2f}ms"

    console.print(f"  First load:  {delta_first:.2f}ms")
    console.print(f"  Second load: {delta_second:.2f}ms (cached)")
    console.print("\n[bold green]✓ Level 1c (Order Cache) hoàn thành[/]\n")


# ══════════════════════════════════════════════════════
# LEVEL 2 — LangGraph Full Pipeline (cần Groq API key)
# ══════════════════════════════════════════════════════

async def test_pipeline_async(question: str, label: str):
    """Chạy một câu hỏi qua toàn bộ LangGraph pipeline."""
    from agents.graph import run_streaming

    console.print(f"\n[bold cyan]▶ {label}[/]")
    console.print(f"  [dim]Input:[/] {question}")

    tokens_received = []

    async def stream_cb(chunk: str):
        tokens_received.append(chunk)
        console.print(chunk, end="", markup=False)

    t0 = time.time()
    state = await run_streaming(
        question=question,
        history=[],
        session_id="test-session",
        stream_callback=stream_cb,
    )
    elapsed = int((time.time() - t0) * 1000)

    console.print()  # newline after streaming

    # Print trace summary
    trace = state.get("agent_trace", {})
    order_id = state.get("order_id", "")
    order_info = state.get("order_info", {})
    actions = state.get("suggested_actions", [])

    table = Table(box=box.MINIMAL, show_header=False, padding=(0, 1))
    table.add_column("Key", style="dim", width=22)
    table.add_column("Value", style="white")

    table.add_row("Intent",         trace.get("router_decision", "—"))
    table.add_row("Order ID",       order_id or "—  (không có trong tin nhắn)")
    table.add_row("Order Found",    "✅ Có" if order_info.get("found") else ("⚠️  Không tìm thấy" if order_id else "—"))
    table.add_row("Order Status",   order_info.get("status", "—"))
    table.add_row("Sentiment",      trace.get("sentiment_detected", "—"))
    table.add_row("RAG docs",       str(trace.get("retrieved_count", 0)))
    table.add_row("Actions",        str(actions) if actions else "—")
    table.add_row("Processing",     f"{elapsed}ms")

    console.print(table)


def test_pipeline():
    console.print(Panel.fit(
        "[bold yellow]LEVEL 2 — LangGraph Full Pipeline Test[/]\n"
        "[dim]Cần: GROQ_API_KEY trong .env | Qdrant optional (RAG có thể trả về rỗng)[/]",
        border_style="yellow"
    ))

    from config import GROQ_API_KEY, GROQ_API_KEYS
    if not GROQ_API_KEY and not GROQ_API_KEYS:
        console.print("[red]✗ GROQ_API_KEY / GROQ_API_KEYS chưa được set trong .env — bỏ qua Level 2[/]")
        return

    test_cases = [
        (
            "đơn MK002 của tôi bị giao sai sản phẩm, tôi muốn đổi trả",
            "COMPLAINT có mã đơn (delivered 24h — trong hạn đổi trả)"
        ),
        (
            "đơn hàng MK003 giao rồi nhưng bị hỏng, tôi muốn hoàn tiền!",
            "COMPLAINT có mã đơn (delivered 120h — QUÁ hạn đổi trả)"
        ),
        (
            "tôi đặt đơn MK007 nhưng chưa thấy giao hàng, giao trễ thế?",
            "COMPLAINT đơn đang shipping (bị delay)"
        ),
        (
            "đơn hàng không thấy đơn đâu, bực quá, tôi muốn hủy",
            "COMPLAINT KHÔNG có mã đơn (chỉ có sentiment)"
        ),
        (
            "chính sách đổi trả của MyKingdom là bao nhiêu ngày?",
            "INQUIRY không có mã đơn"
        ),
    ]

    loop = asyncio.new_event_loop()
    for question, label in test_cases:
        try:
            loop.run_until_complete(test_pipeline_async(question, label))
        except Exception as e:
            console.print(f"  [red]✗ Lỗi: {e}[/]")
        console.print("[dim]" + "─" * 60 + "[/]")

    loop.close()
    console.print("\n[bold green]✓ Level 2 hoàn thành[/]\n")


# ══════════════════════════════════════════════════════
# LEVEL 3 — Full Stack Integration Test (Rust + Kafka + Python)
# ══════════════════════════════════════════════════════

L3_WS_URL = "ws://127.0.0.1:8085/ws/chat"
L3_HTTP_URL = "http://127.0.0.1:8085"
L3_TIMEOUT = 180  # Groq có thể chậm đến 30s+

L3_TEST_CASES = [
    # --- Còn lỗi từ lần trước ---
    {
        "label": "[FIX] MK012 refund completed — KHÔNG tạo ticket mới, chỉ thông báo đã hoàn tất",
        "question": "đơn MK012 của tôi hoàn tiền tới đâu rồi?",
        "expect_order_id": "MK012",
    },
    {
        "label": "[FIX] MK015 giao thất bại 2 lần — Router phải COMPLAINT, KHÔNG INQUIRY",
        "question": "đơn MK015 của tôi bị giao thất bại 2 lần rồi, giờ tôi phải làm sao?",
        "expect_order_id": "MK015",
    },
    # --- New edge cases MK007, MK001, MK013 ---
    {
        "label": "[NEW] MK007 shipping delayed — đổi địa chỉ giao hàng mới",
        "question": "đơn MK007 của tôi giao đến địa chỉ mới là 123 Nguyễn Trãi Q.1 nhé",
        "expect_order_id": "MK007",
    },
    {
        "label": "[NEW] MK001 shipping — khách yêu cầu hủy khi đang giao (phải bị từ chối)",
        "question": "đơn MK001 của tôi sao lâu vậy, hủy giúp tôi đi",
        "expect_order_id": "MK001",
    },
    {
        "label": "[NEW] MK013 processing — đổi địa chỉ trước khi bàn giao vận chuyển",
        "question": "đơn MK013 giao nhầm địa chỉ rồi, đổi cho tôi sang 200 Lê Lợi Q.1 nhé",
        "expect_order_id": "MK013",
    },
]


async def _ws_send_receive(question: str, timeout: int = L3_TIMEOUT) -> dict:
    """Gửi 1 message qua WebSocket, đợi streaming tokens + final response."""
    try:
        import websockets
    except ImportError:
        return {"error": "websockets chưa cài. Chạy: pip install websockets"}

    import json
    import uuid

    session_id = f"l3-test-{uuid.uuid4().hex[:8]}"
    payload = json.dumps({"question": question, "session_id": session_id, "history": []})

    token_count = 0
    final = None
    t0 = time.time()
    try:
        async with websockets.connect(L3_WS_URL, open_timeout=10, ping_interval=None, ping_timeout=None) as ws:
            await ws.send(payload)
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue
                msg_type = msg.get("msg_type") or msg.get("type", "")
                if msg_type == "stream":
                    token_count += 1
                elif msg_type == "answer":
                    final = msg
                    break
                elif msg_type == "status":
                    continue
                if time.time() - t0 > timeout:
                    return {"error": f"Timeout sau {timeout}s"}
    except Exception as e:
        return {"error": str(e)}

    elapsed = int((time.time() - t0) * 1000)
    trace = (final.get("agent_trace") or {}) if final else {}
    return {
        "answer": final.get("answer", "") if final else "",
        "order_id": final.get("order_id", "") if final else "",
        "sentiment": final.get("sentiment", "") if final else "",
        "rag_docs": len(final.get("sources", [])) if final else 0,
        "from_cache": trace.get("from_cache", False),
        "token_chunks": token_count,
        "elapsed_ms": elapsed,
        "ok": final is not None,
    }


def test_full_stack():
    """L3: Kiểm tra toàn bộ stack qua WebSocket."""
    console.print(Panel.fit(
        "[bold magenta]LEVEL 3 — Full Stack Integration Test[/]\n"
        "[dim]Rust WebSocket → Kafka → Python LangGraph → Kafka → WebSocket streaming[/]\n"
        "[dim]Cần: cargo run (rust_backend) + python -m kafka_workers.query_worker[/]",
        border_style="magenta"
    ))

    # Pre-check: Rust backend health
    console.print("\n[bold]Pre-check[/] — Rust backend health...")
    try:
        import urllib.request
        with urllib.request.urlopen(f"{L3_HTTP_URL}/health", timeout=5) as r:
            console.print(f"  [green]OK[/] {L3_HTTP_URL}/health -> HTTP {r.status}")
    except Exception as e:
        console.print(f"  [red]x Rust backend chưa chạy: {e}[/]")
        console.print(f"  [dim]Mở terminal mới: cd rust_backend && cargo run[/]")
        console.print("[yellow]L3 bỏ qua.[/]\n")
        return

    # Pre-check: websockets package
    try:
        import websockets  # noqa
    except ImportError:
        console.print("  [red]x websockets chưa cài — pip install websockets[/]")
        return

    console.print(f"[dim]  WS: {L3_WS_URL} | timeout: {L3_TIMEOUT}s/câu[/]\n")

    passed = 0
    failed = 0
    loop = asyncio.get_event_loop()

    for tc in L3_TEST_CASES:
        console.print(f"[bold cyan]> {tc['label']}[/]")
        console.print(f"  [dim]Input:[/] {tc['question']}")

        result = loop.run_until_complete(_ws_send_receive(tc["question"]))

        if "error" in result:
            console.print(f"  [red]x Lỗi: {result['error']}[/]")
            failed += 1
            console.print("-" * 60 + "\n")
            continue

        issues = []
        if not result["answer"]:
            issues.append("answer rỗng")
        if tc["expect_order_id"] and result["order_id"] != tc["expect_order_id"]:
            issues.append(f"order_id expect {tc['expect_order_id']}, got '{result['order_id']}'")
        if not result["ok"]:
            issues.append("không có is_final=True")

        t = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
        t.add_column(style="dim", width=18)
        t.add_column()
        t.add_row("Order ID", result["order_id"] or "—")
        t.add_row("Sentiment", result["sentiment"] or "—")
        t.add_row("RAG docs", str(result["rag_docs"]))
        t.add_row("Stream tokens", str(result["token_chunks"]))
        t.add_row("From cache", "Yes" if result["from_cache"] else "No")
        t.add_row("Processing", f"{result['elapsed_ms']}ms")
        ans = result["answer"]
        t.add_row("Answer (100)", ans[:100] + "..." if len(ans) > 100 else ans)
        console.print(t)

        if not issues:
            console.print("  [bold green]PASS[/]")
            passed += 1
        else:
            console.print(f"  [bold red]FAIL: {', '.join(issues)}[/]")
            failed += 1
        console.print("-" * 60 + "\n")

    total = passed + failed
    if failed == 0:
        console.print(f"[bold green]Level 3 hoan thanh — {passed}/{total} PASS[/]\n")
    else:
        console.print(f"[bold yellow]Level 3 — {passed}/{total} PASS, {failed} FAIL[/]\n")


def print_full_stack_guide():
    console.print(Panel.fit(
        "[bold magenta]LEVEL 3 — Full Stack (Docker + Rust + Frontend)[/]",
        border_style="magenta"
    ))

    guide = """
[bold]Bước 1[/] — Khởi động hạ tầng:
  [cyan]docker-compose up -d qdrant redpanda[/]

[bold]Bước 2[/] — Index dữ liệu chính sách vào Qdrant (1 lần):
  [cyan]cd python && python -c "from retrieval.qdrant_client import QdrantWrapper; QdrantWrapper()"[/]

[bold]Bước 3[/] — Chạy Python Kafka worker:
  [cyan]cd python && python -m kafka_workers.query_worker[/]

[bold]Bước 4[/] — Chạy Rust WebSocket gateway:
  [cyan]cd rust_backend && cargo run[/]

[bold]Bước 5[/] — Mở browser:
  [cyan]http://localhost:8080[/]

[bold]Câu test nhanh trên UI:[/]
  • "đơn MK002 của tôi bị giao sai sản phẩm, muốn đổi trả ngay"
  • "đơn MK003 bị hỏng, tôi muốn hoàn tiền gấp!"
  • "đơn MK007 giao trễ quá, bực lắm rồi"
  • "chính sách bảo hành của MyKingdom như thế nào?"

[bold]Kiểm tra Agent Trace:[/]
  → Sau khi nhận phản hồi, bấm nút [Account Tree] để xem trace
  → Trace sẽ hiển thị bước [bold]Order Lookup[/] với mã đơn + trạng thái đã tra cứu
"""
    console.print(guide)


# ══════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════

if __name__ == "__main__":
    console.print(Panel(
        "[bold white]EmpathAI — Agentic Pipeline Test[/]\n"
        "[dim]Fine-tuned LLM + RAG + Order Lookup Tool[/]",
        border_style="white", padding=(0, 4)
    ))

    args = sys.argv[1:]
    run_l1 = "l2" not in args and "l3" not in args or "l1" in args
    run_l2 = "l2" in args or (not args)
    run_l3 = "l3" in args or (not args)

    if run_l1:
        test_order_tool()
        test_multi_turn_action()
        test_order_cache()

    if run_l2:
        test_pipeline()

    if run_l3:
        test_full_stack()
        print_full_stack_guide()
