# 🌐 SuperLanguage 5.0 - Nền tảng Học Ngôn ngữ Trực tuyến Tích hợp AI Tutor

**SuperLanguage 5.0** là nền tảng hỗ trợ học ngoại ngữ (Tiếng Anh & Tiếng Nhật) thông minh. Hệ thống kết hợp giữa các bài học tương tác truyền thống và phòng luyện giao tiếp trực tiếp với AI (Sử dụng Google Gemini và Deepseek), giúp người dùng nâng cao toàn diện kỹ năng Từ vựng, Ngữ pháp và Giao tiếp/Phát âm theo thời gian thực.

---

## 🛠️ Công nghệ Sử dụng (Tech Stack)

### Frontend
- **Ngôn ngữ & Thư viện:** HTML5, CSS3, TypeScript, Vite, Tailwind CSS
- **Định dạng & UI:** Custom CSS với hiệu ứng Chuyển cảnh (Transitions), Toast Notifications, Progress Bar
- **Lưu trữ & Hosting:** Firebase Hosting
- **APIs Trình duyệt:** MediaRecorder API (Thu âm giọng nói trực tiếp)

### Backend
- **Ngôn ngữ:** Python 3.10+
- **Framework:** FastAPI
- **Xác thực & Bảo mật:** JWT Verification via Supabase Auth
- **Xử lý Audio/STT:** Speech-to-Text Services

### Cơ sở Dữ liệu & AI Services
- **Database:** Supabase (PostgreSQL)
- **AI Engines:**
  - **Google Gemini API:** Phân tích dữ liệu âm thanh, chấm điểm phát âm và ngữ điệu.
  - **Deepseek API:** Đóng vai AI Tutor hội thoại, giải thích ngữ pháp và gợi ý chỉnh sửa câu thoại tự nhiên.

---

## 📂 Cấu trúc Thư mục Dự án

```text
superlanguage-5.0/
├── frontend/                     # Web Client (HTML/CSS/JS -> Firebase Hosting)
│   ├── public/                   # Tài nguyên tĩnh
│   │   ├── favicon.ico
│   │   └── images/               # Logo, banners, hình minh họa
│   ├── css/                      # Stylesheets
│   │   ├── style.css             # Style chung toàn trang
│   │   ├── auth.css              # Style Đăng nhập / Đăng ký
│   │   └── practice.css          # Style phòng luyện nói / Chat AI
│   ├── js/                       # JavaScript xử lý Logic
│   │   ├── config.js             # Biến môi trường (Supabase URL, Backend URL)
│   │   ├── supabase-client.js    # Khởi tạo Supabase Client
│   │   ├── api.js                # Hàm fetch() gọi Backend REST API
│   │   ├── auth.js               # Đăng nhập, đăng ký, quản lý JWT
│   │   ├── audio.js              # Thu âm micro từ trình duyệt (MediaRecorder API)
│   │   └── main.js               # Điều khiển DOM chính
│   ├── index.html                # Trang chủ
│   ├── login.html                # Trang Đăng nhập / Đăng ký
│   ├── practice.html             # Trang luyện tập (Ghi âm / Chat AI)
│   ├── dashboard.html            # Trang cá nhân / Tiến độ học tập
│   ├── firebase.json             # Cấu hình Firebase Hosting
│   └── .firebaserc               # Cấu hình dự án Firebase
│
├── backend/                      # Backend Service (Python / FastAPI)
│   ├── app/
│   │   ├── api/                  # Endpoints REST API
│   │   │   └── v1/
│   │   │       ├── endpoints/
│   │   │       │   ├── auth.py   # Verify Token từ Supabase
│   │   │       │   ├── audio.py  # Nhận file audio & xử lý STT
│   │   │       │   └── chat.py   # Xử lý hội thoại AI Tutor
│   │   │       └── router.py     # Định tuyến API
│   │   ├── core/                 # Cấu hình hệ thống (config.py, security.py)
│   │   ├── services/             # Logic nghiệp vụ AI & Data
│   │   │   ├── ai_service.py     # Gọi Gemini & Deepseek API
│   │   │   └── stt_service.py    # Xử lý nhận diện giọng nói
│   │   └── main.py               # Entry point chính của FastAPI
│   ├── .env                      # Biến môi trường (SECRET, Keys) - DO NOT COMMIT
│   ├── Dockerfile                # File đóng gói backend
│   └── requirements.txt          # Thư viện Python
│
└── supabase/                     # Quản lý Database
    └── migrations/
        └── 20260101_init_db.sql  # SQL khởi tạo bảng (users, practice_logs, ...)
```

---

## 📌 Phân tích Chức năng Chi tiết

### 1. Phân quyền Người dùng (Learner / User)
*   **Tài khoản & Hồ sơ (Auth & Profile):**
    *   Đăng ký, đăng nhập (xác thực thông tin cơ bản).
    *   Xem và cập nhật thông tin cá nhân (Avatar, họ tên, mục tiêu học tập).
    *   Theo dõi điểm số/cấp độ (Level, Streak số ngày học liên tục).
*   **Học tập & Luyện tập (Learning Module):**
    *   **Danh sách khóa học/Bài học:** Xem chủ đề (Từ vựng, Ngữ pháp, Giao tiếp) theo cấp độ (Sơ cấp, Trung cấp...).
    *   **Giao diện bài học đa dạng:** Trắc nghiệm chọn đáp án đúng, điền từ vào chỗ trống, ghép từ/câu tương ứng.
    *   **Hệ thống phản hồi tức thì:** Hiển thị thông báo đúng/sai trực quan kèm hiệu ứng âm thanh/giao diện (Toast Notification).
    *   **Luyện nói & Tương tác AI (AI Speaking & Chatbot Tutor) ⭐:**
        *   *Phòng luyện nói tự do (Free Talk / Roleplay):* Chọn chủ đề (Tiếng Anh / Tiếng Nhật) để trò chuyện 2 chiều với AI.
        *   *Thu âm giọng nói trực tiếp:* Tích hợp MediaRecorder API qua Micro trình duyệt.
        *   *Phản hồi & Chấm điểm thông minh:* Tự động chuyển giọng nói thành văn bản (STT), phân tích ngữ pháp, đánh giá phát âm và gợi ý sửa lỗi theo thời gian thực.
*   **Tiến độ & Kết quả (Progress & Analytics):**
    *   Xem lịch sử bài học đã hoàn thành.
    *   Bảng tổng kết điểm số và tỷ lệ phần trăm hoàn thành khóa học.

### 2. Phân quyền Quản lý (Admin / Content Manager)
*   **Quản lý Bài học & Nội dung (CRUD):**
    *   *Quản lý Chủ đề/Khóa học:* Thêm, sửa, xóa, ẩn/hiện danh mục bài học.
    *   *Quản lý Bộ câu hỏi:* Tạo và chỉnh sửa danh sách câu hỏi trắc nghiệm, điền từ, đáp án cho từng bài học.
*   **Quản lý Người dùng (User Management):**
    *   Xem danh sách học viên đăng ký trên hệ thống.
    *   Tìm kiếm, lọc người dùng theo tên/email/cấp độ.
    *   Khóa/Kích hoạt lại tài khoản học viên.
*   **Thống kê Tổng quan (Dashboard):**
    *   Thống kê tổng số học viên và tổng số bài học hiện có.
    *   Biểu đồ/Bảng tóm tắt số lượt học viên hoàn thành bài học theo tuần/tháng.

---

## 📅 Lộ trình Triển khai 4 Tuần (Scrum Model)

*   **Tuần 1 (Sprint 1 - Thiết kế Hệ thống & Dựng Khung):**
    *   Thiết kế CSDL (Mô hình ERD): Thêm các bảng lưu lịch sử chat/luyện nói của user.
    *   Dựng Wireframe/Mockup giao diện User (`practice.html` cho phần Chat/Thu âm) và Admin.
    *   Khởi tạo dự án (Frontend HTML/JS, Backend Python/FastAPI) và chức năng Đăng ký/Đăng nhập qua Supabase Auth.
*   **Tuần 2 (Sprint 2 - Phát triển Chức năng Lõi & Xử lý AI):**
    *   *Frontend User:* Dựng giao diện bài tập (Trắc nghiệm, Điền từ) và `practice.html` (Nút ghi âm, khung chat AI).
    *   *Backend & AI Services:* Dựng API nhận file audio (`audio.py`), tích hợp SDK Gemini & Deepseek vào `ai_service.py` để sinh phản hồi, dịch câu và sửa lỗi ngữ pháp Anh/Nhật.
    *   *Admin:* Dựng Admin Dashboard và Form CRUD bài học, câu hỏi cơ bản.
*   **Tuần 3 (Sprint 3 - Tích hợp, Tối ưu Trải nghiệm & Kiểm thử):**
    *   *Tích hợp AI Speaking:* Hoàn thiện luồng bấm ghi âm ở `practice.js` -> gửi FastAPI -> nhận kết quả từ AI và hiển thị trên giao diện.
    *   *Tối ưu UX:* Tích hợp Progress Bar, Toast Notification, hiệu ứng chuyển cảnh.
*   **Tuần 4 (Sprint 4 - Kiểm thử & Hoàn thiện Báo cáo):**
    *   *Testing & Bug fixing:* Kiểm thử toàn bộ luồng từ Học viên đến Admin.
    *   Chuẩn bị Slide demo và tài liệu báo cáo đồ án.

---

## 🚀 Hướng dẫn Cài đặt và Chạy cục bộ (Local Setup)

### 1. Yêu cầu Hệ thống
- Python 3.10 trở lên
- Node.js (nếu dùng npm quản lý các gói frontend/firebase tools)

### 2. Thiết lập Backend (FastAPI + Supabase Auth)
Tại thư mục gốc dự án, mở terminal thứ nhất:
```powershell
cd Backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Điền `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` và `SUPABASE_JWKS_URL` trong `Backend/.env`. Không đưa `SUPABASE_SECRET_KEY` vào frontend hoặc Git. Khởi tạo tài khoản admin:
```powershell
python scripts/create_admin.py --email admin@example.com --name "Admin"
uvicorn app.main:app --reload --port 8000
```

### 3. Thiết lập Frontend (TypeScript + Vite)
Mở terminal thứ hai tại thư mục gốc:
```powershell
cd Frontend
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Mở URL được Vite hiển thị trong terminal. `Frontend/.env` chỉ cần `VITE_API_BASE_URL=http://127.0.0.1:8000`. Đăng nhập qua `/api/v1/auth/admin/login`; backend xác thực bằng Supabase Auth và chỉ cấp session cho tài khoản có `role=admin`. Không mở HTML trực tiếp hoặc dùng Live Server: TypeScript cần được Vite phục vụ.

---

## 🤝 Quy tắc Làm việc Nhóm (Team Workflow & Rules)

1. **Tuyệt đối không tự ý sửa file của thành viên khác:** Mỗi người đảm nhận phân vùng công việc cụ thể trên nhánh riêng.
2. **Quyền sở hữu code:** Ai tạo file nào thì người đó chịu trách nhiệm bảo trì và sửa lỗi file đó. Trường hợp cần sửa file của nhau phải thảo luận trực tiếp trước.
3. **Quy trình Pull Request (PR):**
   - Không push trực tiếp lên nhánh `main`.
   - Tạo PR mới và thông báo cho **Product Owner (PO)** hoặc **Scrum Master (SM)** để review trước khi Merge.
4. **Bảo mật:** Không commit file `.env` lên GitHub dưới mọi hình thức.