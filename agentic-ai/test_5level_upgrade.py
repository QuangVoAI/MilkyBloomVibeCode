#!/usr/bin/env python3
"""
Comprehensive Test Suite for EmpathAI 5-Level Upgrade
Tests all levels: Memory, Follow-up, Tool-First, Confidence Gating, Voice
"""

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PYTHON_DIR = ROOT / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from agents.graph import run_streaming


# Test scenarios
TEST_CASES = [
    {
        "name": "Level 1 & 2: Session Memory + Follow-up Detection",
        "description": "Test multi-turn with follow-up context preservation",
        "turns": [
            {
                "user": "Tìm áo dưới 500k",
                "expect": "Session memory captures budget, products stored",
                "check_keys": ["session_summary", "budget", "viewed_products"]
            },
            {
                "user": "Còn size 40 không",
                "expect": "Detects follow-up_catalog, contextualizes with product",
                "check_keys": ["follow_up_type"],
                "should_contain": ["40", "size"]
            },
            {
                "user": "Màu khác có không",
                "expect": "Contextual follow-up about color variants",
                "check_keys": ["follow_up_type"],
                "should_contain": ["màu"]
            }
        ]
    },
    {
        "name": "Level 3: Tool-First Execution",
        "description": "Test direct tool execution without LLM overhead",
        "turns": [
            {
                "user": "Đơn mình ở đâu",
                "expect": "Order lookup → direct format (no LLM needed)",
                "check_keys": ["used_llm"],
                "should_be": {"used_llm": False}
            },
            {
                "user": "Bao giờ giao",
                "expect": "Follow-up order question, cached result",
                "check_keys": ["follow_up_type"],
                "should_contain": ["giao"]
            }
        ]
    },
    {
        "name": "Level 4: Confidence Gating - Smart Questions",
        "description": "Test confidence-based clarification",
        "turns": [
            {
                "user": "Thay địa chỉ",
                "expect": "Ambiguous → specific request, not generic 'I don't understand'",
                "should_contain": ["đơn nào", "địa chỉ"],
                "should_not_contain": ["không hiểu"]
            },
            {
                "user": "Đơn MK-001",
                "expect": "Now has order context → proceeds with action",
                "check_keys": ["action_intent"]
            }
        ]
    },
    {
        "name": "Level 5: Voice Consistency - Natural Tone",
        "description": "Test anti-robot voice polish",
        "turns": [
            {
                "user": "Xin lỗi, đơn mình hủy được không",
                "expect": "Empathetic response without robot phrases",
                "should_not_contain": ["tôi là AI", "xin lỗi vì sự bất tiện", "tôi không thể"]
            },
            {
                "user": "Hủy đơn này",
                "expect": "Consistent pronouns, natural follow-up",
                "should_contain": ["được", "hủy"]
            }
        ]
    },
    {
        "name": "Real Scenario: Customer Service Excellence",
        "description": "Full realistic conversation flow",
        "turns": [
            {
                "user": "Chào, mình muốn hỏi về tình trạng đơn",
                "expect": "Friendly greeting, asking for order details",
                "should_contain": ["mã đơn", "điện thoại"]
            },
            {
                "user": "Mình mua áo hôm trước, tầm 1 triệu",
                "expect": "Session memory captures budget context",
                "check_keys": ["session_summary"]
            },
            {
                "user": "Còn bao lâu giao",
                "expect": "Follow-up: understands it's about delivery time",
                "should_contain": ["giao", "ngày"]
            },
            {
                "user": "Phí ship bao nhiêu",
                "expect": "Question about shipping cost",
                "should_contain": ["ship", "phí"]
            }
        ]
    }
]


async def run_test_case(case_idx: int, case: dict):
    """Run a single test case with multiple turns."""
    print(f"\n{'='*80}")
    print(f"📝 TEST {case_idx + 1}: {case['name']}")
    print(f"{'='*80}")
    print(f"Description: {case['description']}\n")

    session_id = f"test_session_{case_idx}_{int(asyncio.get_event_loop().time())}"
    history = []
    results = []

    for turn_idx, turn in enumerate(case.get("turns", []), 1):
        print(f"\n{'─'*80}")
        print(f"Turn {turn_idx}: {turn['user']}")
        print(f"{'─'*80}")

        try:
            # Run chat
            state = await run_streaming(
                question=turn["user"],
                history=history,
                session_id=session_id,
                shop_context={"user_id": "test_user", "order_id": ""},
                stream_callback=None
            )

            answer = state.get("answer", "")
            print(f"\n🤖 Bot: {answer[:200]}...\n" if len(answer) > 200 else f"\n🤖 Bot: {answer}\n")

            # Validation checks
            checks_passed = True

            # Check expected keys
            if "check_keys" in turn:
                for key in turn["check_keys"]:
                    if key in state and state[key]:
                        print(f"✅ {key}: {str(state[key])[:100]}")
                    else:
                        print(f"❌ {key}: MISSING or empty")
                        checks_passed = False

            # Check should_contain
            if "should_contain" in turn:
                for phrase in turn["should_contain"]:
                    if phrase.lower() in answer.lower():
                        print(f"✅ Contains '{phrase}'")
                    else:
                        print(f"❌ Missing '{phrase}'")
                        checks_passed = False

            # Check should_not_contain
            if "should_not_contain" in turn:
                for phrase in turn["should_not_contain"]:
                    if phrase.lower() not in answer.lower():
                        print(f"✅ No robot phrase '{phrase}'")
                    else:
                        print(f"❌ Robot phrase detected: '{phrase}'")
                        checks_passed = False

            # Check should_be (exact value)
            if "should_be" in turn:
                for key, expected in turn["should_be"].items():
                    if state.get(key) == expected:
                        print(f"✅ {key} == {expected}")
                    else:
                        print(f"❌ {key} = {state.get(key)} (expected {expected})")
                        checks_passed = False

            # Print trace info
            trace = state.get("agent_trace", {})
            if "used_llm" in trace:
                print(f"\n📊 Tool Usage: used_llm={trace.get('used_llm')}")
            if "follow_up_type" in state and state.get("follow_up_type"):
                print(f"📊 Follow-up Type: {state.get('follow_up_type')}")
            if "router_gate" in state and state.get("router_gate"):
                print(f"📊 Gate Decision: {state.get('router_gate', {}).get('decision')}")
            if trace.get("router_ms"):
                print(f"⏱️ Router: {trace.get('router_ms')}ms")
            if trace.get("writer_ms"):
                print(f"⏱️ Writer: {trace.get('writer_ms')}ms")

            # Add to history
            history.append({"role": "user", "content": turn["user"]})
            history.append({"role": "assistant", "content": answer})

            # Store result
            result = {
                "turn": turn_idx,
                "user": turn["user"],
                "bot": answer[:200],
                "passed": checks_passed,
                "trace": {k: v for k, v in trace.items() if k in ["router_ms", "writer_ms", "used_llm", "follow_up_type"]}
            }
            results.append(result)

            if checks_passed:
                print(f"\n✅ Turn {turn_idx}: PASSED")
            else:
                print(f"\n⚠️  Turn {turn_idx}: PARTIAL PASS")

        except Exception as e:
            print(f"❌ Error: {str(e)}")
            results.append({
                "turn": turn_idx,
                "user": turn["user"],
                "error": str(e),
                "passed": False
            })

    return {
        "case": case["name"],
        "passed": all(r.get("passed", False) for r in results),
        "turns": results
    }


async def main():
    """Run all test cases."""
    print("\n" + "="*80)
    print("🧪 EmpathAI 5-LEVEL UPGRADE - COMPREHENSIVE TEST SUITE")
    print("="*80)
    print("\nTesting:")
    print("  ✓ Level 1: Session Memory (Conversation Context)")
    print("  ✓ Level 2: Follow-up Detection (Context Awareness)")
    print("  ✓ Level 3: Tool-First Execution (Cost + Speed)")
    print("  ✓ Level 4: Confidence Gating (Smart Questions)")
    print("  ✓ Level 5: Voice Consistency (Natural Tone)")
    print()

    all_results = []
    for case_idx, case in enumerate(TEST_CASES):
        try:
            result = await run_test_case(case_idx, case)
            all_results.append(result)
        except Exception as e:
            print(f"\n❌ Test case failed: {str(e)}")
            all_results.append({"case": case["name"], "error": str(e), "passed": False})

    # Summary
    print("\n\n" + "="*80)
    print("📊 TEST SUMMARY")
    print("="*80)

    passed = sum(1 for r in all_results if r.get("passed"))
    total = len(all_results)

    for result in all_results:
        status = "✅ PASSED" if result.get("passed") else "❌ FAILED"
        print(f"{status}: {result['case']}")

    print(f"\nOverall: {passed}/{total} test cases passed ({100*passed//total}%)")

    if passed == total:
        print("\n🎉 ALL TESTS PASSED! EmpathAI 5-Level Upgrade is working perfectly!")
    else:
        print(f"\n⚠️  {total - passed} test(s) need attention")

    print("\n" + "="*80)


if __name__ == "__main__":
    asyncio.run(main())
