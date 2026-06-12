# MilkyBloom x EmpathAI

<p align="center">
  <img src="./VC2026-A-MT03_20260603_153831.png" alt="MilkyBloom x EmpathAI poster" width="860" />
</p>

<p align="center">
  <a href="https://milkybloom-frontend.onrender.com/"><img src="https://img.shields.io/badge/Live%20Demo-MilkyBloom-ff5ca8?style=for-the-badge" alt="Live Demo" /></a>
  <img src="https://img.shields.io/badge/AI-Empathy%20Assistant-cb6ce6?style=for-the-badge" alt="Empathy AI" />
  <img src="https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61dafb?style=for-the-badge&logo=react&logoColor=ffffff" alt="Frontend" />
  <img src="https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-339933?style=for-the-badge&logo=node.js&logoColor=ffffff" alt="Backend" />
  <img src="https://img.shields.io/badge/Database-MongoDB%20Atlas-47a248?style=for-the-badge&logo=mongodb&logoColor=ffffff" alt="Database" />
</p>

<p align="center">
  <strong>MilkyBloom</strong> là một trải nghiệm thương mại điện tử full-stack cho dòng sản phẩm sưu tầm, kết hợp storefront hiện đại với
  <strong>EmpathAI</strong> - lớp trợ lý AI hỗ trợ khách hàng theo cách tự nhiên, có ngữ cảnh và giàu tính đồng cảm.
</p>

<p align="center">
  Người xem có thể hiểu dự án như một sản phẩm hoàn chỉnh:
  <strong>xem sản phẩm</strong>, <strong>lọc và mua hàng</strong>, <strong>theo dõi đơn</strong>, và <strong>trò chuyện với AI support</strong>
  mà không cần đọc code trước.
</p>

---

## Mục lục

- [Demo nhanh](#demo-nhanh)
- [Dự án này làm gì](#dự-án-này-làm-gì)
- [Điểm nổi bật](#điểm-nổi-bật)
- [Hình ảnh dự án](#hình-ảnh-dự-án)
- [Luồng trải nghiệm người dùng](#luồng-trải-nghiệm-người-dùng)
- [Kiến trúc tổng thể](#kiến-trúc-tổng-thể)
- [Công nghệ chính](#công-nghệ-chính)
- [Cấu trúc repository](#cấu-trúc-repository)
- [Chạy dự án local](#chạy-dự-án-local)
- [Tài liệu liên quan](#tài-liệu-liên-quan)
- [Thành viên](#thành-viên)

## Demo nhanh

### Mở ngay bản production

- Storefront: [https://milkybloom-frontend.onrender.com/](https://milkybloom-frontend.onrender.com/)
- Repo: [https://github.com/QuangVoAI/MilkyBloomVibeCode](https://github.com/QuangVoAI/MilkyBloomVibeCode)

### QR mở nhanh trên điện thoại

<p align="center">
  <a href="https://milkybloom-frontend.onrender.com/" target="_blank" rel="noreferrer">
    <img
      src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=https%3A%2F%2Fmilkybloom-frontend.onrender.com%2F"
      alt="MilkyBloom live demo QR"
      width="220"
      height="220"
    />
  </a>
</p>

### Nên xem gì đầu tiên

1. Mở `Home` để xem giao diện tổng thể và tinh thần thương hiệu.
2. Vào `Shop` để xem danh mục sản phẩm, filter, sort và product cards.
3. Mở `MilkyBloom Assistant` để hỏi về sản phẩm, đơn hàng, đổi trả hoặc vận chuyển.
4. Đăng ký hoặc đăng nhập để test giỏ hàng, checkout và `Order History`.
5. Nếu muốn xem phần quản trị, vào `Admin` để thấy dashboard, users, products, orders và discount codes.

## Dự án này làm gì

MilkyBloom được thiết kế như một storefront nhẹ nhàng, dễ dùng và có cảm giác hiện đại trên cả desktop lẫn mobile. Phần AI không chỉ là chatbot trả lời FAQ, mà đóng vai trò như một lớp hỗ trợ khách hàng thông minh:

- hiểu câu hỏi theo ngữ cảnh
- gợi ý sản phẩm phù hợp
- hỗ trợ tra cứu đơn hàng
- giải thích chính sách giao hàng, đổi trả
- phản hồi theo hướng tự nhiên, lịch sự và đồng cảm hơn với người dùng

Nói ngắn gọn, đây là một dự án kết hợp giữa:

- **e-commerce experience**
- **real-time AI support**
- **triển khai full-stack thực tế**

## Điểm nổi bật

| Mảng | Giá trị mang lại |
|---|---|
| Storefront | Giao diện mua sắm rõ ràng, pastel, trực quan và dễ thao tác |
| Catalog | Danh mục sản phẩm, lọc theo nhu cầu, sort và tìm kiếm nhanh |
| Ordering | Giỏ hàng, checkout, order history và theo dõi trạng thái đơn |
| AI Support | Trợ lý AI hỗ trợ sản phẩm, vận chuyển, đổi trả, đơn hàng |
| Empathy Layer | Phản hồi tự nhiên và có tính đồng cảm thay vì chỉ trả lời máy móc |
| Admin | Quản trị sản phẩm, người dùng, đơn hàng, discount codes |
| Media | Ảnh và video phục vụ theo luồng deploy thực tế, không chỉ demo local |

## Hình ảnh dự án

### Poster giới thiệu

<p align="center">
  <img src="./X2-Vision_VoteStory_9x16_v2.png" alt="MilkyBloom x EmpathAI vertical poster" width="340" />
</p>

### Toàn cảnh sản phẩm

<p align="center">
  <img src="./VC2026-A-MT03_20260603_153831.png" alt="MilkyBloom x EmpathAI full overview poster" width="860" />
</p>

### Bạn sẽ thấy trong giao diện

- **Storefront:** home, shop, categories, about, contact
- **Shopping flow:** product detail, add to cart, checkout, order history
- **AI assistant:** popup hỗ trợ realtime ngay trên giao diện mua sắm
- **Admin panel:** quản lý dữ liệu và vận hành hệ thống

## Luồng trải nghiệm người dùng

```mermaid
flowchart LR
    A[Người dùng mở MilkyBloom] --> B[Khám phá sản phẩm]
    B --> C[Lọc / tìm kiếm / xem chi tiết]
    C --> D[Thêm vào giỏ hàng]
    D --> E[Đặt hàng và thanh toán]
    E --> F[Theo dõi đơn hàng]
    B --> G[Mở MilkyBloom Assistant]
    G --> H[Hỏi về sản phẩm]
    G --> I[Hỏi về đơn hàng]
    G --> J[Hỏi về vận chuyển / đổi trả]
```

### Ví dụ các tình huống demo tốt

- `Gợi ý cho tôi món đồ dưới 300k`
- `Tôi muốn một món quà dễ thương cho bạn nữ`
- `Đơn hàng của tôi đang ở đâu`
- `Chính sách đổi trả như thế nào`
- `Có mẫu nào hợp để tặng sinh nhật không`

## Kiến trúc tổng thể

MilkyBloom không chỉ là frontend demo, mà là một hệ thống gồm 3 lớp chạy cùng nhau:

```mermaid
flowchart LR
    U[User] --> F[Frontend]
    F --> B[Backend API]
    B --> M[(MongoDB Atlas)]
    B --> A[EmpathAI Service]
    A --> L[LLM Provider]
    A --> B
    B --> F
```

### 1. Frontend

- hiển thị storefront và admin panel
- gọi REST API
- render sản phẩm, đơn hàng, profile, discount codes
- mở chat widget ngay trên giao diện người dùng

### 2. Backend

- xử lý auth, orders, products, categories, users
- quản lý media và dữ liệu nghiệp vụ
- làm cầu nối giữa frontend và EmpathAI

### 3. EmpathAI

- nhận yêu cầu chat
- hiểu ý định người dùng
- tra cứu ngữ cảnh liên quan
- tạo câu trả lời phù hợp
- stream phản hồi về giao diện theo thời gian thực

## Công nghệ chính

| Lớp | Công nghệ |
|---|---|
| Frontend | React, Vite, Tailwind, Radix UI |
| Backend | Node.js, Express |
| Database | MongoDB Atlas, GridFS |
| AI Service | Python, LangGraph |
| Realtime | WebSocket / Socket-based streaming |
| LLM backend | Groq, Featherless-compatible flow |
| Deploy | Render |

## Cấu trúc repository

```text
MilkyBloomVibeCode/
├── frontend/      # Storefront + Admin UI
├── backend/       # REST API, auth, media, order management
├── agentic-ai/    # EmpathAI service and streaming pipeline
├── docs/          # Notes and supporting docs
└── README.md      # Product-facing overview
```

## Chạy dự án local

Mỗi service có file `.env.example` riêng. Copy file mẫu tương ứng và điền biến môi trường cần thiết.

### 1. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend mặc định chạy ở `http://localhost:5173`.

### 2. Backend

```bash
cd backend
npm install
npm run dev
```

Backend mặc định chạy ở `http://localhost:6969`.

### 3. EmpathAI WebSocket service

```bash
cd agentic-ai
python ws_server.py
```

Service AI WebSocket mặc định chạy ở `ws://127.0.0.1:8788`.

### 4. Seed demo catalog

```bash
cd backend
npm run seed:catalog
```

Seed script sẽ:

- tạo dữ liệu mẫu
- nạp catalog demo
- upload media cần thiết
- giúp bạn có một bản demo gần với production

## Tài liệu liên quan

- [Frontend README](./frontend/README.md)
- [EmpathAI README](./agentic-ai/README.md)
- [EmpathAI local run guide](./agentic-ai/README.local.md)

## Thành viên

- `523H0173` - Võ Xuân Quang
- `523H0178` - Hoàng Xuân Thành

---

<p align="center">
  <strong>MilkyBloom x EmpathAI</strong><br />
  Một storefront sưu tầm kết hợp AI support đồng cảm, realtime và dễ demo cho người không cần biết code.
</p>
