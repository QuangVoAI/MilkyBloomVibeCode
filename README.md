# MilkyBloom x EmpathAI

MilkyBloom là ứng dụng thương mại điện tử đồ chơi trẻ em, và EmpathAI là lớp CSKH agentic được tích hợp vào bên trong để xử lý chat thấu cảm, tra cứu đơn hàng, và thực thi các hành động như đổi địa chỉ, hủy đơn, hoàn tiền, hoặc đổi trả.

## Tích Hợp Nhanh

- `frontend/` là giao diện người dùng
- `backend/` là API trung tâm cho sản phẩm, đơn hàng, auth, và điều phối chat
- `agentic-ai/` là dịch vụ CSKH agentic chạy riêng, xử lý streaming token qua WebSocket

Luồng chat hiện tại là **streaming only**:

`Frontend -> Backend -> WebSocket -> EmpathAI -> Stream token về UI`

## Kiến Trúc

### MilkyBloom

- Hiển thị sản phẩm, giỏ hàng, thanh toán, tài khoản, đơn hàng
- Lưu dữ liệu vào MongoDB Atlas
- Gọi EmpathAI khi người dùng mở chat support

### EmpathAI

- Router intent bằng embedding
- Tra cứu đơn hàng và chính sách
- Thực thi action khi phù hợp
- Viết phản hồi thấu cảm bằng LLM qua Featherless
- Stream token realtime về UI

## Chat Flow

Chat UI của MilkyBloom hiện chỉ dùng streaming:

1. Người dùng gửi tin nhắn từ frontend
2. Backend nhận yêu cầu chat và đẩy qua WebSocket
3. EmpathAI xử lý pipeline agentic
4. Token được stream về UI từng phần

Các endpoint HTTP chat cũ đã bị khóa cho public use và chỉ còn tồn tại như internal diagnostics.

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

### 2b. Seed Demo Catalog

Để có dữ liệu mẫu và ảnh demo ngay sau khi clone, chạy script seed catalog:

```bash
cd backend
npm run seed:catalog
```

Script này sẽ:
- tạo catalog demo trong MongoDB
- lưu ảnh demo trực tiếp trong MongoDB GridFS, frontend đọc qua URL stream của backend
- demo vẫn có ảnh mà không cần file local
- dùng file nguồn chuẩn ở `backend/data/popmart-products.json`
- với Pop Mart seed, ảnh nguồn được tải vào GridFS rồi phục vụ từ backend, không phụ thuộc CDN ngoài

Nếu bạn đã có dữ liệu cũ trỏ về `/seed-images/...`, chạy thêm migration này một lần:

```bash
cd backend
npm run migrate:seed-images
```

Script migrate sẽ:
- quét `categories`, `products`, `variants`, `reviews`, `comments`
- đổi URL local cũ sang URL stream được phục vụ từ MongoDB GridFS

### 3. EmpathAI

Khuyến nghị dùng Conda env `deeplearning`:

```bash
cd agentic-ai
conda activate deeplearning
./run_agentic.sh
```

Hoặc chạy thủ công:

```bash
cd agentic-ai
python server.py
python ws_server.py
```

## Môi Trường EmpathAI

Nếu clone sang máy khác:

```bash
cd agentic-ai
conda env create -f environment.yml
conda activate deeplearning
./run_agentic.sh
```

## Cấu Hình Quan Trọng

### Backend

- Backend local mặc định chạy trên `http://localhost:6969`
- `MONGO_URI` trỏ tới MongoDB Atlas đã deploy
- `CHAT_PROVIDER=agentic`
- `AGENTIC_AI_WS_URL=ws://127.0.0.1:8788`
- Ảnh sản phẩm, biến thể, category, review, comment, avatar đều được lưu dưới dạng URL stream từ MongoDB GridFS, không cần dịch vụ lưu ảnh ngoài

### EmpathAI

- `FEATHERLESS_API_KEY`
- `FEATHERLESS_BASE_URL=https://api.featherless.ai/v1`
- `EMPATHY_MODE=featherless`

## Tài Liệu Chi Tiết

- [MilkyBloom frontend docs](frontend/README.md)
- [EmpathAI subsystem docs](agentic-ai/README.md)
- [EmpathAI local run guide](agentic-ai/README.local.md)

## Ghi Chú

- Chat UI hiện là **streaming only**
- `GET /providers` chỉ còn là snapshot nội bộ cho monitoring/debug
- `POST /chat/message`, `POST /chat/agentic`, `POST /chat/gemini` đã bị khóa cho public use
