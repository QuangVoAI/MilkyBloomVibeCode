const fs = require('fs');
const path = require('path');

const connectDB = require('../src/config/db');
const SupportTicket = require('../src/models/support-ticket.model');

const ROOT_DIR = path.resolve(__dirname, '../../');
const OUTPUT_FILE = path.resolve(ROOT_DIR, 'agentic-ai/evals/transcript_eval_cases.json');
const METRICS_FILE = path.resolve(ROOT_DIR, 'agentic-ai/runtime/chatbot_metrics.jsonl');

const normalize = (value) =>
    String(value || '')
        .replace(/\s+/g, ' ')
        .trim();

const inferIntent = (category, text) => {
    const q = normalize(text).toLowerCase();
    if (/(xin chào|chào|hello|hi|hey|cảm ơn|thanks|thank you|bye)/.test(q)) return 'CASUAL';
    if (/(size|bảng size|còn size|còn hàng|giao nhanh|giao trong ngày|khuyến mãi|bảo hành|thanh toán cod|cod|phí ship|ship nhanh|ưu đãi|giảm giá|chính sách)/.test(q)) {
        return 'INQUIRY';
    }
    if (['checkout', 'catalog', 'payment'].includes(category)) return 'INQUIRY';
    return 'COMPLAINT';
};

const inferAction = (category, text) => {
    const q = normalize(text).toLowerCase();
    if (category === 'shipping' || /(đơn|order|trạng thái|theo dõi|kiểm tra|bao giờ giao|ship chưa|giao chưa)/.test(q)) {
        return 'check_order_status';
    }
    if (category === 'refund' || /(hoàn tiền|refund|tiền về)/.test(q)) {
        return 'request_refund';
    }
    if (category === 'return' || /(đổi trả|return|trả hàng|đổi hàng)/.test(q)) {
        return 'process_return';
    }
    if (/(đổi địa chỉ|thay đổi địa chỉ|cập nhật địa chỉ|sửa địa chỉ)/.test(q)) {
        return 'update_address';
    }
    if (/(hủy đơn|hủy order|cancel order|không mua nữa)/.test(q)) {
        return 'cancel_order';
    }
    if (/(lỗi|hỏng|vỡ|giao sai|không đúng|hỗ trợ|khiếu nại|phàn nàn)/.test(q)) {
        return 'create_ticket';
    }
    return null;
};

const inferRoute = (intent, text) => {
    const q = normalize(text).toLowerCase();
    if (/(mình hỏi chút|cái đó sao rồi|xem giúp mình với|xem giúp với|cho mình hỏi cái này)/.test(q)) {
        return 'clarify';
    }
    if (intent === 'CASUAL') return 'casual';
    if (intent === 'INQUIRY') return 'inquiry';
    return 'complaint';
};

const inferFromTrace = (trace = {}) => {
    const question = normalize(trace.question);
    if (!question) return null;
    const intent = normalize(trace.intent || '').toUpperCase() || 'COMPLAINT';
    const action = normalize(trace.action || '').toLowerCase() || null;
    const route = trace.clarification_needed || trace.router_method === 'clarify'
        ? 'clarify'
        : inferRoute(intent, question);
    return {
        case_id: trace.trace_id ? `trace_${trace.trace_id}` : `trace_${Date.now()}`,
        question,
        expected_intent: intent,
        expected_action: action,
        expected_route: route,
        order_info: {},
        source: 'chatbot_trace',
        source_category: 'chatbot_metrics',
        created_at: trace.timestamp || null,
    };
};

const loadRuntimeTraces = () => {
    if (!fs.existsSync(METRICS_FILE)) return [];
    try {
        return fs
            .readFileSync(METRICS_FILE, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line))
            .filter((trace) => trace && normalize(trace.question));
    } catch (err) {
        console.warn(`Failed to load runtime traces: ${err.message}`);
        return [];
    }
};

const buildCasesFromTraces = (limit = 200) => {
    const seen = new Set();
    const traces = loadRuntimeTraces().slice(-limit);
    return traces
        .map((trace) => inferFromTrace(trace))
        .filter(Boolean)
        .filter((item) => {
            const key = `${item.question}|${item.expected_intent}|${item.expected_action || ''}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};

const buildCasesFromTickets = async (limit = 200) => {
    const tickets = await SupportTicket.find({
        $or: [
            { sourceMessage: { $exists: true, $ne: '' } },
            { description: { $exists: true, $ne: '' } },
            { subject: { $exists: true, $ne: '' } },
        ],
    })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('sourceMessage description category subject createdAt ticketNumber')
        .lean();

    return tickets
        .map((ticket) => {
            const question = normalize(ticket.sourceMessage || ticket.description || ticket.subject);
            if (!question) return null;
            const expectedIntent = inferIntent(ticket.category, question);
            const expectedAction = inferAction(ticket.category, question);
            return {
                case_id: `ticket_${ticket.ticketNumber || ticket._id}`,
                question,
                expected_intent: expectedIntent,
                expected_action: expectedAction,
                expected_route: inferRoute(expectedIntent, question),
                order_info: {},
                source: 'support_ticket',
                source_category: ticket.category || 'other',
                created_at: ticket.createdAt || null,
            };
        })
        .filter(Boolean);
};

const buildCases = async (limit = 200) => {
    const runtimeCases = buildCasesFromTraces(limit);
    if (runtimeCases.length > 0) {
        return runtimeCases;
    }
    return buildCasesFromTickets(limit);
};

const main = async () => {
    await connectDB();
    const cases = await buildCases(Number(process.env.EXPORT_LIMIT || 200));
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cases, null, 2), 'utf8');
    console.log(`Exported ${cases.length} transcript cases to ${OUTPUT_FILE}`);
    process.exit(0);
};

main().catch((err) => {
    console.error('Transcript export failed:', err);
    process.exit(1);
});
