import ProductQuickViewModal from "./ProductQuickViewModal";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowRight,
  CreditCard,
  ChevronDown,
  Eye,
  Hash,
  Mail,
  MapPin,
  MessageCircle,
  Mic,
  Package,
  Paperclip,
  RefreshCcw,
  Send,
  ShoppingCart,
  ShoppingBag,
  Sparkles,
  Ticket,
  Trash2,
  X,
  Truck,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useCartContext } from "@/context/CartContext";
import { socketService } from "@/services/socket.service";
import { normalizeImageUrl } from "@/utils/imageOptimizer";
import { useProactiveEngine } from "@/hooks/useProactiveEngine";
import confetti from "canvas-confetti";
import "./ChatWidget.css";

const STORAGE_KEY = "milkybloom-chat-session-v2";
const SESSION_ID_KEY = "milkybloom-chat-session-id-v1";
const PROVIDER_STORAGE_KEY = "milkybloom-chat-provider-v1";
const MAX_HISTORY = 20;
const CHAT_ERROR_FALLBACK =
  "Mình đang gặp lỗi kết nối AI tạm thời. Bạn thử lại sau nhé.";

const WELCOME_MESSAGE = {
  role: "assistant",
  content:
    "Xin chào, mình là trợ lý MilkyBloom. Bạn cần hỏi về sản phẩm, đơn hàng, vận chuyển, đổi trả hay chính sách nào?",
};

const LAUNCH_SLOGANS = [
  "Gọn, nhanh, rõ.",
  "Chạm để mở chat.",
  "Một câu là đủ bắt đầu.",
  "Trợ lý mềm mại, trả lời sắc nét.",
  "Hỏi gì cũng có lối trả lời.",
  "Mở chat nhẹ nhàng, hỏi ngay điều bạn cần.",
  "Đơn hàng, sản phẩm, đổi trả đều sẵn sàng.",
  "Cần hỗ trợ, cứ để mình lo.",
  "Tối giản để bạn tập trung vào điều quan trọng.",
  "Trả lời ngắn gọn, dễ hiểu, đúng trọng tâm.",
  "Mọi câu hỏi đều bắt đầu bằng một chạm.",
  "Hỗ trợ nhanh, không làm bạn chờ lâu.",
  "Hỏi xong, có câu trả lời ngay.",
  "Mềm mại như glass, rõ ràng như lời nhắc.",
  "Tập trung vào câu hỏi, bỏ qua nhiễu.",
  "Một trợ lý nhỏ, một trải nghiệm mượt.",
  "Mở chat là có trợ giúp.",
  "Cần kiểm tra đơn, mình hỗ trợ ngay.",
  "Cần đổi trả, mình hướng dẫn từng bước.",
  "Cần tư vấn, mình nói ngắn gọn cho dễ chọn.",
  "Đặt câu hỏi, phần còn lại để mình xử lý.",
  "Nhanh hơn một tab, gọn hơn một cuộc gọi.",
  "Lịch sự, rõ ràng, đúng việc.",
  "Một nơi cho mọi câu hỏi của bạn.",
  "Mở nhẹ, hỏi nhanh, hiểu liền.",
  "Hỗ trợ như một người trợ lý thật sự.",
  "Bắt đầu bằng một câu, kết thúc bằng câu trả lời.",
  "Tìm đơn, hỏi chính sách, tra sản phẩm đều tiện.",
  "Không cần vòng vo, cứ hỏi thẳng.",
  "Giữ nhịp chat gọn gàng và dễ theo dõi.",
  "Giải đáp nhanh, trình bày sạch.",
  "Tất cả những gì bạn cần, ở ngay đây.",
  "Mở chat để đi thẳng vào việc.",
  "Ít nhiễu hơn, nhiều câu trả lời hơn.",
  "Chạm nhẹ, vào việc ngay.",
  "Luôn sẵn sàng khi bạn cần.",
  "Tinh gọn, sáng rõ, dễ dùng.",
  "Đơn hàng đang ở đâu? Mình kiểm tra giúp.",
  "Muốn xem sản phẩm nào? Hỏi mình nhé.",
  "Cần thông tin rõ ràng, mình sẽ nói gọn.",
  "Giữ mọi thứ nhẹ tay, cho bạn dễ tập trung.",
  "Hỗ trợ dịu dàng, kết quả rõ ràng.",
  "Một giao diện nhỏ, nhiều giá trị.",
  "Mở chat, mọi thứ trở nên đơn giản hơn.",
  "Bạn hỏi, mình tìm câu trả lời.",
  "Nhanh gọn như một cú chạm.",
  "Trợ lý đồng hành cho mọi thắc mắc.",
  "Một chạm để bắt đầu hỗ trợ.",
  "Gọn gàng, thân thiện, đúng lúc.",
  "Càng hỏi nhiều, càng tiện hơn.",
  "Chat nhẹ thôi, phần còn lại để mình lo.",
];

const getChatPhaseLabel = (phase) => {
  switch (phase) {
    case "connected":
      return "Connected";
    case "streaming":
      return "Streaming";
    case "done":
      return "Done";
    case "error":
      return "Error";
    case "offline":
      return "Offline";
    default:
      return "";
  }
};

const getUserIdFromStorage = () => {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed?.id || parsed?._id || "";
  } catch {
    return "";
  }
};

const getUserRoleFromStorage = () => {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed?.role || "";
  } catch {
    return "";
  }
};

const getUserEmailFromStorage = () => {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed?.email || parsed?.user?.email || "";
  } catch {
    return "";
  }
};

const EMAIL_TEXT_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/i;
const ORDER_ID_TEXT_PATTERN = /\b(?:(?:MK|ORD|DH)[-_]?\d{3,8}|[a-f0-9]{24})\b/i;
const PHONE_TEXT_PATTERN =
  /(?:\+?84|0)(?:[\s.-]?\d){9}\b/;

const getMessageEmail = (text) => {
  const match = String(text || "").trim().match(EMAIL_TEXT_PATTERN);
  return match ? match[0].toLowerCase() : "";
};

const getMessageOrderId = (text) => {
  const match = String(text || "").trim().match(ORDER_ID_TEXT_PATTERN);
  if (!match) return "";
  const normalized = match[0].replace(/[-_]/g, "");
  return /^[a-f0-9]{24}$/i.test(normalized)
    ? normalized.toLowerCase()
    : normalized.toUpperCase();
};

const getMessagePhone = (text) => {
  const match = String(text || "").trim().match(PHONE_TEXT_PATTERN);
  if (!match) return "";
  return match[0].replace(/[^\d+]/g, "");
};

const isEmailLookupText = (text) => Boolean(getMessageEmail(text));
const isOrderLookupText = (text) => Boolean(getMessageOrderId(text));
const isPhoneLookupText = (text) => Boolean(getMessagePhone(text));

const formatVnd = (value) => {
  if (value == null || value === "") return "chưa rõ";
  const raw =
    typeof value === "object" && value.$numberDecimal != null
      ? value.$numberDecimal
      : value;
  const number = Number(raw);
  if (!Number.isFinite(number)) return "chưa rõ";
  return `${Math.round(number).toLocaleString("vi-VN")}đ`;
};

const getProductRouteId = (product) =>
  product?.slug || product?._id || product?.id || "";

const getVariantId = (variant) => variant?._id || variant?.id || "";

const firstFromArray = (value) => (Array.isArray(value) && value.length ? value[0] : "");

const getProductImage = (product) => {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const variantImage = firstFromArray(
    variants.find((variant) => firstFromArray(variant?.imageUrls))?.imageUrls,
  );
  const candidate =
    firstFromArray(product?.imageUrls) ||
    product?.imageUrl ||
    product?.thumbnail ||
    product?.coverImage ||
    variantImage;

  return normalizeImageUrl(candidate, "/placeholder.svg");
};

const getVariantLabel = (variant) => {
  const attrs = Array.isArray(variant?.attributes) ? variant.attributes : [];
  const attrText = attrs
    .map((attr) =>
      attr?.name && attr?.value ? `${attr.name}: ${attr.value}` : attr?.value || "",
    )
    .filter(Boolean)
    .join(", ");
  return attrText || variant?.sku || "Biến thể";
};

const getAvailableVariants = (product) => {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.filter((variant) => {
    const stock = Number(variant?.stockQuantity ?? variant?.stock ?? 0);
    return getVariantId(variant) && stock > 0;
  });
};

const getActionLabel = (action) => {
  switch (action) {
    case "process_return":
      return "đổi trả";
    case "cancel_order":
      return "hủy đơn";
    case "request_refund":
      return "hoàn tiền";
    case "update_address":
      return "đổi địa chỉ";
    default:
      return "";
  }
};

const getQuickContactEmail = (meta) =>
  meta?.emailAddress ||
  meta?.orderInfo?.matched_email ||
  meta?.orderInfo?.raw?.email ||
  meta?.orderInfo?.raw?.customer_email ||
  meta?.orderInfo?.raw?.contact_email ||
  getUserEmailFromStorage();

const getQuickOrderId = (meta) =>
  meta?.orderId ||
  meta?.orderInfo?.order_id ||
  meta?.orderInfo?.raw?._id ||
  meta?.orderInfo?.raw?.id ||
  "";

const normalizeCatalogCards = (catalogInfo) => {
  const products = Array.isArray(catalogInfo?.products) ? catalogInfo.products : [];
  return products
    .filter((product) => product && (product.name || getProductRouteId(product)))
    .slice(0, 4);
};

const CartChip = ({ cartSummary, items, onCheckout, fallbackPrice }) => {
  const [expanded, setExpanded] = useState(false);
  const count = cartSummary?.itemCount > 0 ? cartSummary.itemCount : 1;
  const price = cartSummary?.subtotal > 0 ? cartSummary.subtotal : fallbackPrice;

  return (
    <div className="mt-2 animate-in slide-in-from-bottom-2 fade-in duration-300 w-fit max-w-[90%] flex flex-col gap-2">
      <div className="overflow-hidden rounded-full border border-emerald-200 bg-emerald-50/90 shadow-sm flex items-center gap-3 pr-1.5 pl-3 py-1.5 w-fit">
        <button 
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-[13px] font-medium text-emerald-800 hover:text-emerald-900 transition-colors"
        >
          <ShoppingCart className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="truncate">Giỏ hàng ({count}): <strong className="font-bold">{formatVnd(price)}</strong></span>
          <ChevronDown className={`h-4 w-4 text-emerald-600 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        <button
          type="button"
          onClick={onCheckout}
          className="shrink-0 rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-emerald-700 shadow-sm"
        >
          Thanh toán
        </button>
      </div>

      {expanded && items && items.length > 0 && (
        <div className="bg-white border border-emerald-100 rounded-xl p-3 shadow-md max-w-xs animate-in slide-in-from-top-2">
          <h4 className="text-[12px] font-bold text-slate-700 mb-2 border-b pb-1 border-emerald-100">Chi tiết giỏ hàng</h4>
          <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-start gap-3 text-[12px]">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 truncate" title={item.product?.name}>{item.product?.name}</div>
                  <div className="text-slate-500 text-[11px] truncate">
                    {Array.isArray(item.variant?.attributes) ? item.variant.attributes.map(a => a.value).join(', ') : item.variant?.sku || ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-slate-700 font-semibold">{item.quantity} x {formatVnd(item.price)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ComparisonCard = ({ comparison }) => {
  if (!comparison || !comparison.productA || !comparison.productB) return null;
  const { productA, productB } = comparison;

  return (
    <div className="mt-3 animate-in slide-in-from-bottom-2 fade-in duration-300 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm w-full max-w-[280px]">
      <div className="bg-blue-50 px-3 py-2 text-[13px] font-semibold text-blue-700 flex items-center gap-1.5 border-b border-blue-100">
        <Sparkles className="h-4 w-4" />
        <span>So sánh sản phẩm</span>
      </div>
      <div className="flex divide-x divide-slate-100">
        <div className="flex-1 p-2 flex flex-col gap-2">
          <div className="aspect-square rounded-xl bg-slate-50 border border-slate-100 overflow-hidden relative group">
            <img src={normalizeImageUrl(productA.image)} alt={productA.name} className="w-full h-full object-cover" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-800 text-[12px] line-clamp-2" title={productA.name}>{productA.name}</h4>
            <div className="text-rose-600 font-bold text-[13px] mt-1">{formatVnd(productA.price)}</div>
          </div>
          {productA.features && (
            <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-3 mt-1">
              {productA.features.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
        </div>
        <div className="flex-1 p-2 flex flex-col gap-2">
          <div className="aspect-square rounded-xl bg-slate-50 border border-slate-100 overflow-hidden relative group">
            <img src={normalizeImageUrl(productB.image)} alt={productB.name} className="w-full h-full object-cover" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-800 text-[12px] line-clamp-2" title={productB.name}>{productB.name}</h4>
            <div className="text-rose-600 font-bold text-[13px] mt-1">{formatVnd(productB.price)}</div>
          </div>
          {productB.features && (
            <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-3 mt-1">
              {productB.features.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

const ChatWidget = () => {
  const navigate = useNavigate();
  const { addItem, cartSummary, items } = useCartContext();
  const [open, setOpen] = useState(false);
  const [isPresented, setIsPresented] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [chatPhase, setChatPhase] = useState("idle");
  const [launchSloganIndex, setLaunchSloganIndex] = useState(0);
  const [cartActionLoading, setCartActionLoading] = useState("");
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const [composerHint, setComposerHint] = useState("");
  const [activeLookupChip, setActiveLookupChip] = useState("");
  const messagesRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);
  const sheetRef = useRef(null);
  const assistantIndexRef = useRef(null);
  const streamingSessionIdRef = useRef("");
  const chatSessionIdRef = useRef("");
  const closeTimerRef = useRef(null);
  const navigationTimerRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    // Initialize audio for chat messages
    const TING_SOUND_URL = "https://actions.google.com/sounds/v1/ui/pop.ogg";
    audioRef.current = new Audio(TING_SOUND_URL);
    audioRef.current.volume = 0.5;
  }, []);

  const { proactiveMessage, setProactiveMessage } = useProactiveEngine(isPresented, cartSummary?.itemCount || 0);

  const openChat = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsClosing(false);
    setIsPresented(true);
    setOpen(true);

    if (proactiveMessage) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: proactiveMessage,
        },
      ]);
      setProactiveMessage(null);
    }
  };

  // --- VOICE & VISUAL SEARCH FEATURE ---
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = "vi-VN";
      recognition.continuous = false;
      recognition.interimResults = false;
      
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => prev + (prev ? " " : "") + transcript);
        setIsRecording(false);
      };
      
      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsRecording(true);
      } catch (e) {
        console.error("Speech recognition error:", e);
      }
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      sendMessage(`[Đã gửi ảnh đính kèm: ${file.name}]`, { image_data: base64 });
      e.target.value = null;
      scrollToBottom(true);
    };
    reader.readAsDataURL(file);
  };
  // ------------------------------------

  const renderCartAddedCard = (cartMeta) => {
    if (!cartMeta?.cartAdded) return null;
    return (
      <CartChip 
        cartSummary={cartSummary} 
        items={items} 
        onCheckout={() => closeChatAndNavigate("/checkout")}
        fallbackPrice={cartMeta.product?.price || 0}
      />
    );
  };

  const clearChat = () => {
    setMessages([WELCOME_MESSAGE]);
    setLoading(false);
    setChatPhase("idle");
    setComposerHint("");
    setActiveLookupChip("");
    streamingSessionIdRef.current = "";
    chatSessionIdRef.current = "";
    assistantIndexRef.current = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(SESSION_ID_KEY);
      localStorage.removeItem(PROVIDER_STORAGE_KEY);
    } catch {
      // ignore storage failure
    }
  };

  const closeChat = () => {
    if (!isPresented || isClosing) return;
    if (navigationTimerRef.current) {
      window.clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = null;
    }
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setIsPresented(false);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, 320);
  };

  const closeChatAndNavigate = (path) => {
    if (!path) return;
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (navigationTimerRef.current) {
      window.clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = null;
    }

    if (!isPresented || isClosing) {
      navigate(path);
      return;
    }

    setIsClosing(true);
    navigationTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setIsPresented(false);
      setIsClosing(false);
      closeTimerRef.current = null;
      navigationTimerRef.current = null;
      navigate(path);
    }, 320);
  };

  const normalizeProviderChoice = (value) => {
    if (value === "agentic" || value === "auto") {
      return value;
    }
    return "agentic";
  };

  const effectiveProvider = normalizeProviderChoice(
    selectedProvider || "agentic",
  );

  useEffect(() => {
    try {
      const storedSessionId = sessionStorage.getItem(SESSION_ID_KEY);
      if (storedSessionId) {
        chatSessionIdRef.current = storedSessionId;
      } else {
        const nextSessionId = `chat_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        chatSessionIdRef.current = nextSessionId;
        sessionStorage.setItem(SESSION_ID_KEY, nextSessionId);
      }
    } catch {
      chatSessionIdRef.current = `chat_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
    }

    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          setMessages(parsed.messages);
        }
        if (typeof parsed.open === "boolean") {
          setOpen(parsed.open);
          setIsPresented(parsed.open);
        }
      }
    } catch {
      // ignore invalid cache
    } finally {
      setHydrated(true);
    }

    try {
      const storedProvider = localStorage.getItem(PROVIDER_STORAGE_KEY);
      if (storedProvider) {
        setSelectedProvider(
          storedProvider === "remote" ? "agentic" : storedProvider,
        );
      }
    } catch {
      // ignore storage read failures
    }

    const userId = getUserIdFromStorage();
    socketService.connect(userId, {
      token: localStorage.getItem("authToken") || "",
    });

    const refreshSocketAuth = () => {
      socketService.connect(getUserIdFromStorage(), {
        token: localStorage.getItem("authToken") || "",
      });
    };

    const handleSocketConnect = () => {
      setChatPhase("connected");
    };

    const handleSocketDisconnect = () => {
      setChatPhase("offline");
      setLoading(false);
    };

    const handleSocketReconnect = () => {
      setChatPhase("connected");
    };

    const handleSocketConnectError = () => {
      setChatPhase("offline");
      setLoading(false);
    };

    const handleStatus = (data) => {
      if (data?.session_id && data.session_id !== streamingSessionIdRef.current)
        return;
      if (data?.status === "started" || data?.message === "started" || data?.status === "streaming") {
        if (data?.status === "started" || data?.message === "started") {
          try {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch((e) => console.log("Audio play blocked:", e));
            }
          } catch (err) {}
        }
        setChatPhase("streaming");
      }
    };

    const handleToken = (data) => {
      if (data?.session_id && data.session_id !== streamingSessionIdRef.current)
        return;
      const chunk = data?.content || "";
      if (!chunk || assistantIndexRef.current == null) return;

      setMessages((current) => {
        const next = [...current];
        const target = next[assistantIndexRef.current];
        if (!target) return current;
        next[assistantIndexRef.current] = {
          ...target,
          content: `${target.content || ""}${chunk}`,
        };
        return next;
      });
    };

    const handleFinal = (data) => {
      if (data?.session_id && data.session_id !== streamingSessionIdRef.current)
        return;
      if (assistantIndexRef.current == null) {
        setLoading(false);
        return;
      }
      if (data?.reply) {
        const confidence = Number(
          data?.router_confidence ??
            data?.action_confidence ??
            data?.sentiment_score ??
            0,
        );
        setMessages((current) => {
          const next = [...current];
          const target = next[assistantIndexRef.current];
          if (!target) return current;
            next[assistantIndexRef.current] = {
              ...target,
              content: data.reply,
              meta: {
                ...(target.meta || {}),
                orderId: data.order_id || data.order_info?.order_id || "",
                emailAddress:
                  data.email_address ||
                  data.order_info?.matched_email ||
                  data.order_info?.raw?.email ||
                  data.order_info?.raw?.customer_email ||
                  data.order_info?.raw?.contact_email ||
                  "",
                orderInfo: data.order_info || {},
                ticketId: data.ticket_id || data.action_result?.ticket_id || "",
                ticketNumber:
                  data.ticket_number ||
                  data.action_result?.updated_fields?.ticket_number ||
                  "",
              traceId: data.trace_id || "",
              intent: data.intent || "",
              routerConfidence: confidence,
                routerMethod: data.router_method || "",
                actionConfidence: Number(data.action_confidence || 0),
                actionMethod: data.action_method || "",
                actionResult: data.action_result || {},
                pendingActionIntent: data.pending_action_intent || {},
                clarificationNeeded: Boolean(data.clarification_needed),
                actionButtons: data.action_buttons || data.actionButtons || [],
                confetti: Boolean(data.confetti),
                catalogProducts: normalizeCatalogCards(
                  data.catalog_info || data.checkout_result?.catalog_info,
                ),
              },
          };
          
          if (data.confetti) {
            // FIRE CONFETTI!
            confetti({
              particleCount: 150,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#f43f5e', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981']
            });
          }

          return next;
        });
      }
      setLoading(false);
      setChatPhase("done");
      streamingSessionIdRef.current = "";
      assistantIndexRef.current = null;
    };

    const handleError = (data) => {
      if (data?.session_id && data.session_id !== streamingSessionIdRef.current)
        return;
      const rawMessage = String(data?.message || "").trim();
      const message =
        rawMessage &&
        !/\/chat\/completions/i.test(rawMessage) &&
        !/\b(?:sk|gsk|pk)-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b/i.test(rawMessage) &&
        !/Bearer\s+[A-Za-z0-9._~+/=-]+/i.test(rawMessage)
          ? rawMessage
          : CHAT_ERROR_FALLBACK;
      if (assistantIndexRef.current != null) {
        setMessages((current) => {
          const next = [...current];
          const target = next[assistantIndexRef.current];
          if (!target) return current;
          next[assistantIndexRef.current] = { ...target, content: message };
          return next;
        });
      }
      setLoading(false);
      setChatPhase("error");
      streamingSessionIdRef.current = "";
      assistantIndexRef.current = null;
    };

    socketService.on("connect", handleSocketConnect);
    socketService.on("disconnect", handleSocketDisconnect);
    socketService.on("reconnect", handleSocketReconnect);
    socketService.on("connect_error", handleSocketConnectError);
    socketService.on("chat_token", handleToken);
    socketService.on("chat_final", handleFinal);
    socketService.on("chat_error", handleError);
    socketService.on("chat_status", handleStatus);
    window.addEventListener("userLoggedIn", refreshSocketAuth);
    window.addEventListener("userLoggedOut", refreshSocketAuth);

    return () => {
      socketService.off("connect", handleSocketConnect);
      socketService.off("disconnect", handleSocketDisconnect);
      socketService.off("reconnect", handleSocketReconnect);
      socketService.off("connect_error", handleSocketConnectError);
      socketService.off("chat_token", handleToken);
      socketService.off("chat_final", handleFinal);
      socketService.off("chat_error", handleError);
      socketService.off("chat_status", handleStatus);
      window.removeEventListener("userLoggedIn", refreshSocketAuth);
      window.removeEventListener("userLoggedOut", refreshSocketAuth);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          open,
          messages: messages.slice(-MAX_HISTORY),
          provider: selectedProvider || "",
        }),
      );
    } catch {
      // ignore storage write failures
    }
  }, [messages, open, hydrated, selectedProvider]);

  useEffect(() => {
    if (!messagesRef.current) return;
    if (!shouldStickToBottomRef.current) return;
    window.requestAnimationFrame(() => {
      if (!messagesRef.current) return;
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    });
  }, [messages, open]);

  useEffect(() => {
    const element = messagesRef.current;
    if (!element) return undefined;

    const updateStickiness = () => {
      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      shouldStickToBottomRef.current = distanceFromBottom < 120;
    };

    updateStickiness();
    element.addEventListener("scroll", updateStickiness, { passive: true });
    return () => element.removeEventListener("scroll", updateStickiness);
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (navigationTimerRef.current) {
        window.clearTimeout(navigationTimerRef.current);
      }
    };
  }, []);

  const sendViaWebSocket = async (trimmed, nextMessages, options = {}) => {
    const sessionId =
      chatSessionIdRef.current ||
      `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    chatSessionIdRef.current = sessionId;
    try {
      sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    } catch {
      // ignore storage write failures
    }
    streamingSessionIdRef.current = sessionId;
    setChatPhase("streaming");
    assistantIndexRef.current = nextMessages.length;
    setMessages((current) => [
      ...current,
      { role: "assistant", content: "", meta: {} },
    ]);
    const provider = normalizeProviderChoice(
      options.provider || effectiveProvider,
    );
    const orderIdMatch = trimmed.match(/\b[a-f0-9]{24}\b/i);
    const orderId = orderIdMatch?.[0]?.toLowerCase() || "";
    const orderLookupToken = orderId
      ? localStorage.getItem(`orderLookupToken:${orderId}`) || ""
      : "";
    const payload = {
      message: trimmed,
      history: nextMessages.slice(-MAX_HISTORY),
      provider: provider === "auto" ? "agentic" : provider,
      sessionId,
      guestSessionId:
        localStorage.getItem("sessionId") ||
        localStorage.getItem("guestSessionId") ||
        "",
      guestEmail: localStorage.getItem("guestEmail") || "",
      orderLookupToken,
      authToken: localStorage.getItem("authToken") || "",
    };
    if (options.image_data) {
      payload.image_data = options.image_data;
    }

    try {
      if (!socketService.isConnected()) {
        socketService.connect(getUserIdFromStorage(), {
          token: localStorage.getItem("authToken") || "",
        });
        await socketService.waitForConnection(12000);
      }

      const sent = socketService.sendChatMessage(payload);
      if (!sent) {
        throw new Error("Socket is not connected");
      }
    } catch {
      if (assistantIndexRef.current != null) {
        setMessages((current) => {
          const next = [...current];
          const target = next[assistantIndexRef.current];
          if (!target) return current;
          next[assistantIndexRef.current] = {
            ...target,
            content: CHAT_ERROR_FALLBACK,
          };
          return next;
        });
      }
      setLoading(false);
      setChatPhase("offline");
      streamingSessionIdRef.current = "";
      assistantIndexRef.current = null;
    }
  };

  const sendMessage = async (text, options = {}) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];
    shouldStickToBottomRef.current = true;
    setMessages(nextMessages);
    setInput("");
    setComposerHint("");
    setActiveLookupChip("");
    setLoading(true);
    await sendViaWebSocket(trimmed, nextMessages, options);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await sendMessage(input);
  };

  const focusComposer = () => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange?.(
        inputRef.current.value.length,
        inputRef.current.value.length,
      );
    });
  };

  const handleLookupChipClick = async (message, actionType) => {
    const meta = message?.meta || {};
    if (actionType === "order_id") {
      const orderId = getQuickOrderId(meta);
      if (!orderId) {
        toast.info("Mình chưa tìm thấy mã đơn trong tin nhắn này.");
        return;
      }
      setInput(orderId);
      setComposerHint("Mã đơn đã được điền sẵn, bấm gửi để tra đơn");
      setActiveLookupChip("order_id");
      focusComposer();
      return;
    }

    if (actionType === "phone") {
      const phone = getMessagePhone(message?.content || "");
      if (!phone) {
        toast.info("Mình chưa tìm thấy số điện thoại trong tin nhắn này.");
        return;
      }
      setInput(phone);
      setComposerHint("Số điện thoại đã được điền sẵn, bấm gửi để tra đơn");
      setActiveLookupChip("phone");
      focusComposer();
      return;
    }

    if (actionType === "email") {
      const email = getQuickContactEmail(meta) || getMessageEmail(message?.content || "");
      if (!email) {
        toast.info("Mình chưa tìm thấy email trong tin nhắn này.");
        return;
      }
      setComposerHint("");
      setActiveLookupChip("email");
      await sendMessage(email);
    }
  };

  const handleViewProduct = (product) => {
    if (!product) return;
    setQuickViewProduct(product);
  };

  const handleCartProductAction = async (product, variant, { buyNow = false } = {}) => {
    const variantId = getVariantId(variant);
    const actionKey = `${variantId || getProductRouteId(product)}-${buyNow ? "buy" : "add"}`;
    if (!variantId) {
      toast.info("Bạn mở chi tiết sản phẩm để chọn biến thể trước nhé.");
      handleViewProduct(product);
      return;
    }

    setCartActionLoading(actionKey);
    try {
      await addItem(variantId, 1);
      const variantText = getVariantLabel(variant);
      toast.success(`${product?.name || "Sản phẩm"} (${variantText}) đã vào giỏ.`);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: buyNow
            ? `Mình đã thêm ${product?.name || "sản phẩm này"} vào giỏ. Mình đưa bạn sang trang checkout nhé.`
            : `Mình đã thêm ${product?.name || "sản phẩm này"} vào giỏ rồi nè.`,
          meta: {
            cartAdded: true,
            product: {
              name: product?.name,
              image: product?.images?.[0]?.url || product?.images?.[0] || product?.image,
              variantName: variantText,
              price: variant?.price || product?.price,
            }
          },
        },
      ]);
    } catch (error) {
      toast.error(error?.message || "Mình chưa thêm được sản phẩm vào giỏ.");
    } finally {
      setCartActionLoading("");
    }
  };

  const handleQuickFollowupAction = async (message, actionType) => {
    const meta = message?.meta || {};
    if (actionType === "order_id") {
      const orderId = getQuickOrderId(meta);
      if (!orderId) {
        toast.info("Mình chưa có mã đơn trong ngữ cảnh này.");
        return;
      }
      await sendMessage(orderId);
      return;
    }

    if (actionType === "email") {
      const email = getQuickContactEmail(meta);
      if (!email) {
        toast.info("Mình chưa có email trong ngữ cảnh này.");
        return;
      }
      await sendMessage(email);
      return;
    }

    if (actionType === "continue") {
      const pendingAction = meta?.pendingActionIntent?.action || meta?.actionResult?.action || "";
      const actionLabel = getActionLabel(pendingAction);
      await sendMessage(actionLabel ? `tiếp tục ${actionLabel}` : "xử lý tiếp");
    }
  };

  const handleAssistantActionButton = async (action) => {
    if (!action) return;
    if (action.type === "navigate" && action.path) {
      navigate(action.path);
      return;
    }
    if (action.type === "retry") {
      await sendMessage(action.value || action.message || "");
      return;
    }
    if (action.value || action.message) {
      await sendMessage(action.value || action.message);
    }
  };

  const renderAssistantActionButtons = (message) => {
    const actions = message?.meta?.actionButtons || [];
    if (!actions.length) return null;

    return (
      <div className="mt-3 flex flex-wrap gap-2 border-t border-rose-100 pt-3">
        {actions.map((action, index) => (
          <button
            key={`${action.type || "action"}-${index}`}
            type="button"
            onClick={() => handleAssistantActionButton(action)}
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-600"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            {action.label || "Tiếp tục"}
          </button>
        ))}
      </div>
    );
  };

  const renderFollowupActions = (message) => {
    const meta = message?.meta || {};
    const actionResult = meta?.actionResult || {};
    const pendingAction = meta?.pendingActionIntent || {};
    const actionName = pendingAction.action || actionResult.action || "";
    const shouldShow =
      message.role === "assistant" &&
      ["process_return", "cancel_order", "request_refund", "update_address"].includes(actionName) &&
      (actionResult.pending || actionResult.needs_order_id || actionResult.needs_more_info || pendingAction.action);

    if (!shouldShow) return null;

    const orderId = getQuickOrderId(meta);
    const email = getQuickContactEmail(meta);
    const canContinue = Boolean(orderId || email || actionResult.success || actionResult.pending);

    return (
      <div className="mt-3 flex flex-wrap gap-2 border-t border-rose-100 pt-3">
        <button
          type="button"
          onClick={() => handleQuickFollowupAction(message, "order_id")}
          className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Hash className="h-3.5 w-3.5" />
          Gửi mã đơn
        </button>
        <button
          type="button"
          onClick={() => handleQuickFollowupAction(message, "email")}
          className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Mail className="h-3.5 w-3.5" />
          Gửi email
        </button>
        <button
          type="button"
          onClick={() => handleQuickFollowupAction(message, "continue")}
          disabled={!canContinue}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          Xử lý tiếp
        </button>
      </div>
    );
  };

  const renderLookupChip = (message, { type, label, toneClass, icon }) => {
    const meta = message?.meta || {};
    const content = message?.content || "";
    let value = "";

    if (type === "order_id") {
      value = getMessageOrderId(content) || getQuickOrderId(meta);
    } else if (type === "phone") {
      value = getMessagePhone(content);
    } else if (type === "email") {
      value = getMessageEmail(content);
    }

    if (!value) return null;

    const isActive = activeLookupChip === type;
    const iconClassName = isActive
      ? "h-3 w-3 text-amber-700 animate-pulse"
      : "h-3 w-3 opacity-80";
    const LookupIcon = icon;

    return (
      <button
        type="button"
        onClick={() => handleLookupChipClick(message, type)}
        className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:brightness-98 ${
          isActive
            ? `${toneClass} ring-2 ring-offset-1 ring-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_10px_20px_rgba(15,23,42,0.12)]`
            : toneClass
        }`}
      >
        <LookupIcon className={iconClassName} />
        {label}
      </button>
    );
  };

  const renderOrderCard = (orderInfo) => {
    if (!orderInfo) return null;
    return (
      <div className="mt-3 animate-in slide-in-from-bottom-2 fade-in duration-300 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm w-full max-w-[280px]">
        <div className="bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-700 flex items-center justify-between border-b border-emerald-100">
          <div className="flex items-center gap-1.5 truncate pr-2">
            <Package className="h-4 w-4 shrink-0" />
            <span className="truncate">Đơn hàng #{orderInfo.display_id || orderInfo.order_id || orderInfo.id}</span>
          </div>
          <span className="bg-white px-2 py-0.5 rounded-full text-[11px] font-bold border border-emerald-100 whitespace-nowrap">
            {orderInfo.status || "N/A"}
          </span>
        </div>
        <div className="p-3 text-[12px] text-slate-700 space-y-2">
          {orderInfo.customer_name && (
            <div className="flex items-start gap-2">
              <span className="font-semibold w-[60px] shrink-0 text-slate-500">Khách hàng:</span>
              <span className="font-medium text-slate-800">{orderInfo.customer_name}</span>
            </div>
          )}
          {orderInfo.address && (
            <div className="flex items-start gap-2">
              <span className="font-semibold w-[60px] shrink-0 text-slate-500">Giao đến:</span>
              <span className="line-clamp-2">{orderInfo.address}</span>
            </div>
          )}
          {orderInfo.total_amount != null && (
            <div className="flex items-start gap-2 pt-1 border-t border-slate-100">
              <span className="font-semibold w-[60px] shrink-0 text-slate-500">Tổng tiền:</span>
              <span className="font-bold text-emerald-600">{formatVnd(orderInfo.total_amount)}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderProductCards = (products = []) => {
    if (!products.length) return null;

    return (
      <div className="mt-3 space-y-2">
        {products.map((product, productIndex) => {
          const routeId = getProductRouteId(product);
          const variants = getAvailableVariants(product);
          const fallbackVariant = variants[0] || null;
          const minPrice = product.minPrice ?? product.price;
          const maxPrice = product.maxPrice;
          const priceText =
            maxPrice && maxPrice !== minPrice
              ? `${formatVnd(minPrice)} - ${formatVnd(maxPrice)}`
              : formatVnd(minPrice);

          return (
            <div
              key={`${routeId || product.name || "product"}-${productIndex}`}
              className="rounded-[20px] border border-white/70 bg-white/72 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => handleViewProduct(product)}
                  className="group relative h-[86px] w-[86px] shrink-0 overflow-hidden rounded-[18px] border border-white/80 bg-gradient-to-br from-rose-50 to-sky-50 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                  aria-label={`Xem ${product.name || "sản phẩm"}`}
                >
                  <img
                    src={getProductImage(product)}
                    alt={product.name || "Sản phẩm MilkyBloom"}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.src = "/placeholder.svg";
                    }}
                  />
                  <span className="absolute inset-x-2 bottom-2 rounded-full bg-white/82 px-2 py-0.5 text-[10px] font-bold text-slate-700 opacity-0 shadow-sm transition group-hover:opacity-100">
                    Xem
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[15px] font-bold tracking-[-0.02em] text-slate-950">
                        {product.name || "Sản phẩm MilkyBloom"}
                      </div>
                      <div className="mt-0.5 text-[13px] font-semibold text-rose-600">
                        {priceText}
                      </div>
                      {product.totalStock != null && (
                        <div className="mt-0.5 text-[12px] text-slate-500">
                          Tồn kho: {product.totalStock}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleViewProduct(product)}
                      disabled={!routeId}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white/85 px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-rose-200 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Xem
                    </button>
                  </div>
                </div>
              </div>

              {variants.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {variants.slice(0, 3).map((variant) => {
                    const variantId = getVariantId(variant);
                    const addKey = `${variantId}-add`;
                    const buyKey = `${variantId}-buy`;
                    return (
                      <div
                        key={variantId}
                        className="rounded-2xl border border-rose-100/80 bg-rose-50/55 p-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0 text-[12px] text-slate-700">
                            <span className="font-semibold text-slate-900">
                              {getVariantLabel(variant)}
                            </span>
                            <span className="ml-1 text-slate-500">
                              {formatVnd(variant.price ?? variant.salePrice ?? product.minPrice ?? product.price)} · còn {variant.stockQuantity ?? variant.stock ?? "?"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleCartProductAction(product, variant)}
                              disabled={Boolean(cartActionLoading)}
                              className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
                            >
                              <ShoppingCart className="h-3 w-3" />
                              {cartActionLoading === addKey ? "Đang thêm" : "Thêm"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleCartProductAction(product, variant, { buyNow: true })
                              }
                              disabled={Boolean(cartActionLoading)}
                              className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-rose-600 disabled:cursor-wait disabled:opacity-60"
                            >
                              <CreditCard className="h-3 w-3" />
                              {cartActionLoading === buyKey ? "Đang mua" : "Mua"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleCartProductAction(product, fallbackVariant)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-slate-800"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Chọn biến thể
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const handleClear = () => {
    setMessages([WELCOME_MESSAGE]);
    setInput("");
    setComposerHint("");
    setActiveLookupChip("");
    setLoading(false);
    setChatPhase("idle");
    streamingSessionIdRef.current = "";
    chatSessionIdRef.current = "";
    assistantIndexRef.current = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(SESSION_ID_KEY);
      localStorage.removeItem(PROVIDER_STORAGE_KEY);
    } catch {
      // ignore storage failure
    }
  };

  const statusClassName = () => {
    switch (chatPhase) {
      case "connected":
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
      case "streaming":
        return "border-sky-200 bg-sky-50 text-sky-700";
      case "done":
        return "border-rose-200 bg-rose-50 text-rose-700";
      case "error":
        return "border-amber-200 bg-amber-50 text-amber-700";
      case "offline":
        return "border-slate-200 bg-slate-50 text-slate-500";
      default:
        return "border-slate-200 bg-slate-50 text-slate-500";
    }
  };

  const sheetStateClassName =
    chatPhase === "streaming"
      ? "chat-widget-sheet--streaming"
      : chatPhase === "connected" || chatPhase === "done"
        ? "chat-widget-sheet--active"
        : "";

  useEffect(() => {
    if (open) return undefined;

    const interval = window.setInterval(() => {
      setLaunchSloganIndex((current) => (current + 1) % LAUNCH_SLOGANS.length);
    }, 2200);

    return () => window.clearInterval(interval);
  }, [open]);

  return (
    <>
      {!isPresented ? (
        <div className="fixed bottom-3 right-3 z-[80] sm:bottom-6 sm:right-6 flex flex-col items-end">
          {proactiveMessage && (
            <div 
              className="mb-4 mr-2 max-w-[260px] animate-in slide-in-from-bottom-3 fade-in duration-500 cursor-pointer group"
              onClick={openChat}
            >
              <div className="bg-white px-4 py-3 rounded-2xl rounded-br-sm shadow-[0_12px_28px_rgba(0,0,0,0.12)] border border-slate-100 relative group-hover:-translate-y-1 transition-transform">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center text-white shadow-sm">
                    <Sparkles className="w-3 h-3" />
                  </div>
                  <span className="font-bold text-rose-600 text-[12px] uppercase tracking-wide">Trợ lý MilkyBloom</span>
                </div>
                <p className="text-[14px] text-slate-700 leading-snug">{proactiveMessage}</p>
                <div className="absolute -bottom-2 right-4 w-4 h-4 bg-white border-b border-r border-slate-100 transform rotate-45 shadow-[3px_3px_5px_rgba(0,0,0,0.02)]"></div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={openChat}
            className="chat-widget-launch group flex min-h-[188px] w-[min(92vw,340px)] flex-col justify-between rounded-[30px] px-5 py-5 text-slate-900 sm:min-h-[220px] sm:w-[clamp(286px,22vw,360px)]"
            aria-label="Open MilkyBloom chat"
          >
          <div className="flex items-start justify-between gap-4">
            <span className="chat-widget-launch__orb flex h-11 w-11 items-center justify-center rounded-full text-white sm:h-12 sm:w-12">
              <MessageCircle className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
            </span>
            <span className="chat-widget-launch__eyebrow inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
              AI support
            </span>
          </div>

          <div className="chat-widget-launch__title-wrap space-y-2.5 text-left">
            <span className="chat-widget-launch__title block text-slate-950">
              <span className="chat-widget-launch__title-main block">
                MilkyBloom
              </span>
              <span className="chat-widget-launch__title-sub block">
                Assistant
              </span>
            </span>
            <span
              key={launchSloganIndex}
              className="chat-widget-launch__slogan block max-w-[22ch] text-slate-600"
            >
              {LAUNCH_SLOGANS[launchSloganIndex]}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="chat-widget-launch__hint text-[12px] font-medium text-slate-500">
              Chạm để bắt đầu
            </span>
            <span className="chat-widget-launch__send inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/78 text-sky-500 shadow-[0_10px_18px_rgba(15,23,42,0.08)]">
              <Send className="h-4 w-4 -rotate-12" />
            </span>
          </div>
          </button>
        </div>
      ) : (
        <div
          className={`chat-widget-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/10 p-2 backdrop-blur-[14px] sm:p-6 ${
            isClosing ? "chat-widget-backdrop--closing" : "chat-widget-backdrop--open"
          }`}
          onClick={closeChat}
        >
          <div
            ref={sheetRef}
            className={`chat-widget-sheet ${
              isClosing ? "chat-widget-sheet--closing" : "chat-widget-sheet--open"
            } ${sheetStateClassName} relative h-[calc(100dvh-0.75rem)] w-[calc(100vw-0.75rem)] max-h-none max-w-none overflow-hidden rounded-[28px] shadow-[0_28px_80px_rgba(15,23,42,0.16)] sm:h-[min(82vh,52rem)] sm:w-[min(92vw,56rem)] sm:max-h-[52rem] sm:max-w-[56rem] sm:rounded-[36px]`}
            onClick={(event) => event.stopPropagation()}
          >
          <div className="chat-widget-sheet__glass relative z-[1] flex h-full w-full flex-col overflow-hidden rounded-[26px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(252,252,254,0.88))] backdrop-blur-[28px] sm:rounded-[34px]">
            <div className="chat-widget-sheet__content relative flex h-full w-full flex-col">
            <div className="chat-widget-intel-aurora" aria-hidden="true" />
            <div
              className="chat-widget-intel-orb chat-widget-intel-orb--one"
              aria-hidden="true"
            />
            <div
              className="chat-widget-glow chat-widget-glow--rose"
              aria-hidden="true"
            />
            <div
              className="chat-widget-glow chat-widget-glow--amber"
              aria-hidden="true"
            />

            <div className="relative px-3 pt-3 sm:px-4">
              <div
                className="mx-auto h-[5px] w-11 rounded-full bg-slate-300/32 shadow-[0_1px_0_rgba(255,255,255,0.78)]"
                aria-hidden="true"
              />
            </div>

            <div className="chat-widget-sheet__header relative flex items-start justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4 sm:py-3.5">
              <div className="flex min-w-0 items-start gap-2.5">
                <div className="chat-widget-orb mt-0.5 flex h-11 w-11 items-center justify-center rounded-full border border-white/80 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.99)_0%,rgba(255,239,246,0.94)_20%,rgba(255,214,221,0.76)_44%,rgba(191,219,254,0.46)_70%,rgba(192,132,252,0.62)_88%,rgba(251,113,133,0.88)_100%)] text-white shadow-[0_14px_32px_rgba(251,113,133,0.2)] ring-2 ring-white/70 sm:h-12 sm:w-12">
                  <Sparkles className="h-[18px] w-[18px] drop-shadow-[0_1px_1px_rgba(255,255,255,0.42)]" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <h2 className="truncate text-[19px] font-semibold tracking-[-0.06em] text-slate-950 [text-rendering:optimizeLegibility] sm:text-[21px]">
                      MilkyBloom Assistant
                    </h2>
                    {getChatPhaseLabel(chatPhase) ? (
                      chatPhase === "connected" || chatPhase === "streaming" ? (
                        <span
                          className={`inline-flex h-2.5 w-2.5 rounded-full ${
                            chatPhase === "connected"
                              ? "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
                              : "bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.16)] animate-pulse"
                          }`}
                          aria-label={getChatPhaseLabel(chatPhase)}
                          title={getChatPhaseLabel(chatPhase)}
                        />
                      ) : (
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClassName()}`}
                        >
                          {getChatPhaseLabel(chatPhase)}
                        </span>
                      )
                    ) : null}
                  </div>
                  <p className="chat-widget-sheet__subtitle truncate text-[13.5px] text-slate-500 sm:text-[15px]">
                    Hỏi sản phẩm, đơn hàng, đổi trả và hỗ trợ nhanh.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleClear}
                  className="chat-widget-sheet__icon-button rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100/80 hover:text-slate-800"
                  aria-label="Clear chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={closeChat}
                  className="chat-widget-sheet__icon-button rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100/80 hover:text-slate-800"
                  aria-label="Close chat"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div
              ref={messagesRef}
              className="chat-widget-sheet__messages chat-widget-message-pane chat-widget-scroll relative flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4"
            >
              {messages.map((message, index) => {
                const isUser = message.role === "user";
                const isAssistant = message.role === "assistant";
                const isTyping =
                  isAssistant && loading && index === assistantIndexRef.current;
                const hasRenderableAssistantContent =
                  Boolean(String(message.content || "").trim()) ||
                  isTyping ||
                  Boolean(message.meta?.catalogProducts?.length) ||
                  Boolean(message.meta?.actionButtons?.length) ||
                  Boolean(message.meta?.actionResult) ||
                  Boolean(message.meta?.pendingActionIntent);
                const emailLookupMessage = isUser && isEmailLookupText(message.content);
                const hasOrderId = isUser && isOrderLookupText(message.content);
                const hasPhone = isUser && isPhoneLookupText(message.content);
                if (isAssistant && !hasRenderableAssistantContent) {
                  return null;
                }
                return (
                  <div
                    key={`${message.role}-${index}`}
                    className={`chat-widget-message flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[92%] rounded-[24px] px-3.5 py-3.5 text-[15.5px] leading-[1.7] shadow-[0_12px_34px_rgba(15,23,42,0.08)] sm:max-w-[88%] sm:px-4 sm:py-4 sm:text-[16.5px] ${
                        isUser
                          ? "chat-widget-message--user bg-[linear-gradient(180deg,rgba(58,76,110,0.98),rgba(72,85,124,0.96))] text-white shadow-[0_18px_34px_rgba(71,85,105,0.22)]"
                          : "chat-widget-message--assistant border border-rose-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.998),rgba(255,244,248,0.985))] text-slate-800 shadow-[0_14px_34px_rgba(15,23,42,0.08)]"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">
                        {message.content || (isTyping ? "Đang suy nghĩ" : "")}
                      </div>
                      {emailLookupMessage &&
                        renderLookupChip(message, {
                          type: "email",
                          label: "Tra đơn bằng email",
                          toneClass: "border-sky-200 bg-sky-50 text-sky-700",
                          icon: Mail,
                        })}
                      {hasOrderId &&
                        renderLookupChip(message, {
                          type: "order_id",
                          label: "Gửi mã đơn",
                          toneClass: "border-rose-200 bg-rose-50 text-rose-700",
                          icon: Hash,
                        })}
                      {hasPhone &&
                        renderLookupChip(message, {
                          type: "phone",
                          label: "Gửi số điện thoại",
                          toneClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
                          icon: MessageCircle,
                        })}
                      {isAssistant &&
                        renderProductCards(message.meta?.catalogProducts || [])}
                      {isAssistant && message.meta?.orderInfo?.found && renderOrderCard(message.meta.orderInfo)}
                      {isAssistant && renderAssistantActionButtons(message)}
                      {isAssistant && renderFollowupActions(message)}
                      {isAssistant && message.meta?.comparison && <ComparisonCard comparison={message.meta.comparison} />}
                      {isAssistant && message.meta?.cartAdded && renderCartAddedCard(message.meta)}
                      {isTyping && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:-0.2s]" />
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:-0.1s]" />
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
                        </div>
                      )}
                      {isAssistant &&
                        (message.meta?.ticketId ||
                          message.meta?.ticketNumber) &&
                        getUserRoleFromStorage() === "admin" && (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/admin/support-tickets/${message.meta.ticketId || message.meta.ticketNumber}`,
                              )
                            }
                            className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            <Ticket className="h-3.5 w-3.5" />
                            Open ticket
                          </button>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="chat-widget-sheet__composer border-t border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.86))] px-3 py-3 backdrop-blur-[22px] sm:px-4 sm:py-4">
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                
                {/* Visual Search Button */}
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef}
                  className="hidden" 
                  onChange={handleFileUpload} 
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="chat-widget-attach flex h-[48px] w-[48px] items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 sm:h-[52px] sm:w-[52px]"
                  title="Tìm hoa bằng hình ảnh"
                >
                  <Paperclip className="h-[20px] w-[20px]" />
                </button>

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    if (composerHint) {
                      setComposerHint("");
                    }
                    if (activeLookupChip) {
                      setActiveLookupChip("");
                    }
                  }}
                  rows={1}
                  placeholder={composerHint || "Nhắn MilkyBloom..."}
                  className={`chat-widget-siri-input h-[48px] flex-1 resize-none rounded-full px-4 py-3 text-[15px] leading-[1.45] text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_4px_12px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-500 focus:ring-2 sm:h-[52px] sm:px-5 sm:py-3.5 sm:text-[16px] ${
                    activeLookupChip
                      ? "border-amber-300 bg-[linear-gradient(180deg,rgba(255,252,231,0.995),rgba(254,243,199,0.9))] focus:border-amber-400 focus:ring-amber-100/80"
                      : "border-rose-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.995),rgba(255,240,246,0.96))] focus:border-rose-300/80 focus:ring-rose-100/80"
                  }`}
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                />

                {/* Voice Mode Button */}
                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`flex h-[48px] w-[48px] items-center justify-center rounded-full transition sm:h-[52px] sm:w-[52px] ${
                    isRecording 
                      ? "animate-pulse bg-rose-100 text-rose-600" 
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  }`}
                  title="Voice Chat"
                >
                  <Mic className="h-[20px] w-[20px]" />
                </button>

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="chat-widget-siri-send group flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full bg-rose-500 transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40 sm:h-[52px] sm:w-[52px]"
                  aria-label="Send message"
                >
                  <Send className="h-[18px] w-[18px] text-white transition duration-200 group-hover:translate-x-[2px] group-hover:-translate-y-[2px]" />
                </button>
              </form>
            </div>
            </div>
          </div>
        </div>
        </div>
      )}
      
      {/* Render Quick View Modal outside the ChatWidget container logic */}
      {quickViewProduct && (
        <ProductQuickViewModal 
          product={quickViewProduct} 
          onClose={() => setQuickViewProduct(null)} 
        />
      )}
    </>
  );
};

export default ChatWidget;
