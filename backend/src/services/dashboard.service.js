const dashboardRepo = require('../repositories/dashboard.repository');
const branchRepository = require('../repositories/branch.repository');
const fs = require('fs');
const path = require('path');

const chatbotMetricsPath = path.resolve(
    __dirname,
    '../../../agentic-ai/runtime/chatbot_metrics.jsonl',
);

const summarizeChatbotTraces = (traces = []) => {
    const total = traces.length;
    if (total === 0) {
        return {
            total: 0,
            lowConfidenceRate: 0,
            clarifyRate: 0,
            keywordFallbackRate: 0,
            vietnameseOkRate: 0,
            avgRouterConfidence: 0,
            avgActionConfidence: 0,
            topIntents: [],
            topActions: [],
            latestTraceAt: null,
        };
    }

    const intentCounts = new Map();
    const actionCounts = new Map();
    const clarifyReasonCounts = new Map();
    let lowConfidence = 0;
    let clarify = 0;
    let keywordFallback = 0;
    let vietnameseOk = 0;
    let routerConfidenceSum = 0;
    let actionConfidenceSum = 0;
    let latestTraceAt = null;

    traces.forEach((trace) => {
        const routerConfidence = Number(trace.router_confidence || 0);
        const actionConfidence = Number(trace.action_confidence || 0);
        routerConfidenceSum += routerConfidence;
        actionConfidenceSum += actionConfidence;
        if (routerConfidence < 0.45 || actionConfidence < 0.45) {
            lowConfidence += 1;
        }
        if (trace.clarification_needed) {
            clarify += 1;
        }
        const clarifyReason = String(trace.clarify_reason || trace.router_clarify_reason || '').trim();
        if (clarifyReason) {
            clarifyReasonCounts.set(clarifyReason, (clarifyReasonCounts.get(clarifyReason) || 0) + 1);
        }
        if (trace.router_method === 'keyword' || trace.action_method === 'keyword') {
            keywordFallback += 1;
        }
        if (trace.vietnamese_ok) {
            vietnameseOk += 1;
        }
        const intent = trace.intent || 'unknown';
        const action = trace.action || 'no_action';
        intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
        actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
        if (trace.timestamp) {
            latestTraceAt = trace.timestamp;
        }
    });

    const toTopList = (counts) =>
        Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([label, count]) => ({ label, count }));

    return {
        total,
        lowConfidenceRate: lowConfidence / total,
        clarifyRate: clarify / total,
        keywordFallbackRate: keywordFallback / total,
        vietnameseOkRate: vietnameseOk / total,
        avgRouterConfidence: routerConfidenceSum / total,
        avgActionConfidence: actionConfidenceSum / total,
        topIntents: toTopList(intentCounts),
        topActions: toTopList(actionCounts),
        topClarifyReasons: toTopList(clarifyReasonCounts),
        latestTraceAt,
    };
};

const buildTopCases = (traces = [], limit = 8) => {
    const sorted = [...traces].sort((a, b) => {
        const aScore = Number(a.router_confidence ?? a.action_confidence ?? 0);
        const bScore = Number(b.router_confidence ?? b.action_confidence ?? 0);
        const aTime = a.timestamp ? Date.parse(a.timestamp) : 0;
        const bTime = b.timestamp ? Date.parse(b.timestamp) : 0;
        if (aScore !== bScore) return aScore - bScore;
        return bTime - aTime;
    });

    return sorted.slice(0, limit).map((trace) => ({
        traceId: trace.trace_id || '',
        timestamp: trace.timestamp || null,
        question: trace.question || '',
        intent: trace.intent || 'unknown',
        action: trace.action || 'no_action',
        routerConfidence: Number(trace.router_confidence || 0),
        actionConfidence: Number(trace.action_confidence || 0),
        routerMethod: trace.router_method || '',
        actionMethod: trace.action_method || '',
        clarifyReason: trace.clarify_reason || trace.router_clarify_reason || '',
        clarificationNeeded: Boolean(trace.clarification_needed),
        fallbackUsed: Boolean(trace.router_method === 'keyword' || trace.action_method === 'keyword'),
        vietnameseOk: Boolean(trace.vietnamese_ok),
        lowConfidence: Number(trace.router_confidence || 0) < 0.45 || Number(trace.action_confidence || 0) < 0.45,
        semanticMargin: Number(trace.router_semantic_margin || 0),
        processingTimeMs: Number(trace.processing_time_ms || 0),
        answerPreview: String(trace.answer || '').slice(0, 180),
    }));
};

const filterLowConfidence = (traces = [], threshold = 0.45) =>
    traces.filter((trace) => Number(trace.router_confidence || 0) < threshold || Number(trace.action_confidence || 0) < threshold);

const filterClarifyReason = (traces = [], reason = '') => {
    const normalizedReason = String(reason || '').trim();
    return traces.filter((trace) => {
        const traceReason = String(trace.clarify_reason || trace.router_clarify_reason || '').trim();
        if (normalizedReason && normalizedReason !== 'all') {
            return traceReason === normalizedReason;
        }
        return Boolean(traceReason || trace.clarification_needed || trace.router_method === 'clarify');
    });
};

const loadChatbotTraces = (limit = 1000) => {
    try {
        if (!fs.existsSync(chatbotMetricsPath)) {
            return [];
        }
        const content = fs.readFileSync(chatbotMetricsPath, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        const slice = limit > 0 ? lines.slice(-limit) : lines;
        return slice
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch (err) {
                    return null;
                }
            })
            .filter(Boolean);
    } catch (err) {
        return [];
    }
};

module.exports = {
    async getSalesDistribution() {
        const total = await dashboardRepo.getTotalRevenue();
        const channel = await dashboardRepo.getRevenueByChannel();

        return {
            totalRevenue: total,
            byWebsite: channel.website,
            byMobile: channel.mobile,
            byCOD: channel.cod,
            byEwallet: channel.ewallet,
        };
    },

    async getSalesOverview() {
        return dashboardRepo.getUserSegmentation();
    },

    async getRevenueUpdates() {
        return dashboardRepo.getLast7DaysRevenue();
    },

    async getYearlySales() {
        const year = new Date().getFullYear();
        const thisYear = await dashboardRepo.getRevenueByYear(year);
        const lastYear = await dashboardRepo.getRevenueByYear(year - 1);

        return { thisYear, lastYear };
    },

    async getUserMap() {
        return dashboardRepo.getUserMap();
    },

    async getPaymentSummary() {
        return dashboardRepo.getPaymentSummary();
    },
    // chi nhánh cửa hàng
    async getBranchesMap() {
        return branchRepository.getBranchesWithOrderStats();
    },

    async getChatbotInsights() {
        const traces = loadChatbotTraces(1000);
        return summarizeChatbotTraces(traces);
    },

    async getChatbotCases(options = {}) {
        const limit = Number(options.limit || 8);
        const mode = String(options.mode || 'all').trim();
        const threshold = Number.isFinite(Number(options.threshold)) ? Number(options.threshold) : 0.45;
        const reason = String(options.reason || '').trim();
        const traces = loadChatbotTraces(1000);
        const clarifyCases = traces
            .filter((trace) => trace.clarification_needed || trace.router_method === 'clarify')
            .sort((a, b) => (Number(a.router_confidence || 0) - Number(b.router_confidence || 0)) || (Date.parse(b.timestamp || 0) - Date.parse(a.timestamp || 0)));
        const fallbackCases = traces
            .filter((trace) => trace.router_method === 'keyword' || trace.action_method === 'keyword')
            .sort((a, b) => (Number(a.router_confidence || a.action_confidence || 0) - Number(b.router_confidence || b.action_confidence || 0)) || (Date.parse(b.timestamp || 0) - Date.parse(a.timestamp || 0)));
        const lowConfidenceCases = filterLowConfidence(traces, threshold).sort((a, b) => (Number(a.router_confidence || a.action_confidence || 0) - Number(b.router_confidence || b.action_confidence || 0)) || (Date.parse(b.timestamp || 0) - Date.parse(a.timestamp || 0)));
        const clarifyReasonCases = filterClarifyReason(traces, reason).sort((a, b) => (Number(a.router_confidence || 0) - Number(b.router_confidence || 0)) || (Date.parse(b.timestamp || 0) - Date.parse(a.timestamp || 0)));

        const payload = {
            summary: summarizeChatbotTraces(traces),
            clarifyCases: buildTopCases(clarifyCases, limit),
            fallbackCases: buildTopCases(fallbackCases, limit),
            lowConfidenceCases: buildTopCases(lowConfidenceCases, limit),
            clarifyReasonCases: buildTopCases(clarifyReasonCases, limit),
            clarifyReasons: summarizeChatbotTraces(traces).topClarifyReasons,
            mode,
        };

        if (mode === 'low-confidence') {
            return {
                ...payload,
                cases: buildTopCases(lowConfidenceCases, limit),
            };
        }

        if (mode === 'clarify-reason') {
            return {
                ...payload,
                cases: buildTopCases(clarifyReasonCases, limit),
            };
        }

        return payload;
    },
};
