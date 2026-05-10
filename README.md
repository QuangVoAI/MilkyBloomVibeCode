# MilkyBloom x EmpathAI

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="Frontend" />
  <img src="https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Backend" />
  <img src="https://img.shields.io/badge/Database-MongoDB%20Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="Database" />
  <img src="https://img.shields.io/badge/Chat-Streaming%20Only-7C3AED?style=for-the-badge&logo=socket.io&logoColor=white" alt="Chat" />
  <img src="https://img.shields.io/badge/AI-EmpathAI%20%2B%20Featherless-0F766E?style=for-the-badge" alt="AI" />
</p>

MilkyBloom x EmpathAI là một nền tảng thương mại điện tử đồ chơi trẻ em tích hợp lớp CSKH agentic thời gian thực.

- **MilkyBloom**: storefront e-commerce, product catalog, cart, checkout, orders, profile
- **EmpathAI**: agentic customer service, xử lý hội thoại thấu cảm, tra cứu ngữ cảnh, và thực thi action hỗ trợ khách hàng

Mục tiêu của dự án là giữ trải nghiệm mua sắm mượt cho khách hàng, đồng thời để AI hỗ trợ khách hàng theo cách tự nhiên, có ngữ cảnh, và phản hồi realtime.

## Project Highlights

- **Streaming-only chat**: UI chat luôn phản hồi theo thời gian thực, không còn chế độ public trả lời cuối
- **Mongo-only media**: ảnh demo và ảnh nghiệp vụ được phục vụ qua MongoDB GridFS, không phụ thuộc local assets
- **Agentic support flow**: EmpathAI có thể hiểu ngữ cảnh, tra cứu, và thực thi hành động hỗ trợ khách hàng
- **Clone-and-run friendly**: seed catalog, env mẫu, và hướng dẫn chạy đã được chuẩn hóa để dễ triển khai lại

## Mục Lục

- [Tổng Quan](#tổng-quan)
- [Kiến Trúc Hệ Thống](#kiến-trúc-hệ-thống)
- [Luồng Hoạt Động Chi Tiết](#luồng-hoạt-động-chi-tiết)
- [Cấu Trúc Repository](#cấu-trúc-repository)
- [Công Nghệ Chính](#công-nghệ-chính)
- [Chạy Dự Án](#chạy-dự-án)
- [Cấu Hình Quan Trọng](#cấu-hình-quan-trọng)
- [Thành Viên](#thành-viên)

## Tổng Quan

Repository này gồm 3 lớp chính:

- `frontend/` để hiển thị UI cho người dùng và admin
- `backend/` để xử lý API, database, auth, ảnh, đơn hàng, và bridge chat
- `agentic-ai/` để chạy pipeline CSKH agentic riêng, stream phản hồi qua WebSocket

Luồng chat hiện tại là **streaming only**. Người dùng gửi tin nhắn từ frontend, backend chuyển sang EmpathAI, EmpathAI xử lý pipeline agentic, rồi stream token ngược về UI.

## Kiến Trúc Hệ Thống

```mermaid
flowchart LR
    U([Người dùng]) --> F[Frontend\nReact + Vite]
    F -->|REST API| B[Backend\nExpress + MongoDB]
    B -->|WebSocket chat| A[EmpathAI\nPython + LangGraph]
    A -->|Stream token| B
    B -->|Realtime response| F

    B --> M[(MongoDB Atlas\nGridFS + Collections)]
    A --> L[Groq / Featherless\nOpenAI-compatible LLM]

    style F fill:#f97316,color:#fff
    style B fill:#2563eb,color:#fff
    style A fill:#7c3aed,color:#fff
    style M fill:#16a34a,color:#fff
    style L fill:#0f766e,color:#fff
```

### Vai trò từng lớp

- **Frontend** là lớp trình bày, gọi API, hiển thị catalog, checkout, profile, và chat support
- **Backend** là trung tâm điều phối, xử lý dữ liệu sản phẩm, đơn hàng, auth, ảnh, và bridge qua EmpathAI
- **EmpathAI** là lớp CSKH agentic, gồm router, retrieval, action execution, reviewer, và writer
- **MongoDB Atlas** lưu toàn bộ dữ liệu nghiệp vụ và ảnh demo qua GridFS
- **Groq** và **Featherless** là hai backend LLM OpenAI-compatible cho EmpathAI

## Luồng Hoạt Động Chi Tiết

### 1. Luồng duyệt sản phẩm

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant BE as Backend
    participant DB as MongoDB

    U->>FE: Mở trang home / shop / product detail
    FE->>BE: GET /api/products, /api/categories, /api/orders...
    BE->>DB: Query dữ liệu + populate relations
    DB-->>BE: JSON products, variants, categories
    BE-->>FE: Dữ liệu đã chuẩn hóa
    FE-->>U: Render catalog, card, gallery, cart
```

Điểm đáng chú ý:

- Ảnh sản phẩm, biến thể, category, review, comment, avatar được lưu dưới dạng URL stream từ MongoDB GridFS
- Frontend không phụ thuộc ảnh local trong repo
- Demo vẫn có ảnh ngay sau khi seed lại database

### 2. Luồng chat streaming

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant BE as Backend
    participant AI as EmpathAI
    participant LLM as Featherless

    U->>FE: Nhập câu hỏi trong chat widget
    FE->>BE: Gửi message qua WebSocket
    BE->>AI: Forward request sang agentic-ai
    AI->>AI: Router -> Retrieval -> Action -> Review
    AI->>LLM: Sinh phản hồi thấu cảm
    LLM-->>AI: Token stream
    AI-->>BE: Stream token từng phần
    BE-->>FE: Đẩy token realtime về UI
    FE-->>U: Hiển thị chữ chạy dần
```

Chat UI hiện chỉ dùng streaming, không còn chế độ trả lời cuối trong public UI.

### 3. Luồng ảnh demo và seed data

```mermaid
flowchart TD
    S[Seed script] --> P[Load catalog source]
    P --> G[Upload ảnh vào MongoDB GridFS]
    G --> U[Store stream URL trong MongoDB documents]
    U --> F[Frontend đọc imageUrls từ API]
    F --> R[Render ảnh trực tiếp từ backend stream]
```

Ý nghĩa của luồng này:

- không cần `frontend/public/seed-images`
- không cần S3 hay CDN ngoài cho demo
- clone về là có thể seed và chạy ngay

## Luồng Chi Tiết Theo Chức Năng

### Frontend

- Nhận dữ liệu từ backend qua REST API
- Render product cards, gallery, cart, checkout, profile, admin panel
- Kết nối WebSocket để chat streaming
- Tự fallback ảnh khi URL cũ hoặc URL lỗi

### Backend

- Đóng vai trò API gateway cho app
- Kết nối MongoDB Atlas
- Quản lý ảnh qua GridFS
- Điều phối chat sang EmpathAI
- Giữ các HTTP chat cũ ở trạng thái internal diagnostics

### EmpathAI

- Router intent
- Hybrid retrieval / policy lookup
- Action execution cho các tác vụ hỗ trợ khách hàng
- Writer / reviewer tạo phản hồi cuối cùng
- Stream token realtime về backend

## Cấu Trúc Repository

```text
MilkyBloomVibeCode/
├── frontend/              # UI React + Vite
├── backend/               # API Express + MongoDB + GridFS
├── agentic-ai/            # EmpathAI service
├── docs/                  # Tài liệu tích hợp và vận hành
└── README.md              # Tài liệu tổng quan của toàn bộ hệ thống
```

### Backend

```text
backend/
├── src/
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   └── libs/
├── scripts/
├── data/
└── .env.example
```

### EmpathAI

```text
agentic-ai/
├── python/
├── data/
├── server.py
├── ws_server.py
└── environment.yml
```

## Công Nghệ Chính

| Lớp | Công nghệ | Vai trò |
|---|---|---|
| Frontend | React, Vite, Tailwind, Radix | Giao diện người dùng và admin |
| Backend | Node.js, Express, MongoDB, GridFS | API, auth, data, media |
| Chat Streaming | WebSocket | Stream token realtime |
| Agentic AI | Python, LangGraph | Router, retrieval, action, writer |
| LLM Backend | Groq / Featherless | Sinh phản hồi cho EmpathAI |

## Chạy Dự Án

### 1. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 2. Backend

```bash
cd backend
npm install
npm run dev
```

Backend local mặc định chạy trên `http://localhost:6969`.

### 3. Seed Demo Catalog

```bash
cd backend
npm run seed:catalog
```

Script này:

- tạo dữ liệu mẫu trong MongoDB
- lưu ảnh demo vào MongoDB GridFS
- phát ảnh qua URL stream của backend
- không cần ảnh local trong repo

Nếu bạn có dữ liệu cũ trỏ về `/seed-images/...`, chạy thêm:

```bash
cd backend
npm run migrate:seed-images
```

### 4. EmpathAI

```bash
cd agentic-ai
conda activate deeplearning
./run_agentic.sh
```

Hoặc chạy riêng:

```bash
cd agentic-ai
python server.py
python ws_server.py
```

## Cấu Hình Quan Trọng

### Backend

- `PORT=6969`
- `MONGO_URI` trỏ tới MongoDB Atlas đã deploy
- `CHAT_PROVIDER=agentic`
- `AGENTIC_AI_WS_URL=ws://127.0.0.1:8788`

### Frontend

- `VITE_API_URL=http://localhost:6969/api`

### EmpathAI

- `EMPATHY_MODE=groq` hoặc `EMPATHY_MODE=featherless`
- `GROQ_API_KEY`
- `GROQ_BASE_URL=https://api.groq.com/openai/v1`
- `FEATHERLESS_API_KEY`
- `FEATHERLESS_BASE_URL=https://api.featherless.ai/v1`

## Tài Liệu Liên Quan

- [Frontend README](frontend/README.md)
- [EmpathAI README](agentic-ai/README.md)
- [EmpathAI local run guide](agentic-ai/README.local.md)

## Thành Viên

- `523H0173` - Võ Xuân Quang
- `523H0178` - Hoàng Xuân Thành

## Ghi Chú

- Chat UI hiện là **streaming only**
- `GET /providers` chỉ là snapshot nội bộ cho monitoring/debug
- Các endpoint HTTP chat cũ chỉ còn dùng cho internal diagnostics
- Ảnh demo và ảnh nghiệp vụ đều đi qua MongoDB GridFS, không cần ảnh local trong repo
