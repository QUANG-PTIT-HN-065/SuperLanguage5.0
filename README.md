## I. ĐẶC TẢ CÁC CHỨC NĂNG MODULE PHỤ TRÁCH

### **Module: Luyện nói & Tương tác AI (AI Speaking & Chatbot Tutor)**

*(Thuộc các Task 11, 12, 13 trong Kế hoạch Sprint)*

#### **1. Phòng luyện nói tự do (Free Talk / Roleplay)**

* **Mô tả:** Cung cấp giao diện tương tác hai chiều cho phép học viên lựa chọn chủ đề hội thoại và ngôn ngữ luyện tập (Tiếng Anh hoặc Tiếng Nhật). Hệ thống tích hợp các mô hình ngôn ngữ lớn (Gemini / Deepseek) để đóng vai phản hồi tự nhiên theo đúng ngữ cảnh.
* **Đầu vào:** Lựa chọn chủ đề, ngôn ngữ, nội dung tin nhắn thoại hoặc văn bản.
* **Đầu ra:** Câu phản hồi từ AI bằng văn bản và âm thanh ngữ cảnh.

#### **2. Thu âm giọng nói trực tiếp (MediaRecorder API)**

* **Mô tả:** Tích hợp`MediaRecorder API`ngay trên trình duyệt để ghi âm giọng nói của học viên thông qua Microphone thiết bị. Cung cấp bộ đếm thời gian, nút bấm điều khiển (Bắt đầu / Tạm dừng / Gửi) và sóng âm tương tác trực quan (Wave Visualizer).
* **Đầu vào:** Luồng âm thanh từ Micro.
* **Đầu ra:** File âm thanh đệm (Audio Blob / WebM/MP3) để chuyển tới bộ xử lý.

#### **3. Chấm điểm phát âm & Phản hồi AI theo thời gian thực**

* **Mô tả:** Chuyển đổi dữ liệu âm thanh thành văn bản (Speech-to-Text), gửi bản ký âm cùng ngữ cảnh hội thoại sang AI để phân tích lỗi sai phát âm, bóc tách cấu trúc ngữ pháp và đưa ra nhận xét, gợi ý sửa câu cùng thang điểm đánh giá.
* **Đầu vào:** File ghi âm giọng nói người dùng.
* **Đầu ra:** Bản ghi transcript, điểm số phát âm/ngữ pháp (scale 0-100), gợi ý cải thiện chi tiết.

## II. THIẾT KẾ BẢNG DỮ LIỆU CỦA MODULE & GHÉP VÀO ERD CHUNG

### **Các bảng thuộc Module AI Speaking & Chatbot**

#### **Bảng `conversations` (Phiên hội thoại AI)**

**Quản lý các phòng luyện nói / chuỗi hội thoại giữa học viên và AI.**

* `id`(INT, Primary Key, Auto Increment): Mã định danh phiên hội thoại.
* `user_id`(INT, Foreign Key -> `<span class="selected">users.id</span>`, NOT NULL): Học viên tham gia hội thoại.
* `title` (VARCHAR(255), NOT NULL): Chủ đề luyện nói (ví dụ:  *Order Coffee at Starbucks* **).**
* `language` (VARCHAR(50), NOT NULL): Ngôn ngữ luyện tập `(English` /`Japanese`).
* `created_at` (TIMESTAMP, Default:`CURRENT_TIMESTAMP`): Thời gian khởi tạo.

#### **Bảng `messages` (Chi tiết tin nhắn & Ghi âm/Chấm điểm AI)**

**Lưu vết từng lượt trao đổi tin nhắn, file âm thanh và phản hồi từ AI.**

* `id` (INT, Primary Key, Auto Increment): Mã định danh tin nhắn.
* `conversation_id` (INT, Foreign Key -> `conversations.id`, NOT NULL): Thuộc phiên hội thoại nào.
* `sender_type` (ENUM('user', 'ai'), NOT NULL): Người gửi tin nhắn.
* `content` (TEXT, NULLABLE): Văn bản tin nhắn hoặc bản ký âm Speech-to-Text.
* `audio_url` (VARCHAR(500), NULLABLE): Đường dẫn tới file ghi âm người dùng/âm thanh AI.
* `ai_feedback` (TEXT, NULLABLE): Đánh giá lỗi ngữ pháp, phát âm và gợi ý hiệu chỉnh từ AI.
* `score` (FLOAT, NULLABLE): Thang điểm đánh giá (0 - 100).
* `created_at` (TIMESTAMP, Default: `CURRENT_TIMESTAMP`): Thời điểm gửi.
