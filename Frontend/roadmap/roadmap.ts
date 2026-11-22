/**
 * Slanguage - Dungeon Skill Tree Roadmap TypeScript Logic
 * Renders an immersive, branching RPG-style dungeon learning roadmap.
 * Features:
 * - Winding labyrinth paths (đường đi ngoằn ngoèo)
 * - 3 Difficulty branches per topic (Dễ: Light Green, Bình thường: Light Yellow, Khó: Light Red Crimson)
 * - Rewards & Penalties (Dễ: +5 XP / -1 Máu, Vừa: +10 XP / -2 Máu, Khó: +15 XP / -3 Máu)
 * - Dungeon Theme: Ash Gray (#373D43), Jet Black (#080A0C), Moss Green (#13261B)
 * - Dynamic Hearts (Máu) & XP management with battle trials and instant healing
 */

type DungeonDifficulty = 'easy' | 'normal' | 'hard';

interface DungeonTrial {
  prompt: string;
  choices: string[];
  answerIdx: number;
  explanation: string;
}

interface DungeonReadingSection {
  heading: string;
  icon?: string;
  text: string;
  callout?: string;
}

interface DungeonReadingArticle {
  title: string;
  lead: string;
  sections: DungeonReadingSection[];
  keyTakeaway: string;
}

interface DungeonNode {
  id: string;
  stage: number; // 1 to 5
  stageName: string;
  isHub: boolean;
  difficulty?: DungeonDifficulty;
  title: string;
  desc: string;
  icon: string;
  xpReward: number; // 0 for Hub, 5, 10, 15 for branches
  heartPenalty: number; // 0 for Hub, 1, 2, 3 for branches
  status: 'mastered' | 'current' | 'available' | 'locked';
  parents: string[];
  objectives: string[];
  preview: string;
  trial: DungeonTrial;
  trials?: DungeonTrial[];
  readingArticle?: DungeonReadingArticle;
}

interface LanguageDungeon {
  id: 'ja' | 'en' | 'vi';
  name: string;
  dungeonTitle: string;
  dungeonSubtitle: string;
  nodes: DungeonNode[];
}

// Complete Dungeon Database for 3 Languages
const dungeonDB: Record<string, LanguageDungeon> = {
  ja: {
    id: 'ja',
    name: 'Tiếng Nhật',
    dungeonTitle: 'Mê Cung Thử Thách: Tiếng Nhật Sơ Cấp (JLPT N5)',
    dungeonSubtitle: 'Vượt qua 5 ải hầm ngục tri thức. Mỗi cột mốc là một chủ đề phân nhánh 3 ngả Dễ, Vừa, Khó với phần thưởng XP và sinh mệnh tương ứng.',
    nodes: [
      // ================= STAGE 1: CỔNG NHẬP MÔN & NGỮ ÂM KANA =================
      {
        id: 'ja_s1_hub',
        stage: 1,
        stageName: 'MỐC CHỦ ĐỀ 1: CỔNG NHẬP MÔN & NGỮ ÂM KANA',
        isHub: true,
        title: 'Cổng Khởi Nguyên: Ngữ Âm & Chữ Cái',
        desc: 'Trạm trung chuyển mốc 1',
        icon: 'fa-solid fa-dungeon',
        xpReward: 0,
        heartPenalty: 0,
        status: 'mastered',
        readingArticle: {
        "title": "Cổng Khởi Nguyên: Hệ Thống Ngữ Âm & 2 Bảng Chữ Cái Kana",
        "lead": "Chào mừng bạn bước vào thế giới tiếng Nhật! Trước khi bước vào các ngả đường thử thách độ khó, hãy cùng khám phá bức tranh toàn cảnh về cách người Nhật kết hợp 2 bảng chữ cái Kana và 5 nguyên âm cốt lõi.",
        "sections": [
                {
                        "heading": "1. Nguồn Gốc & Sự Ra Đời Của Hiragana & Katakana",
                        "icon": "fa-solid fa-scroll",
                        "text": "Vào thế kỷ thứ 8-9, người Nhật đã sáng tạo ra hai hệ thống chữ biểu âm độc đáo dựa trên việc tinh giản các nét từ chữ Hán cổ (Man'yogana).\\n• Hiragana (chữ mềm): Mang nét viết mềm mại, uốn lượn uyển chuyển, vốn được các nữ sĩ quý tộc cung đình sử dụng để sáng tác văn chương, thơ waka và nhật ký.\\n• Katakana (chữ cứng): Được các tăng lữ Phật giáo phát triển bằng các nét thẳng, sắc nhọn dứt khoát để ghi chú nhanh bài giảng kinh viện."
                },
                {
                        "heading": "2. Phân Chia Nhiệm Vụ Trong Thực Tế",
                        "icon": "fa-solid fa-layer-group",
                        "text": "Trong văn bản tiếng Nhật hiện đại ngày nay:\\n• Hiragana: Dùng để ghi các từ thuần Nhật (Yamato-kotoba), hệ thống trợ từ ngữ pháp (は, が, を, に...) và đuôi biến đổi của động từ/tính từ (Okurigana).\\n• Katakana: Chuyên dùng để phiên âm các từ mượn tiếng nước ngoài (Gairaigo) như コーヒー (cà phê), カメラ (máy ảnh), tên riêng người nước ngoài, hoặc tạo hiệu ứng nhấn mạnh trong truyện tranh Manga.",
                        "callout": "Mẹo học nhanh: Khi gặp một từ toàn chữ Katakana, hãy thử đọc to phát âm theo âm tiếng Anh, bạn sẽ đoán được nghĩa của từ đến hơn 80%!"
                },
                {
                        "heading": "3. 5 Nguyên Âm Vàng Cốt Lõi: A - I - U - E - O",
                        "icon": "fa-solid fa-volume-high",
                        "text": "Toàn bộ hệ thống phát âm tiếng Nhật được xây dựng từ 5 nguyên âm chính:\\n• あ (a): Mở miệng vừa phải, âm thanh vang tự nhiên như âm 'a'.\\n• い (i): Cười mỉm nhẹ, phát âm gọn ghẽ như 'i'.\\n• う (u): Môi khép hờ, không chu tròn môi mà âm thanh nằm giữa 'u' và 'ư'.\\n• え (e): Mở miệng ngang, đọc dứt khoát như 'e'.\\n• お (o): Tròn môi vừa phải, âm phát ra chắc khỏe như 'ô'."
                }
        ],
        "keyTakeaway": "Làm chủ 2 bảng chữ cái Kana và 5 nguyên âm chính là nền móng vững chắc giúp bạn đọc được mọi biển báo, thực đơn và sách truyện tại Nhật Bản!"
},
        parents: [],
        objectives: [
          'Nắm tổng quan bảng 46 ký tự Hiragana và Katakana',
          'Lựa chọn nhánh độ khó phù hợp với khả năng của bạn'
        ],
        preview: 'Khai mở hành trình thám hiểm Dungeon tiếng Nhật.',
        trial: {
          prompt: 'Ký tự nào sau đây là nguyên âm "A" trong bảng Hiragana?',
          choices: ['あ', 'い', 'う'],
          answerIdx: 0,
          explanation: 'Chính xác! "あ" là chữ a trong Hiragana, phát âm rõ ràng khẩu hình tự nhiên.'
        }
      },
      {
        id: 'ja_s1_easy',
        stage: 1,
        stageName: 'MỐC CHỦ ĐỀ 1: CỔNG NHẬP MÔN & NGỮ ÂM KANA',
        isHub: false,
        difficulty: 'easy',
        title: 'Nhận Diện 10 Nguyên Âm Cơ Bản',
        desc: 'Âm thanh thuần túy & nét chữ căn bản',
        icon: 'fa-solid fa-feather-pointed',
        xpReward: 5,
        heartPenalty: 1,
        status: 'mastered',
        parents: ['ja_s1_hub'],
        objectives: [
          'Thuộc 5 nguyên âm chính: a, i, u, e, o (Hiragana & Katakana)',
          'Nhận biết mặt chữ trong 3 giây'
        ],
        preview: 'あ (a) • い (i) • う (u) • え (e) • お (o)',
        trial: {
          prompt: 'Từ "あい" (ai) trong tiếng Nhật có nghĩa là gì?',
          choices: ['Tình yêu', 'Màu xanh', 'Cái bàn'],
          answerIdx: 0,
          explanation: 'Tuyệt vời! "あい" (Ai) mang ý nghĩa là Tình Yêu.'
        }
      },
      {
        id: 'ja_s1_normal',
        stage: 1,
        stageName: 'MỐC CHỦ ĐỀ 1: CỔNG NHẬP MÔN & NGỮ ÂM KANA',
        isHub: false,
        difficulty: 'normal',
        title: 'Quy Tắc Biến Âm Tenten & Maru',
        desc: 'Hóa giải biến âm đục & bán đục',
        icon: 'fa-solid fa-wand-magic-sparkles',
        xpReward: 10,
        heartPenalty: 2,
        status: 'available',
        parents: ['ja_s1_hub'],
        objectives: [
          'Chuyển đổi âm đục hàng Ka -> Ga, Sa -> Za, Ta -> Da, Ha -> Ba/Pa',
          'Đọc chuẩn các danh từ có biến âm thường ngày'
        ],
        preview: 'か (ka) -> が (ga) • は (ha) -> ば (ba) -> ぱ (pa)',
        trial: {
          prompt: 'Khi thêm dấu Ten-ten ( ゛) vào chữ "か" (ka), chữ sẽ biến thành âm gì?',
          choices: ['が (ga)', 'ば (ba)', 'ざ (za)'],
          answerIdx: 0,
          explanation: 'Chính xác! "か" thêm dấu tenten thành "が" (ga).'
        }
      },
      {
        id: 'ja_s1_hard',
        stage: 1,
        stageName: 'MỐC CHỦ ĐỀ 1: CỔNG NHẬP MÔN & NGỮ ÂM KANA',
        isHub: false,
        difficulty: 'hard',
        title: 'Thử Thách Trường Âm & Âm Ngắt',
        desc: 'Bẫy tốc độ phản xạ âm thanh',
        icon: 'fa-solid fa-skull',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['ja_s1_hub'],
        objectives: [
          'Phân biệt trường âm おばさん (cô) vs おばあさん (bà)',
          'Xử lý âm ngắt nhỏ っ (Sokuon) dứt khoát chuẩn bản ngữ'
        ],
        preview: 'きって (kitte - con tem) vs きて (kite - hãy đến)',
        trial: {
          prompt: 'Từ nào mang nghĩa là "Bà" (người bà trong gia đình)?',
          choices: ['おばあさん (obaasan)', 'おばさん (obasan)', 'おじさん (ojisan)'],
          answerIdx: 0,
          explanation: 'Rất sắc bén! "おばあさん" có trường âm mang nghĩa người bà, còn "おばさん" là người cô/dì.'
        }
      },

      // ================= STAGE 2: ĐIỆN THỜ HÁN TỰ & TRỢ TỪ CỐT LÕI =================
      {
        id: 'ja_s2_hub',
        stage: 2,
        stageName: 'MỐC CHỦ ĐỀ 2: ĐIỆN THỜ HÁN TỰ & TRỢ TỪ CỐT LÕI',
        isHub: true,
        title: 'Điện Thờ Cổ Tự: Kanji & Cấu Trúc Câu',
        desc: 'Trạm trung chuyển mốc 2',
        icon: 'fa-solid fa-monument',
        xpReward: 0,
        heartPenalty: 0,
        status: 'available',
        readingArticle: {
        "title": "Điện Thờ Cổ Tự: Thế Giới Hán Tự (Kanji) & Khung Ngữ Pháp SOV",
        "lead": "Kanji không phải là một bức tường cản trở, mà chính là chiếc kính lúp giúp bạn nắm bắt tức thì ý nghĩa của từ ngữ mà không cần phải đọc từng âm tiết rời rạc.",
        "sections": [
                {
                        "heading": "1. Bản Chất Chữ Hán (Kanji): Chữ Tượng Hình Biểu Ý",
                        "icon": "fa-solid fa-monument",
                        "text": "Khác với chữ Latinh chỉ ghi âm, Kanji mang trực tiếp hình tượng và ý niệm của sự vật:\\n• Chữ 木 (ki) là một cái cây, ghép hai cái cây 林 (hayashi) là rừng thưa, và ba cái cây 森 (mori) là rừng rậm sum sê.\\n• Ở trình độ sơ cấp N5, bạn chỉ cần làm quen với khoảng 100 - 150 Hán tự quen thuộc nhất biểu thị số đếm, thời gian, con người và thiên nhiên."
                },
                {
                        "heading": "2. Bí Quyết Phân Biệt Âm On (Onyomi) & Âm Kun (Kunyomi)",
                        "icon": "fa-solid fa-yin-yang",
                        "text": "• Âm On: Là âm phỏng theo tiếng Hán cổ khi du nhập sang Nhật, thường dùng khi ghép 2 hoặc nhiều chữ Hán lại thành một từ mới (Ví dụ: 日本 = Ni-hon = Nhật Bản, 学生 = Gakusei = Học sinh).\\n• Âm Kun: Là cách đọc theo âm thuần Nhật khi chữ Hán đứng độc lập một mình hoặc có đuôi Hiragana kèm theo (Ví dụ: 水 = mizu = nước, 食べる = taberu = ăn)."
                },
                {
                        "heading": "3. Trật Tự Câu SOV & Sức Mạnh Của Trợ Từ",
                        "icon": "fa-solid fa-network-wired",
                        "text": "Trong khi tiếng Việt nói 'Tôi ăn cơm' (Chủ - Động - Tân), tiếng Nhật lại nói 'Tôi cơm ăn' (Chủ - Tân - Động - SOV). Động từ luôn luôn nằm ở cuối câu! Mối quan hệ giữa các thành phần được quyết định bởi trợ từ:\\n• は (wa): Đưa từ đứng trước thành chủ đề chính của câu chuyện.\\n• を (o): Đánh dấu món đồ trực tiếp chịu tác động của hành động.\\n• に (ni): Chỉ đích đến hoặc mốc thời gian cụ thể diễn ra hành động."
                }
        ],
        "keyTakeaway": "Khi nắm chắc trật tự SOV và ma trận 4 trợ từ then chốt, bạn đã định hình được bộ khung xương vững chắc cho mọi câu văn tiếng Nhật!"
},
        parents: ['ja_s1_easy', 'ja_s1_normal', 'ja_s1_hard'],
        objectives: [
          'Khai phá 50 Hán tự cơ bản nhất',
          'Nắm chắc 4 trợ từ trọng điểm: wa, ga, o, ni'
        ],
        preview: 'Trạm trung chuyển nối liền các nhánh ngữ pháp then chốt.',
        trial: {
          prompt: 'Chữ Hán "日" có âm Hán Việt là gì?',
          choices: ['Nhật (Mặt trời/Ngày)', 'Nguyệt (Mặt trăng)', 'Thủy (Nước)'],
          answerIdx: 0,
          explanation: 'Chính xác! "日" là chữ Nhật (mặt trời, ngày).'
        }
      },
      {
        id: 'ja_s2_easy',
        stage: 2,
        stageName: 'MỐC CHỦ ĐỀ 2: ĐIỆN THỜ HÁN TỰ & TRỢ TỪ CỐT LÕI',
        isHub: false,
        difficulty: 'easy',
        title: '20 Kanji Số Đếm & Tự Nhiên',
        desc: 'Nhất, Nhị, Tam, Nhật, Nguyệt, Mộc, Thủy',
        icon: 'fa-solid fa-seedling',
        xpReward: 5,
        heartPenalty: 1,
        status: 'locked',
        parents: ['ja_s2_hub'],
        objectives: [
          'Ghi nhớ mặt chữ 20 chữ Hán thường gặp nhất',
          'Ghép số đếm từ 1 đến 100'
        ],
        preview: '一 (ichi), 二 (ni), 三 (san), 木 (ki), 水 (mizu)',
        trial: {
          prompt: 'Chữ Hán nào sau đây là số 3 (Tam)?',
          choices: ['三', '二', '五'],
          answerIdx: 0,
          explanation: 'Chính xác! "三" tượng hình 3 gạch ngang là số 3.'
        }
      },
      {
        id: 'ja_s2_normal',
        stage: 2,
        stageName: 'MỐC CHỦ ĐỀ 2: ĐIỆN THỜ HÁN TỰ & TRỢ TỪ CỐT LÕI',
        isHub: false,
        difficulty: 'normal',
        title: 'Trợ Từ Nền Tảng: は, が, を, に',
        desc: 'Định hình xương sống của câu văn',
        icon: 'fa-solid fa-shield-halved',
        xpReward: 10,
        heartPenalty: 2,
        status: 'locked',
        parents: ['ja_s2_hub'],
        objectives: [
          'Làm chủ mẫu câu: A は B です (A là B)',
          'Dùng を cho tân ngữ tác động, に cho đích đến/thời gian'
        ],
        preview: 'わたしはベトナム人です (Watashi wa Betonamu-jin desu)',
        trial: {
          prompt: 'Điền trợ từ thích hợp: ごはん (___) たべます。(Tôi ăn cơm)',
          choices: ['を (o)', 'は (wa)', 'に (ni)'],
          answerIdx: 0,
          explanation: 'Đúng rồi! Trợ từ "を" đứng sau tân ngữ chịu tác động của hành động ăn (たべます).'
        }
      },
      {
        id: 'ja_s2_hard',
        stage: 2,
        stageName: 'MỐC CHỦ ĐỀ 2: ĐIỆN THỜ HÁN TỰ & TRỢ TỪ CỐT LÕI',
        isHub: false,
        difficulty: 'hard',
        title: 'Mê Cung Bẫy Trợ Từ は vs が',
        desc: 'Khắc phục nhầm lẫn kinh điển trong JLPT',
        icon: 'fa-solid fa-fire-flame-curved',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['ja_s2_hub'],
        objectives: [
          'Phân biệt chủ ngữ đề tài (は) và chủ ngữ phát hiện mới (が)',
          'Giải quyết câu đố phức tạp trong các câu ghép N5'
        ],
        preview: '雨が降っています (Trời đang mưa - Hiện tượng tự nhiên dùng が)',
        trial: {
          prompt: 'Trong câu chỉ sở thích: "わたしは りんご (___) すきです", trợ từ nào chuẩn?',
          choices: ['が (ga)', 'を (o)', 'で (de)'],
          answerIdx: 0,
          explanation: 'Xuất sắc! Với tính từ chỉ cảm xúc, sở thích (すき, きらい), bổ ngữ luôn đi cùng trợ từ "が".'
        }
      },

      // ================= STAGE 3: MÊ CUNG ĐÀM THOẠI THỰC ĐỊA =================
      {
        id: 'ja_s3_hub',
        stage: 3,
        stageName: 'MỐC CHỦ ĐỀ 3: MÊ CUNG ĐÀM THOẠI THỰC ĐỊA',
        isHub: true,
        title: 'Quảng Trường Mua Sắm & Đời Sống Tokyo',
        desc: 'Trạm trung chuyển mốc 3',
        icon: 'fa-solid fa-store',
        xpReward: 0,
        heartPenalty: 0,
        status: 'locked',
        readingArticle: {
        "title": "Quảng Trường Đời Sống: Giao Tiếp Thực Chiến & Văn Hóa Đàm Thoại Tokyo",
        "lead": "Học một ngôn ngữ là bước vào một nền văn hóa. Giao tiếp tiếng Nhật đề cao sự tinh tế, lịch thiệp và thấu hiểu lẫn nhau giữa con người với con người.",
        "sections": [
                {
                        "heading": "1. Cụm Từ 'Bảo Bối' Toàn Năng: Sumimasen (すみません)",
                        "icon": "fa-solid fa-comments",
                        "text": "Nếu chỉ được học một từ duy nhất khi đặt chân đến nước Nhật, từ đó chắc chắn là 'Sumimasen'. Người Nhật dùng từ này trong 3 tình huống then chốt:\\n1. Xin lỗi lịch sự: Khi vô tình va quẹt hoặc muốn xin nhường đường nơi đông người.\\n2. Cảm ơn sâu sắc: Khi ai đó làm điều tốt giúp bạn và bạn thấy áy náy làm phiền họ.\\n3. Xin phép: Khi giơ tay gọi nhân viên phục vụ trong nhà hàng hoặc xin phép vào phòng."
                },
                {
                        "heading": "2. Lễ Nghi Chào Hỏi Chuẩn Mực Theo Thời Gian",
                        "icon": "fa-solid fa-handshake",
                        "text": "• Sáng sớm: おはようございます (Ohayō gozaimasu) - Lời chào trang trọng khởi đầu ngày mới.\\n• Ban ngày: こんにちは (Konnichiwa) - Lời chào thân thiện phổ biến nhất.\\n• Chiều tối: こんばんは (Konbanwa) - Dùng khi gặp nhau sau khi hoàng hôn buông xuống.\\n• Trước bữa ăn: いただきます (Itadakimasu) - Thể hiện lòng biết ơn sâu sắc đối với thức ăn và công sức người chế biến."
                },
                {
                        "heading": "3. Trải Nghiệm Thực Tế Tại Konbini (Cửa Hàng Tiện Lợi)",
                        "icon": "fa-solid fa-store",
                        "text": "Khi ghé cửa hàng tiện lợi như 7-Eleven, Lawson hay FamilyMart, thu ngân thường hỏi:\\n• 「袋はご利用ですか？」(Fukuro wa go-riyō desu ka? = Quý khách có dùng túi nilon không?) -> Trả lời: 「大丈夫です」(Daijōbu desu = Không cần đâu ạ).\\n• 「温めますか？」(Atatamemasu ka? = Có cần hâm nóng đồ ăn không?) -> Trả lời: 「お願いします」(Onegaishimasu = Vâng xin làm nóng giúp)."
                }
        ],
        "keyTakeaway": "Giao tiếp đàm thoại không chỉ nằm ở số lượng từ vựng, mà chính là thái độ tôn trọng và sự tinh tế trong cách ứng xử!"
},
        parents: ['ja_s2_easy', 'ja_s2_normal', 'ja_s2_hard'],
        objectives: [
          'Học phản xạ giao tiếp quán ăn, cửa hàng tiện lợi Konbini',
          'Sẵn sàng cho các tình huống hỏi đường thực tế'
        ],
        preview: 'Thực chiến đời sống văn hóa Nhật Bản.',
        trial: {
          prompt: '"Sumimasen" (すみません) thường được dùng trong tình huống nào?',
          choices: ['Xin lỗi / Gọi nhân viên phục vụ', 'Chào tạm biệt', 'Chúc ngủ ngon'],
          answerIdx: 0,
          explanation: 'Chính xác! "Sumimasen" là câu thần chú lịch thiệp dùng để gọi người hoặc xin lỗi.'
        }
      },
      {
        id: 'ja_s3_easy',
        stage: 3,
        stageName: 'MỐC CHỦ ĐỀ 3: MÊ CUNG ĐÀM THOẠI THỰC ĐỊA',
        isHub: false,
        difficulty: 'easy',
        title: 'Gọi Món Nhanh: Kore o kudasai',
        desc: 'Chỉ tay gọi món tự tin tại quán ăn',
        icon: 'fa-solid fa-utensils',
        xpReward: 5,
        heartPenalty: 1,
        status: 'locked',
        parents: ['ja_s3_hub'],
        objectives: [
          'Sử dụng mẫu câu: 「これ を ください」(Cho tôi cái này)',
          'Đếm số lượng bát/ly với ひとつ (1 cái), ふたつ (2 cái)'
        ],
        preview: 'ラーメン を ひとつ ください (Cho tôi 1 bát ramen)',
        trial: {
          prompt: 'Khi muốn nói "Cho tôi xin nước lọc", ta nói thế nào?',
          choices: ['おみず を ください (Omizu o kudasai)', 'おみず は たかい (Omizu wa takai)', 'おみず が いきます (Omizu ga ikimasu)'],
          answerIdx: 0,
          explanation: 'Chuẩn xác! Mẫu câu "Danh từ + を ください" là cách gọi món lịch sự và chuẩn mực.'
        }
      },
      {
        id: 'ja_s3_normal',
        stage: 3,
        stageName: 'MỐC CHỦ ĐỀ 3: MÊ CUNG ĐÀM THOẠI THỰC ĐỊA',
        isHub: false,
        difficulty: 'normal',
        title: 'Hỏi Giá & Mua Vé Tàu Shinkansen',
        desc: 'Xử lý con số hàng vạn yên & tuyến ga',
        icon: 'fa-solid fa-train-subway',
        xpReward: 10,
        heartPenalty: 2,
        status: 'locked',
        parents: ['ja_s3_hub'],
        objectives: [
          'Hỏi giá: 「これは いくら ですか」(Cái này bao nhiêu tiền?)',
          'Nghe hiểu mệnh giá Yên (円) từ 1.000 đến 10.000 yên'
        ],
        preview: 'さんぜんえん です (3,000 yên)',
        trial: {
          prompt: 'Mẫu câu hỏi "Ga Tokyo ở đâu?" nói thế nào?',
          choices: ['東京駅は どこ ですか (Toukyou eki wa doko desu ka)', '東京駅は なに ですか', '東京駅は だれ ですか'],
          answerIdx: 0,
          explanation: 'Rất tốt! "どこ" là từ để hỏi nơi chốn (Ở đâu).'
        }
      },
      {
        id: 'ja_s3_hard',
        stage: 3,
        stageName: 'MỐC CHỦ ĐỀ 3: MÊ CUNG ĐÀM THOẠI THỰC ĐỊA',
        isHub: false,
        difficulty: 'hard',
        title: 'Xử Lý Sự Cố Đổi Trả & Khẩn Cấp',
        desc: 'Đàm thoại thương trường và nhờ trợ giúp',
        icon: 'fa-solid fa-triangle-exclamation',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['ja_s3_hub'],
        objectives: [
          'Trình bày món đồ bị lỗi hoặc nhầm size',
          'Xin hỗ trợ tại đồn cảnh sát Koban khi bị lạc đồ'
        ],
        preview: '財布をなくしてしまいました (Tôi lỡ làm mất ví tiền)',
        trial: {
          prompt: 'Khi muốn nói "Tôi đã để quên hộ chiếu ở khách sạn", mẫu câu nào đúng?',
          choices: ['ホテルに パスポートを わすれました', 'ホテルで パスポートを かいました', 'ホテルへ パスポートを いきました'],
          answerIdx: 0,
          explanation: 'Tuyệt đỉnh! "わすれました" nghĩa là đã để quên, đi cùng trợ từ "に" chỉ địa điểm lưu lại.'
        }
      },

      // ================= STAGE 4: CĂN HẦM THỂ ĐỘNG TỪ =================
      {
        id: 'ja_s4_hub',
        stage: 4,
        stageName: 'MỐC CHỦ ĐỀ 4: CĂN HẦM THỂ ĐỘNG TỪ',
        isHub: true,
        title: 'Phòng Thí Nghiệm Động Từ Biến Hóa',
        desc: 'Trạm trung chuyển mốc 4',
        icon: 'fa-solid fa-flask-vial',
        xpReward: 0,
        heartPenalty: 0,
        status: 'locked',
        readingArticle: {
        "title": "Phòng Biến Hóa: Bí Kíp Động Từ & Sức Mạnh Thần Kỳ Của Thể Te (て形)",
        "lead": "Nếu ví danh từ là những viên gạch thì động từ chính là lớp vữa kết dính và tạo nên chuyển động phong phú cho cả câu chuyện.",
        "sections": [
                {
                        "heading": "1. Phân Nhóm 3 Loại Động Từ Tiếng Nhật",
                        "icon": "fa-solid fa-cubes",
                        "text": "• Nhóm 1 (Godan): Đuôi tận cùng thuộc hàng 'u' (như 書く / kaku = viết, 飲む / nomu = uống, 行く / iku = đi).\\n• Nhóm 2 (Ichidan): Có đuôi 'iru' hoặc 'eru' (như 食べる / taberu = ăn, 見る / miru = xem).\\n• Nhóm 3 (Bất quy tắc): Chỉ gồm đúng 2 động từ đặc biệt là する (suru = làm) và 来る (kuru = đến)."
                },
                {
                        "heading": "2. Thể Te (て形) - Chìa Khóa Vạn Năng Của Ngữ Pháp Sơ Cấp",
                        "icon": "fa-solid fa-wand-magic-sparkles",
                        "text": "Khi làm chủ thể Te, bạn mở khóa được hàng chục mẫu câu giao tiếp tự nhiên:\\n• 〜てください (~te kudasai): Xin hãy làm điều gì đó giúp tôi.\\n• 〜ています (~te imasu): Đang thực hiện một hành động (như đang học bài, trời đang mưa).\\n• 〜てもいいですか (~te mo ii desu ka): Tôi có thể làm việc này được không ạ?\\n• Nối câu: Làm hành động A rồi đến hành động B (V1-te, V2-te, V3)."
                },
                {
                        "heading": "3. Mẹo Ghi Nhớ Bài Vè Chuyển Thể Te Trong 1 Giây",
                        "icon": "fa-solid fa-bolt",
                        "text": "Hãy nhớ các cặp vần thần thánh:\\n'い・ち・り (i, chi, ri) biến thành って (tte)'\\n'み・び・に (mi, bi, ni) biến thành んで (nde)'\\n'き (ki) biến thành いて (ite), ぎ (gi) biến thành いで (ide)'\\nLuyện tập chuyển đổi 5 động từ mỗi ngày sẽ giúp bạn nói thể Te lưu loát trong vô thức!"
                }
        ],
        "keyTakeaway": "Làm chủ thể Te đồng nghĩa với việc bạn đã vượt qua được ngọn núi ngữ pháp cao nhất trong chương trình tiếng Nhật sơ cấp!"
},
        parents: ['ja_s3_easy', 'ja_s3_normal', 'ja_s3_hard'],
        objectives: [
          'Hóa giải quy tắc phân 3 nhóm động từ',
          'Biến đổi thần tốc thể Te, thể Nai, thể Ta'
        ],
        preview: 'Động cơ then chốt để nói được mọi câu văn phức tạp.',
        trial: {
          prompt: 'Động từ "たべます" (Ăn) thuộc nhóm động từ số mấy?',
          choices: ['Nhóm 2 (Đuôi e-masu)', 'Nhóm 1', 'Nhóm 3'],
          answerIdx: 0,
          explanation: 'Chính xác! "たべます" có âm e đứng trước masu nên thuộc Nhóm 2.'
        }
      },
      {
        id: 'ja_s4_easy',
        stage: 4,
        stageName: 'MỐC CHỦ ĐỀ 4: CĂN HẦM THỂ ĐỘNG TỪ',
        isHub: false,
        difficulty: 'easy',
        title: 'Thể Te & Mẫu Nhờ Vả Lịch Thiệp',
        desc: 'Xin vui lòng ~Te kudasai',
        icon: 'fa-solid fa-hand-holding-heart',
        xpReward: 5,
        heartPenalty: 1,
        status: 'locked',
        parents: ['ja_s4_hub'],
        objectives: [
          'Nắm cấu trúc nhờ cậy: V-te kudasai',
          'Nói câu kinh điển: Chotto matte kudasai (Hãy đợi chút)'
        ],
        preview: 'まってください (Hãy đợi tôi một chút)',
        trial: {
          prompt: 'Chia động từ "かきます" (Viết) sang thể Te:',
          choices: ['かいて (kaite)', 'かって (katte)', 'かちて (kachite)'],
          answerIdx: 0,
          explanation: 'Rất chuẩn! Đuôi ki chuyển thành ite: かきます -> かいて.'
        }
      },
      {
        id: 'ja_s4_normal',
        stage: 4,
        stageName: 'MỐC CHỦ ĐỀ 4: CĂN HẦM THỂ ĐỘNG TỪ',
        isHub: false,
        difficulty: 'normal',
        title: 'Thể Nai (Cấm Chỉ) & Thể Ta (Quá Khứ)',
        desc: 'Xin đừng làm gì & Đã từng trải nghiệm',
        icon: 'fa-solid fa-ban',
        xpReward: 10,
        heartPenalty: 2,
        status: 'locked',
        parents: ['ja_s4_hub'],
        objectives: [
          'Mẫu câu cấm đoán lịch sự: V-naide kudasai',
          'Mẫu câu kinh nghiệm: V-ta koto ga arimasu (Đã từng)'
        ],
        preview: 'しゃしん を とらないで ください (Xin đừng chụp ảnh)',
        trial: {
          prompt: 'Mẫu câu "Tôi đã từng đi Nhật Bản" diễn đạt thế nào?',
          choices: ['日本へ 行った ことが あります', '日本へ 行きます ことが あります', '日本へ 行かない ことが あります'],
          answerIdx: 0,
          explanation: 'Tuyệt vời! Cấu trúc "V-ta + koto ga arimasu" dùng để nói về trải nghiệm đã qua.'
        }
      },
      {
        id: 'ja_s4_hard',
        stage: 4,
        stageName: 'MỐC CHỦ ĐỀ 4: CĂN HẦM THỂ ĐỘNG TỪ',
        isHub: false,
        difficulty: 'hard',
        title: 'Thử Thách Phản Xạ Chia Thể 5 Giây',
        desc: 'Vượt bẫy chia thể nhóm 1 phức tạp',
        icon: 'fa-solid fa-bolt-lightning',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['ja_s4_hub'],
        objectives: [
          'Chia nhanh 10 động từ biến âm đặc biệt (ikimasu -> itte)',
          'Không mắc sai sót trong các đuôi mu, bu, nu -> nde'
        ],
        preview: 'のみます -> のんで • あそびます -> あそんで',
        trial: {
          prompt: 'Động từ "いきます" (Đi) chia sang thể Te là gì (Trường hợp đặc biệt)?',
          choices: ['いって (itte)', 'いいて (iite)', 'いんで (inde)'],
          answerIdx: 0,
          explanation: 'Quá siêu! "いきます" là trường hợp ngoại lệ độc nhất chia thành "いって".'
        }
      },

      // ================= STAGE 5: ĐỀN THỜ BOSS TỐI THƯỢNG JLPT N5 =================
      {
        id: 'ja_s5_hub',
        stage: 5,
        stageName: 'MỐC CHỦ ĐỀ 5: ĐỀN THỜ BOSS TỐI THƯỢNG JLPT N5',
        isHub: true,
        title: 'Đền Thờ Boss Dungeon: Chứng Chỉ JLPT N5',
        desc: 'Đỉnh cao vinh danh lộ trình học',
        icon: 'fa-solid fa-crown',
        xpReward: 0,
        heartPenalty: 0,
        status: 'locked',
        readingArticle: {
        "title": "Đền Thờ Đỉnh Cao: Chiến Lược Chinh Phục JLPT N5 & Hành Trình Vươn Xa",
        "lead": "Chứng chỉ JLPT N5 là dấu mốc đầu tiên khẳng định năng lực ngôn ngữ và sự nỗ lực kiên định của bạn trên con đường chinh phục tiếng Nhật.",
        "sections": [
                {
                        "heading": "1. Cấu Trúc Đề Thi JLPT N5 Chuẩn Quốc Tế",
                        "icon": "fa-solid fa-award",
                        "text": "Bài thi gồm 3 phần thi độc lập:\\n1. Kiến thức ngôn ngữ (25 phút): Nhận diện chữ Hán, chọn cách đọc Hiragana, tìm từ vựng đồng nghĩa.\\n2. Ngữ pháp & Đọc hiểu (50 phút): Điền trợ từ, sắp xếp sao tạo câu chuẩn, đọc hiểu 3 đoạn văn ngắn.\\n3. Nghe hiểu (30 phút): Nghe đoạn hội thoại đời sống, quan sát tranh minh họa và chọn phương án hành động đúng."
                },
                {
                        "heading": "2. Chiến Thuật Phân Bổ Thời Gian & Mẹo Tránh Bẫy",
                        "icon": "fa-solid fa-clock",
                        "text": "• Không bao giờ bỏ trống đáp án: Vì đề thi không trừ điểm câu sai, luôn chọn đáp án khả dĩ nhất nếu sắp hết giờ.\\n• Tận dụng thời gian trống ở phần Nghe: Đọc lướt qua 4 hình vẽ hoặc câu chữ trước khi băng phát âm thanh.\\n• Cẩn thận với trường âm (obaasan vs obasan) và âm ngắt (kitte vs kite) - đây là các bẫy phổ biến nhất ở phần Từ vựng N5!"
                },
                {
                        "heading": "3. Bước Chân Kế Tiếp Hướng Tới N4 & N3",
                        "icon": "fa-solid fa-mountain-sun",
                        "text": "Sau khi hoàn thành 5 tầng lộ trình của Slanguage, bạn đã nắm chắc hơn 800 từ vựng cốt lõi, 150 chữ Hán căn bản và hơn 50 cấu trúc câu giao tiếp. Hãy tiếp tục giữ vững ngọn lửa đam mê để vươn tới N4 và N3!"
                }
        ],
        "keyTakeaway": "Kiên trì mỗi ngày một chút tri thức là chìa khóa mở ra cánh cửa thành công tại xứ sở hoa anh đào!"
},
        parents: ['ja_s4_easy', 'ja_s4_normal', 'ja_s4_hard'],
        objectives: [
          'Tổng hợp toàn bộ kiến thức Kanji, Từ vựng, Ngữ pháp',
          'Sẵn sàng chạm tay vào chứng chỉ quốc tế JLPT N5'
        ],
        preview: 'Cổng thiêng liêng chứng nhận học viên Slanguage.',
        trial: {
          prompt: 'Chứng chỉ sơ cấp tiếng Nhật có mã hiệu quốc tế là gì?',
          choices: ['JLPT N5', 'JLPT N1', 'TOEIC 900'],
          answerIdx: 0,
          explanation: 'Chính xác! N5 là chứng chỉ khởi đầu quan trọng của kỳ thi năng lực tiếng Nhật JLPT.'
        }
      },
      {
        id: 'ja_s5_easy',
        stage: 5,
        stageName: 'MỐC CHỦ ĐỀ 5: ĐỀN THỜ BOSS TỐI THƯỢNG JLPT N5',
        isHub: false,
        difficulty: 'easy',
        title: 'Tổng Duyệt 30 Câu Trọng Điểm N5',
        desc: 'Quét sạch các lỗi ngữ pháp hay gặp',
        icon: 'fa-solid fa-shield-cat',
        xpReward: 5,
        heartPenalty: 1,
        status: 'locked',
        parents: ['ja_s5_hub'],
        objectives: [
          'Ôn tập mẫu câu so sánh より, ほうが',
          'Củng cố phó từ chỉ tần suất: いつも, ときどき'
        ],
        preview: 'りんごのほうが みかんより おおきいです',
        trial: {
          prompt: 'Từ nào có nghĩa là "Thỉnh thoảng" (tần suất khoảng 50%)?',
          choices: ['ときどき (tokidoki)', 'いつも (itsumo)', 'ぜんぜん (zenzen)'],
          answerIdx: 0,
          explanation: 'Đúng rồi! "ときどき" là thỉnh thoảng, "いつも" là luôn luôn.'
        }
      },
      {
        id: 'ja_s5_normal',
        stage: 5,
        stageName: 'MỐC CHỦ ĐỀ 5: ĐỀN THỜ BOSS TỐI THƯỢNG JLPT N5',
        isHub: false,
        difficulty: 'normal',
        title: 'Đọc Hiểu Đoạn Văn Ngắn Chuẩn Đề Thi',
        desc: 'Giải mã email thông báo & bức thư tay',
        icon: 'fa-solid fa-book-open-reader',
        xpReward: 10,
        heartPenalty: 2,
        status: 'locked',
        parents: ['ja_s5_hub'],
        objectives: [
          'Nắm ý chính trong đoạn văn 150 chữ Kanji N5',
          'Tìm câu trả lời đúng cho câu hỏi đọc hiểu trong 2 phút'
        ],
        preview: 'Đọc bức thư mời sinh nhật của bạn Tanaka',
        trial: {
          prompt: 'Đoạn văn: 「あした 田中さんの うちで パーティーが あります」。Tiệc diễn ra ở đâu?',
          choices: ['Nhà bạn Tanaka', 'Trường học', 'Nhà ga'],
          answerIdx: 0,
          explanation: 'Rất thông minh! "田中さんの うち" nghĩa là nhà của anh/chị Tanaka.'
        }
      },
      {
        id: 'ja_s5_hard',
        stage: 5,
        stageName: 'MỐC CHỦ ĐỀ 5: ĐỀN THỜ BOSS TỐI THƯỢNG JLPT N5',
        isHub: false,
        difficulty: 'hard',
        title: 'Trảm Boss Tối Thượng: JLPT N5 Master',
        desc: 'Đề thi trắc nghiệm tổng lực toàn diện',
        icon: 'fa-solid fa-dragon',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['ja_s5_hub'],
        objectives: [
          'Giải quyết câu đố liên hoàn 3 phần: Từ vựng, Ngữ pháp, Phản xạ',
          'Khẳng định thực lực đạt điểm xuất sắc JLPT N5'
        ],
        preview: 'Đấu trường Boss Dungeon tối thượng.',
        trial: {
          prompt: 'Điền từ thích hợp: 「日本語の 勉強は おもしろい (___)、むずかしいです」。(Học tiếng Nhật thú vị nhưng khó)',
          choices: ['ですが (desu ga)', 'だから (dakara)', 'そして (soshite)'],
          answerIdx: 0,
          explanation: 'ĐỈNH CAO! "ですが" là liên từ chỉ sự tương phản (nhưng/tuy nhiên). Bạn đã hoàn thành trảm Boss thành công!'
        }
      }
    ]
  },

  // ================= ENGLISH DUNGEON =================
  en: {
    id: 'en',
    name: 'English',
    dungeonTitle: 'Dungeon of Mastery: English Proficiency (IELTS & Communicative)',
    dungeonSubtitle: 'Conquer the 5 chambers of English linguistic power. Every milestone branches into Easy, Normal, and Hard paths with respective XP rewards and heart penalties.',
    nodes: [
      {
        id: 'en_s1_hub',
        stage: 1,
        stageName: 'MILESTONE 1: PHONETICS GATE & CORE SALUTATIONS',
        isHub: true,
        title: 'Gateway of Pronunciation & Natural Flow',
        desc: 'Stage 1 Waypoint Hub',
        icon: 'fa-solid fa-dungeon',
        xpReward: 0,
        heartPenalty: 0,
        status: 'mastered',
        parents: [],
        objectives: ['Master the 44 sounds of IPA', 'Build intuitive phonetic reflexes'],
        preview: 'Your journey through the English labyrinth starts here.',
        trial: {
          prompt: 'Which word contains the short /ɪ/ vowel sound?',
          choices: ['Ship', 'Sheep', 'Shape'],
          answerIdx: 0,
          explanation: 'Spot on! "Ship" features the crisp short /ɪ/ sound, whereas "Sheep" uses the prolonged /iː/.'
        }
      },
      {
        id: 'en_s1_easy',
        stage: 1,
        stageName: 'MILESTONE 1: PHONETICS GATE & CORE SALUTATIONS',
        isHub: false,
        difficulty: 'easy',
        title: 'IPA Pure Vowels & Consonants',
        desc: 'Clean accent & vowel clarity',
        icon: 'fa-solid fa-feather-pointed',
        xpReward: 5,
        heartPenalty: 1,
        status: 'mastered',
        parents: ['en_s1_hub'],
        objectives: ['Pronounce /θ/ and /ð/ smoothly', 'Master basic greeting etiquette'],
        preview: 'Thank you • Think • That • There',
        trial: {
          prompt: 'How is the "th" pronounced in "Think"?',
          choices: ['Voiceless /θ/', 'Voiced /ð/', 'Hard /t/'],
          answerIdx: 0,
          explanation: 'Accurate! "Think" starts with the soft voiceless dental fricative /θ/.'
        }
      },
      {
        id: 'en_s1_normal',
        stage: 1,
        stageName: 'MILESTONE 1: PHONETICS GATE & CORE SALUTATIONS',
        isHub: false,
        difficulty: 'normal',
        title: 'Word Stress & Connected Speech',
        desc: 'Linking sounds & rhythm mechanics',
        icon: 'fa-solid fa-wand-magic-sparkles',
        xpReward: 10,
        heartPenalty: 2,
        status: 'available',
        parents: ['en_s1_hub'],
        objectives: ['Handle consonant-to-vowel sound linking', 'Apply primary stress on multi-syllable terms'],
        preview: 'Check it out -> /tʃekɪtaʊt/',
        trial: {
          prompt: 'Where is the primary stress in "PHOTOGRAPHY"?',
          choices: ['Second syllable (pho-TOG-ra-phy)', 'First syllable (PHO-to-gra-phy)', 'Third syllable (pho-to-GRAPH-y)'],
          answerIdx: 0,
          explanation: 'Bravo! Photography places primary emphasis on the second syllable: pho-TOG-ra-phy.'
        }
      },
      {
        id: 'en_s1_hard',
        stage: 1,
        stageName: 'MILESTONE 1: PHONETICS GATE & CORE SALUTATIONS',
        isHub: false,
        difficulty: 'hard',
        title: 'Intonation & Advanced Reduction',
        desc: 'Glottal stops, schwa & rapid speech',
        icon: 'fa-solid fa-skull',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['en_s1_hub'],
        objectives: ['Understand native contractions at normal velocity', 'Use rising/falling pitch for subtle nuance'],
        preview: 'What do you want to do? -> /wʌdəjə wɑnə duː/',
        trial: {
          prompt: 'What sound replaces the unstressed vowels in natural spoken English?',
          choices: ['The Schwa /ə/', 'The Diphthong /aɪ/', 'The Long /uː/'],
          answerIdx: 0,
          explanation: 'Remarkable! The neutral Schwa /ə/ is the most ubiquitous sound in natural English rhythm.'
        }
      },

      // STAGE 2 TO 5 (En)
      {
        id: 'en_s2_hub',
        stage: 2,
        stageName: 'MILESTONE 2: TEMPLE OF TENSES & SENTENCE ARCHITECTURE',
        isHub: true,
        title: 'Shrine of Grammatical Precision',
        desc: 'Stage 2 Waypoint Hub',
        icon: 'fa-solid fa-monument',
        xpReward: 0,
        heartPenalty: 0,
        status: 'available',
        parents: ['en_s1_easy', 'en_s1_normal', 'en_s1_hard'],
        objectives: ['Navigate the 12 English tenses with absolute confidence'],
        preview: 'Bridge between basic phrases and complex academic arguments.',
        trial: {
          prompt: 'Which sentence correctly uses Present Perfect Continuous?',
          choices: ['I have been living here for 5 years.', 'I am living here since 5 years.', 'I lived here for 5 years now.'],
          answerIdx: 0,
          explanation: 'Correct! "Have been living" indicates an action that started in the past and continues into the present.'
        }
      },
      {
        id: 'en_s2_easy',
        stage: 2,
        stageName: 'MILESTONE 2: TEMPLE OF TENSES & SENTENCE ARCHITECTURE',
        isHub: false,
        difficulty: 'easy',
        title: 'Essential Present & Past Tenses',
        desc: 'Everyday actions & completed history',
        icon: 'fa-solid fa-seedling',
        xpReward: 5,
        heartPenalty: 1,
        status: 'locked',
        parents: ['en_s2_hub'],
        objectives: ['Present Simple habits vs Past Simple events'],
        preview: 'She studies every day • They arrived yesterday',
        trial: {
          prompt: 'Yesterday, she (___) to the supermarket.',
          choices: ['went', 'goes', 'has gone'],
          answerIdx: 0,
          explanation: 'Correct! "Yesterday" demands the Simple Past form "went".'
        }
      },
      {
        id: 'en_s2_normal',
        stage: 2,
        stageName: 'MILESTONE 2: TEMPLE OF TENSES & SENTENCE ARCHITECTURE',
        isHub: false,
        difficulty: 'normal',
        title: 'Conditionals & Modals of Deduction',
        desc: 'Hypothetical worlds & certainty levels',
        icon: 'fa-solid fa-shield-halved',
        xpReward: 10,
        heartPenalty: 2,
        status: 'locked',
        parents: ['en_s2_hub'],
        objectives: ['Second and Third Conditionals in debates'],
        preview: 'If I were you, I would take the offer.',
        trial: {
          prompt: 'If I (___) more time, I would travel around the world.',
          choices: ['had', 'have', 'would have'],
          answerIdx: 0,
          explanation: 'Spot on! The Second Conditional uses Simple Past in the If-clause.'
        }
      },
      {
        id: 'en_s2_hard',
        stage: 2,
        stageName: 'MILESTONE 2: TEMPLE OF TENSES & SENTENCE ARCHITECTURE',
        isHub: false,
        difficulty: 'hard',
        title: 'Inversion & Cleft Sentences (Band 8.0+)',
        desc: 'Syntactic flair for elite expression',
        icon: 'fa-solid fa-fire-flame-curved',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['en_s2_hub'],
        objectives: ['Hard negative inversions: Seldom, Hardly, Not only'],
        preview: 'Not only did she pass, but she also scored top of class.',
        trial: {
          prompt: 'Complete the inverted sentence: "Rarely (___) such an outstanding performance."',
          choices: ['have I witnessed', 'I have witnessed', 'did I witnessed'],
          answerIdx: 0,
          explanation: 'Superb! Negative adverbs like Rarely trigger auxiliary-subject inversion: "have I witnessed".'
        }
      },

      // STAGE 3, 4, 5
      {
        id: 'en_s3_hub',
        stage: 3,
        stageName: 'MILESTONE 3: GLOBAL TRAVEL & REAL-TIME NEGOTIATION',
        isHub: true,
        title: 'Metropolis of Practical Discourse',
        desc: 'Stage 3 Waypoint Hub',
        icon: 'fa-solid fa-city',
        xpReward: 0,
        heartPenalty: 0,
        status: 'locked',
        parents: ['en_s2_easy', 'en_s2_normal', 'en_s2_hard'],
        objectives: ['Real-world fluency for workplace and international travels'],
        preview: 'From Heathrow airport check-in to corporate boardroom debates.',
        trial: {
          prompt: 'What is a polite way to interrupt in a business meeting?',
          choices: ['May I chime in for a second?', 'Stop talking now.', 'Listen to me instead.'],
          answerIdx: 0,
          explanation: 'Polite and professional expression used across international companies.'
        }
      },
      {
        id: 'en_s3_easy',
        stage: 3,
        stageName: 'MILESTONE 3: GLOBAL TRAVEL & REAL-TIME NEGOTIATION',
        isHub: false,
        difficulty: 'easy',
        title: 'Airport, Hotel & Transit Navigation',
        desc: 'Seamless travel without hesitation',
        icon: 'fa-solid fa-plane-departure',
        xpReward: 5,
        heartPenalty: 1,
        status: 'locked',
        parents: ['en_s3_hub'],
        objectives: ['Boarding gates, immigration, baggage claims'],
        preview: 'I would like to check in for flight BA182 to London.',
        trial: {
          prompt: 'Where do you retrieve checked luggage at an airport?',
          choices: ['Baggage Claim / Carousel', 'Boarding Gate', 'Duty-Free Shop'],
          answerIdx: 0,
          explanation: 'Correct! Baggage claim is the designated pickup area.'
        }
      },
      {
        id: 'en_s3_normal',
        stage: 3,
        stageName: 'MILESTONE 3: GLOBAL TRAVEL & REAL-TIME NEGOTIATION',
        isHub: false,
        difficulty: 'normal',
        title: 'Customer Service & Resolving Disputes',
        desc: 'Firm yet diplomatic negotiation',
        icon: 'fa-solid fa-handshake',
        xpReward: 10,
        heartPenalty: 2,
        status: 'locked',
        parents: ['en_s3_hub'],
        objectives: ['Complain constructively and negotiate refunds/exchanges'],
        preview: 'I am afraid there has been a discrepancy with my booking.',
        trial: {
          prompt: 'Choose the most diplomatic phrasing:',
          choices: ['I am afraid there might be an oversight with this bill.', 'You made a mistake with my bill!', 'Give me my money back immediately!'],
          answerIdx: 0,
          explanation: 'Excellent diplomatic phrasing using softeners ("I am afraid", "might be").'
        }
      },
      {
        id: 'en_s3_hard',
        stage: 3,
        stageName: 'MILESTONE 3: GLOBAL TRAVEL & REAL-TIME NEGOTIATION',
        isHub: false,
        difficulty: 'hard',
        title: 'High-Stakes Contract & Corporate Pitch',
        desc: 'Persuasive rhetoric and counter-arguments',
        icon: 'fa-solid fa-briefcase',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['en_s3_hub'],
        objectives: ['Articulate trade-offs, ROI, and strategic partnerships'],
        preview: 'We foresee substantial mutual gains provided terms align.',
        trial: {
          prompt: 'What does "to reach a stalemate" signify in negotiation?',
          choices: ['Neither party can make further progress or agreement', 'Signing a massive deal', 'Lowering prices by 50%'],
          answerIdx: 0,
          explanation: 'Spot on! A stalemate represents an impasse or deadlock.'
        }
      },

      // STAGE 4
      {
        id: 'en_s4_hub',
        stage: 4,
        stageName: 'MILESTONE 4: VAULT OF IDIOMS & ACADEMIC LEXICON',
        isHub: true,
        title: 'Vault of Advanced Collocations',
        desc: 'Stage 4 Waypoint Hub',
        icon: 'fa-solid fa-vault',
        xpReward: 0,
        heartPenalty: 0,
        status: 'locked',
        parents: ['en_s3_easy', 'en_s3_normal', 'en_s3_hard'],
        objectives: ['Acquire 500+ C1-C2 level collocations and idiomatic phrases'],
        preview: 'Transforming solid English into native-level elegance.',
        trial: {
          prompt: 'What does the idiom "Bite the bullet" mean?',
          choices: ['Face a difficult situation with fortitude', 'Eat something hard', 'Engage in warfare'],
          answerIdx: 0,
          explanation: 'Correct! It means facing unavoidable adversity courageously.'
        }
      },
      {
        id: 'en_s4_easy',
        stage: 4,
        stageName: 'MILESTONE 4: VAULT OF IDIOMS & ACADEMIC LEXICON',
        isHub: false,
        difficulty: 'easy',
        title: '15 Quintessential Idioms',
        desc: 'Under the weather, once in a blue moon',
        icon: 'fa-solid fa-comments',
        xpReward: 5,
        heartPenalty: 1,
        status: 'locked',
        parents: ['en_s4_hub'],
        objectives: ['Recognize everyday figurative speech in podcasts and films'],
        preview: 'It is a piece of cake • Break a leg!',
        trial: {
          prompt: 'When someone tells an actor "Break a leg!", they mean:',
          choices: ['Good luck!', 'Be careful!', 'Stop acting!'],
          answerIdx: 0,
          explanation: 'Classic theatre idiom wishing performers great luck.'
        }
      },
      {
        id: 'en_s4_normal',
        stage: 4,
        stageName: 'MILESTONE 4: VAULT OF IDIOMS & ACADEMIC LEXICON',
        isHub: false,
        difficulty: 'normal',
        title: 'Phrasal Verbs in Dynamic Context',
        desc: 'Carry out, account for, boil down to',
        icon: 'fa-solid fa-bolt',
        xpReward: 10,
        heartPenalty: 2,
        status: 'locked',
        parents: ['en_s4_hub'],
        objectives: ['Multi-meaning phrasal verbs without rote memorization'],
        preview: 'The research accounts for 85% of market shifts.',
        trial: {
          prompt: 'What does "call off" mean in "They called off the meeting"?',
          choices: ['Cancelled', 'Postponed', 'Relocated'],
          answerIdx: 0,
          explanation: 'Correct! "Call off" means cancel, whereas "put off" means postpone.'
        }
      },
      {
        id: 'en_s4_hard',
        stage: 4,
        stageName: 'MILESTONE 4: VAULT OF IDIOMS & ACADEMIC LEXICON',
        isHub: false,
        difficulty: 'hard',
        title: 'Band 8.5 Academic Paraphrasing',
        desc: 'Lexical substitution without meaning distortion',
        icon: 'fa-solid fa-brain',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['en_s4_hub'],
        objectives: ['Elevate essays with sophisticated academic phrasing'],
        preview: 'Exacerbate • Alleviate • Precipitate • Ubiquitous',
        trial: {
          prompt: 'Which word serves as an academic synonym for "worsen"?',
          choices: ['Exacerbate', 'Ameliorate', 'Mitigate'],
          answerIdx: 0,
          explanation: 'Brilliant! "Exacerbate" means to make a problem or disease more severe.'
        }
      },

      // STAGE 5 (Final Boss)
      {
        id: 'en_s5_hub',
        stage: 5,
        stageName: 'MILESTONE 5: SANCTUM OF THE IELTS TITAN (BAND 7.5+)',
        isHub: true,
        title: 'Sanctum of International Certification',
        desc: 'Grand Boss Pinnacle',
        icon: 'fa-solid fa-crown',
        xpReward: 0,
        heartPenalty: 0,
        status: 'locked',
        parents: ['en_s4_easy', 'en_s4_normal', 'en_s4_hard'],
        objectives: ['The ultimate trial proving fluency and analytical mastery'],
        preview: 'Gateway to international scholarships, emigration, and careers.',
        trial: {
          prompt: 'What does the IELTS acronym represent?',
          choices: ['International English Language Testing System', 'Intercontinental English Learning Test Standard', 'Institute of English Linguistic Testing Service'],
          answerIdx: 0,
          explanation: 'Precise! The premier international English test standard.'
        }
      },
      {
        id: 'en_s5_easy',
        stage: 5,
        stageName: 'MILESTONE 5: SANCTUM OF THE IELTS TITAN (BAND 7.5+)',
        isHub: false,
        difficulty: 'easy',
        title: 'Speed Reading Skimming & Scanning',
        desc: 'Crack 800-word passages under 3 minutes',
        icon: 'fa-solid fa-glasses',
        xpReward: 5,
        heartPenalty: 1,
        status: 'locked',
        parents: ['en_s5_hub'],
        objectives: ['True/False/Not Given verification strategies'],
        preview: 'Locate keywords and qualifying adverbs instantly.',
        trial: {
          prompt: 'If a passage states "Some experts argue X", but the statement says "All scientists agree on X", the answer is:',
          choices: ['FALSE', 'TRUE', 'NOT GIVEN'],
          answerIdx: 0,
          explanation: 'Spot on! "Some" directly contradicts "All", making the statement FALSE.'
        }
      },
      {
        id: 'en_s5_normal',
        stage: 5,
        stageName: 'MILESTONE 5: SANCTUM OF THE IELTS TITAN (BAND 7.5+)',
        isHub: false,
        difficulty: 'normal',
        title: 'Speaking Part 3 Abstract Reasoning',
        desc: 'Sustained fluency on societal trends',
        icon: 'fa-solid fa-microphone-lines',
        xpReward: 10,
        heartPenalty: 2,
        status: 'locked',
        parents: ['en_s5_hub'],
        objectives: ['Develop well-structured 3-tier answers: Point - Elaboration - Example'],
        preview: 'From AI automation impacts to eco-sustainability policies.',
        trial: {
          prompt: 'What cohesive device best introduces an opposing viewpoint in academic speech?',
          choices: ['On the flip side / Conversely', 'Also', 'Because of this'],
          answerIdx: 0,
          explanation: 'Excellent! "Conversely" or "On the flip side" transitions smoothly to a counter-argument.'
        }
      },
      {
        id: 'en_s5_hard',
        stage: 5,
        stageName: 'MILESTONE 5: SANCTUM OF THE IELTS TITAN (BAND 7.5+)',
        isHub: false,
        difficulty: 'hard',
        title: 'Defeat the IELTS Dragon: Band 8.5 Battle',
        desc: 'Comprehensive multi-disciplinary trial',
        icon: 'fa-solid fa-dragon',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['en_s5_hub'],
        objectives: ['Zero-hesitation linguistic synthesis under intense pressure'],
        preview: 'The pinnacle triumph of the Slanguage Dungeon.',
        trial: {
          prompt: 'Identify the flaw in: "The data shows that people spend more money, nevertheless economic growth."',
          choices: ['"Nevertheless" is a conjunction/adverb, cannot be followed directly by a noun phrase.', 'No error present.', '"Data" cannot take singular verb.'],
          answerIdx: 0,
          explanation: 'UNSTOPPABLE! "Nevertheless" cannot function as a preposition like "despite". You conquered the Dungeon Boss!'
        }
      }
    ]
  },

  // ================= VIETNAMESE DUNGEON =================
  vi: {
    id: 'vi',
    name: 'Tiếng Việt',
    dungeonTitle: 'Hầm Ngục Kỳ Bí: Tiếng Việt Bản Xứ & Ứng Dụng Đời Sống',
    dungeonSubtitle: 'Khám phá 5 tầng kỳ hoa dị thảo của tiếng Việt. Mỗi cột mốc là một chủ đề phân nhánh 3 độ khó Dễ, Bình thường, Khó với phần thưởng XP và sinh lực tương ứng.',
    nodes: [
      {
        id: 'vi_s1_hub',
        stage: 1,
        stageName: 'MỐC CHỦ ĐỀ 1: THANH ĐIỆU & NGUYÊN ÂM QUỐC HỒN',
        isHub: true,
        title: 'Cổng Khởi Nguyên: Vũ Điệu 6 Thanh Âm',
        desc: 'Trạm trung chuyển mốc 1',
        icon: 'fa-solid fa-dungeon',
        xpReward: 0,
        heartPenalty: 0,
        status: 'mastered',
        parents: [],
        objectives: ['Làm chủ 6 thanh điệu: Ngang, Huyền, Sắc, Hỏi, Ngã, Nặng'],
        preview: 'Giai điệu âm nhạc làm nên cái hồn tiếng Việt.',
        trial: {
          prompt: 'Tiếng Việt chuẩn có bao nhiêu thanh điệu?',
          choices: ['6 thanh', '4 thanh', '5 thanh'],
          answerIdx: 0,
          explanation: 'Chính xác! 6 thanh gồm: Ngang (Không dấu), Huyền, Sắc, Hỏi, Ngã, Nặng.'
        }
      },
      {
        id: 'vi_s1_easy',
        stage: 1,
        stageName: 'MỐC CHỦ ĐỀ 1: THANH ĐIỆU & NGUYÊN ÂM QUỐC HỒN',
        isHub: false,
        difficulty: 'easy',
        title: 'Nhận Diện Dấu Hỏi (?) vs Dấu Ngã (~)',
        desc: 'Chuẩn hóa quy tắc chính tả căn bản',
        icon: 'fa-solid fa-feather-pointed',
        xpReward: 5,
        heartPenalty: 1,
        status: 'mastered',
        parents: ['vi_s1_hub'],
        objectives: ['Quy tắc Mình Nên Viết Dấu Ngã', 'Không bao giờ viết sai chính tả thường ngày'],
        preview: 'Sửa soạn (Hỏi) vs Sữa mẹ (Ngã)',
        trial: {
          prompt: 'Từ nào sau đây viết ĐÚNG chính tả?',
          choices: ['Gọn gàng', 'Gọn gàn', 'Gọng gàng'],
          answerIdx: 0,
          explanation: 'Chính xác! "Gọn gàng" là từ láy chuẩn tiếng Việt.'
        }
      },
      {
        id: 'vi_s1_normal',
        stage: 1,
        stageName: 'MỐC CHỦ ĐỀ 1: THANH ĐIỆU & NGUYÊN ÂM QUỐC HỒN',
        isHub: false,
        difficulty: 'normal',
        title: 'Nguyên Âm Đôi: ia/ya, ua, ưa',
        desc: 'Tròn vành rõ chữ âm điệu Việt Nam',
        icon: 'fa-solid fa-wand-magic-sparkles',
        xpReward: 10,
        heartPenalty: 2,
        status: 'available',
        parents: ['vi_s1_hub'],
        objectives: ['Quy tắc đánh dấu thanh trên nguyên âm đôi có âm cuối'],
        preview: 'Tiếng (iê) • Cuốn (uô) • Mướn (ươ)',
        trial: {
          prompt: 'Vị trí đặt dấu thanh trong chữ "Thuyền" chuẩn là ở đâu?',
          choices: ['Trên chữ "ê"', 'Trên chữ "u"', 'Trên chữ "y"'],
          answerIdx: 0,
          explanation: 'Đúng chuẩn! Với nguyên âm đôi "yê" có âm cuối "n", dấu thanh đặt ở âm chính thứ hai "ê".'
        }
      },
      {
        id: 'vi_s1_hard',
        stage: 1,
        stageName: 'MỐC CHỦ ĐỀ 1: THANH ĐIỆU & NGUYÊN ÂM QUỐC HỒN',
        isHub: false,
        difficulty: 'hard',
        title: 'Thử Thách Uốn Lưỡi & Âm Sắc Vùng Miền',
        desc: 'Vượt bẫy phát âm L - N, TR - CH, S - X',
        icon: 'fa-solid fa-skull',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['vi_s1_hub'],
        objectives: ['Luyện phản xạ đọc nhanh 5 câu thơ lắt léo không vấp'],
        preview: 'Lúa nếp là lúa nếp làng, lúa lên lớp lớp lòng nàng lâng lâng',
        trial: {
          prompt: 'Cặp từ nào sau đây mang ý nghĩa chỉ loài chim?',
          choices: ['Chim sẻ (dấu hỏi)', 'Chim sẽ (dấu ngã)', 'Chim se (không dấu)'],
          answerIdx: 0,
          explanation: 'Rất tinh tế! "Chim sẻ" (dấu hỏi) là loài chim nhỏ phổ biến, "sẽ" là phó từ tương lai.'
        }
      },

      // STAGE 2
      {
        id: 'vi_s2_hub',
        stage: 2,
        stageName: 'MỐC CHỦ ĐỀ 2: ĐẠI TỪ NHÂN XƯNG & VĂN HÓA ỨNG XỬ',
        isHub: true,
        title: 'Điện Thờ Xưng Hô & Tôn Ty Trật Tự',
        desc: 'Trạm trung chuyển mốc 2',
        icon: 'fa-solid fa-monument',
        xpReward: 0,
        heartPenalty: 0,
        status: 'available',
        parents: ['vi_s1_easy', 'vi_s1_normal', 'vi_s1_hard'],
        objectives: ['Nghệ thuật xưng hô gia đình, họ hàng, công sở'],
        preview: 'Văn hóa lễ nghĩa cốt lõi của người Việt Nam.',
        trial: {
          prompt: 'Người sinh ra bố của bạn được gọi là gì?',
          choices: ['Bà nội / Ông nội', 'Bà ngoại / Ông ngoại', 'Bác ruột'],
          answerIdx: 0,
          explanation: 'Chính xác! Bên họ nhà nội là bên bố.'
        }
      },
      {
        id: 'vi_s2_easy',
        stage: 2,
        stageName: 'MỐC CHỦ ĐỀ 2: ĐẠI TỪ NHÂN XƯNG & VĂN HÓA ỨNG XỬ',
        isHub: false,
        difficulty: 'easy',
        title: 'Xưng Hô Xã Giao Thường Nhật',
        desc: 'Anh, Chị, Em, Bạn bè, Đồng nghiệp',
        icon: 'fa-solid fa-seedling',
        xpReward: 5,
        heartPenalty: 1,
        status: 'locked',
        parents: ['vi_s2_hub'],
        objectives: ['Chào hỏi người lớn tuổi hơn với kính ngữ "Dạ, Thưa"'],
        preview: 'Dạ, em chào anh ạ! • Dạ, con cảm ơn cô!',
        trial: {
          prompt: 'Từ nào thể hiện sự lễ phép khi trả lời câu hỏi của người lớn?',
          choices: ['Dạ', 'Ừ', 'Gì'],
          answerIdx: 0,
          explanation: 'Rất lễ phép! "Dạ" là kính từ thể hiện sự tôn trọng tuyệt đối trong văn hóa Việt.'
        }
      },
      {
        id: 'vi_s2_normal',
        stage: 2,
        stageName: 'MỐC CHỦ ĐỀ 2: ĐẠI TỪ NHÂN XƯNG & VĂN HÓA ỨNG XỬ',
        isHub: false,
        difficulty: 'normal',
        title: 'Giao Tiếp Công Sở & Tác Phong Ngoại Giao',
        desc: 'Khiêm nhường & chuẩn mực chuyên nghiệp',
        icon: 'fa-solid fa-shield-halved',
        xpReward: 10,
        heartPenalty: 2,
        status: 'locked',
        parents: ['vi_s2_hub'],
        objectives: ['Viết email công vụ trang trọng, mở đầu và kết thúc chuẩn chỉ'],
        preview: 'Kính gửi Quý đối tác • Trân trọng cảm ơn',
        trial: {
          prompt: 'Trong email công việc trang trọng, lời chào nào thích hợp nhất?',
          choices: ['Kính gửi Anh/Chị [Họ và tên]', 'Này anh ơi', 'Chào đằng ấy nhé'],
          answerIdx: 0,
          explanation: 'Chính xác! "Kính gửi" là cụm mở đầu chuẩn mực văn phong công sở.'
        }
      },
      {
        id: 'vi_s2_hard',
        stage: 2,
        stageName: 'MỐC CHỦ ĐỀ 2: ĐẠI TỪ NHÂN XƯNG & VĂN HÓA ỨNG XỬ',
        isHub: false,
        difficulty: 'hard',
        title: 'Hệ Thống Gia Tộc Đa Tầng 3 Miền',
        desc: 'Cậu, Dượng, Thím, Mợ, Chú, Bác, Cố',
        icon: 'fa-solid fa-fire-flame-curved',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['vi_s2_hub'],
        objectives: ['Xác định chính xác vị trí trong cây gia phả dòng họ'],
        preview: 'Vợ của cậu gọi là Mợ • Chồng của dì gọi là Dượng',
        trial: {
          prompt: 'Vợ của người em trai của mẹ được gọi là gì?',
          choices: ['Mợ (Vợ của Cậu)', 'Thím (Vợ của Chú)', 'Bác gái'],
          answerIdx: 0,
          explanation: 'Tuyệt vời! Em trai của mẹ là Cậu, vợ của Cậu gọi là Mợ.'
        }
      },

      // STAGE 3, 4, 5
      {
        id: 'vi_s3_hub',
        stage: 3,
        stageName: 'MỐC CHỦ ĐỀ 3: ẨM THỰC ĐƯỜNG PHỐ & CHỢ TRUYỀN THỐNG',
        isHub: true,
        title: 'Khu Chợ Sầm Uất 3 Miền Bắc - Trung - Nam',
        desc: 'Trạm trung chuyển mốc 3',
        icon: 'fa-solid fa-bowl-rice',
        xpReward: 0,
        heartPenalty: 0,
        status: 'locked',
        parents: ['vi_s2_easy', 'vi_s2_normal', 'vi_s2_hard'],
        objectives: ['Đàm thoại mua sắm, gọi món và trả giá tài tình'],
        preview: 'Trải nghiệm phong vị ẩm thực đậm đà bản sắc.',
        trial: {
          prompt: 'Món ăn nào được xem là quốc hồn quốc túy của Việt Nam?',
          choices: ['Phở', 'Pizza', 'Sushi'],
          answerIdx: 0,
          explanation: 'Chính xác! Phở là tinh hoa ẩm thực nổi tiếng toàn cầu của Việt Nam.'
        }
      },
      {
        id: 'vi_s3_easy',
        stage: 3,
        stageName: 'MỐC CHỦ ĐỀ 3: ẨM THỰC ĐƯỜNG PHỐ & CHỢ TRUYỀN THỐNG',
        isHub: false,
        difficulty: 'easy',
        title: 'Gọi Món & Khẩu Vị Cá Nhân',
        desc: 'Ít cay, không hành, nhiều nước béo',
        icon: 'fa-solid fa-utensils',
        xpReward: 5,
        heartPenalty: 1,
        status: 'locked',
        parents: ['vi_s3_hub'],
        objectives: ['Nói các tùy chọn món ăn một cách lưu loát'],
        preview: 'Cho cháu một bát phở bò tái không hành!',
        trial: {
          prompt: 'Khi không ăn được ớt, bạn sẽ dặn chủ quán thế nào?',
          choices: ['Cho cháu không cay nhé cô', 'Cho cháu thật nhiều ớt', 'Cho cháu thêm ớt bột'],
          answerIdx: 0,
          explanation: 'Đúng rồi! "Cho cháu không cay" là cách yêu cầu rõ ràng nhất.'
        }
      },
      {
        id: 'vi_s3_normal',
        stage: 3,
        stageName: 'MỐC CHỦ ĐỀ 3: ẨM THỰC ĐƯỜNG PHỐ & CHỢ TRUYỀN THỐNG',
        isHub: false,
        difficulty: 'normal',
        title: 'Mặc Cả Vui Vẻ Nơi Chợ Dân Sinh',
        desc: 'Thuận mua vừa bán, rộn rã tiếng cười',
        icon: 'fa-solid fa-store',
        xpReward: 10,
        heartPenalty: 2,
        status: 'locked',
        parents: ['vi_s3_hub'],
        objectives: ['Nghệ thuật khen đồ tươi ngon và xin bớt chút lộc'],
        preview: 'Cô mở hàng cho cháu bớt mười nghìn lấy may nhé!',
        trial: {
          prompt: 'Cụm từ "Mở hàng" trong buôn bán có ý nghĩa gì?',
          choices: ['Người khách đầu tiên mua hàng trong ngày lấy vía may', 'Đóng cửa hàng', 'Tăng giá sản phẩm'],
          answerIdx: 0,
          explanation: 'Chính xác! Người mở hàng mang ý nghĩa tâm linh đem lại may mắn cho cả ngày.'
        }
      },
      {
        id: 'vi_s3_hard',
        stage: 3,
        stageName: 'MỐC CHỦ ĐỀ 3: ẨM THỰC ĐƯỜNG PHỐ & CHỢ TRUYỀN THỐNG',
        isHub: false,
        difficulty: 'hard',
        title: 'Phân Biệt Ẩm Thực 3 Miền Độc Đáo',
        desc: 'Vị thanh tao miền Bắc, vị cay mặn miền Trung, vị ngọt miền Nam',
        icon: 'fa-solid fa-pepper-hot',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['vi_s3_hub'],
        objectives: ['Giải thích triết lý âm dương ngũ hành trong ẩm thực Việt'],
        preview: 'Thịt vịt tính hàn đi với gừng tính nhiệt',
        trial: {
          prompt: 'Gia vị nào thường không thể thiếu khi ăn Ốc luộc miền Bắc?',
          choices: ['Lá bưởi, gừng, sả và ớt', 'Bơ và tỏi', 'Phô mai cay'],
          answerIdx: 0,
          explanation: 'Rất chuẩn vị! Gừng và sả tính ấm giúp trung hòa tính hàn của ốc.'
        }
      },

      // STAGE 4
      {
        id: 'vi_s4_hub',
        stage: 4,
        stageName: 'MỐC CHỦ ĐỀ 4: KHO TÀNG THÀNH NGỮ & CA DAO TỤC NGỮ',
        isHub: true,
        title: 'Căn Hầm Tri Thức Dân Gian Đa Tầng',
        desc: 'Trạm trung chuyển mốc 4',
        icon: 'fa-solid fa-scroll',
        xpReward: 0,
        heartPenalty: 0,
        status: 'locked',
        parents: ['vi_s3_easy', 'vi_s3_normal', 'vi_s3_hard'],
        objectives: ['Vận dụng thành ngữ ẩn dụ trong giao tiếp giàu hình ảnh'],
        preview: 'Học ăn, học nói, học gói, học mở.',
        trial: {
          prompt: 'Điền vào chỗ trống: "Uống nước nhớ (___)"?',
          choices: ['nguồn', 'sông', 'suối'],
          answerIdx: 0,
          explanation: 'Chính xác! "Uống nước nhớ nguồn" răn dạy lòng biết ơn tổ tiên.'
        }
      },
      {
        id: 'vi_s4_easy',
        stage: 4,
        stageName: 'MỐC CHỦ ĐỀ 4: KHO TÀNG THÀNH NGỮ & CA DAO TỤC NGỮ',
        isHub: false,
        difficulty: 'easy',
        title: 'Thành Ngữ Bốn Chữ Thường Nhật',
        desc: 'Mưa thuận gió hòa, chân cứng đá mềm',
        icon: 'fa-solid fa-lightbulb',
        xpReward: 5,
        heartPenalty: 1,
        status: 'locked',
        parents: ['vi_s4_hub'],
        objectives: ['Vận dụng 20 câu thành ngữ 4 chữ thông dụng'],
        preview: 'Thuận buồm xuôi gió • Khỏe như vâm',
        trial: {
          prompt: 'Thành ngữ "Chân cứng đá mềm" mang ý nghĩa gì?',
          choices: ['Chúc nhau vượt qua mọi gian khó, thử thách', 'Chân bị đau vì đá cứng', 'Đá mềm hơn chân'],
          answerIdx: 0,
          explanation: 'Rất hay! Đây là lời chúc ý chí kiên định vượt qua thử thách.'
        }
      },
      {
        id: 'vi_s4_normal',
        stage: 4,
        stageName: 'MỐC CHỦ ĐỀ 4: KHO TÀNG THÀNH NGỮ & CA DAO TỤC NGỮ',
        isHub: false,
        difficulty: 'normal',
        title: 'Ẩn Dụ & Hoán Dụ Ca Dao Lục Bát',
        desc: 'Trầm bổng nhịp 6/8 đong đầy cảm xúc',
        icon: 'fa-solid fa-guitar',
        xpReward: 10,
        heartPenalty: 2,
        status: 'locked',
        parents: ['vi_s4_hub'],
        objectives: ['Phân tích biện pháp tu từ trong ca dao quê hương'],
        preview: 'Trong đầm gì đẹp bằng sen • Gần bùn mà chẳng hôi tanh mùi bùn',
        trial: {
          prompt: 'Hình ảnh hoa Sen trong ca dao tượng trưng cho phẩm chất gì?',
          choices: ['Sự thanh cao, trong sạch giữa hoàn cảnh khó khăn', 'Sự giàu sang phú quý', 'Sự nóng giận'],
          answerIdx: 0,
          explanation: 'Chính xác! Hoa sen gần bùn mà chẳng hôi tanh mùi bùn biểu trưng cho sự trong sạch.'
        }
      },
      {
        id: 'vi_s4_hard',
        stage: 4,
        stageName: 'MỐC CHỦ ĐỀ 4: KHO TÀNG THÀNH NGỮ & CA DAO TỤC NGỮ',
        isHub: false,
        difficulty: 'hard',
        title: 'Điển Cố & Từ Hán Việt Uyên Bác',
        desc: 'Giải nghĩa các từ ngữ trang trọng bậc cao',
        icon: 'fa-solid fa-book-journal-whills',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['vi_s4_hub'],
        objectives: ['Hiểu sâu sắc các từ Hán Việt trong văn thư pháp luật, lịch sử'],
        preview: 'Bất khả kháng • Tiền tệ • Cố vấn • Quốc gia đại sự',
        trial: {
          prompt: 'Cụm từ "Bất khả thi" có nghĩa là gì?',
          choices: ['Không thể thực hiện được', 'Rất dễ làm', 'Chắc chắn thành công'],
          answerIdx: 0,
          explanation: 'Rất uyên bác! "Bất" (Không), "Khả" (Có thể), "Thi" (Thực thi) = Không thể làm được.'
        }
      },

      // STAGE 5
      {
        id: 'vi_s5_hub',
        stage: 5,
        stageName: 'MỐC CHỦ ĐỀ 5: ĐỈNH CAO BẢN XỨ - PHONG BA BÃO TÁP TIẾNG VIỆT',
        isHub: true,
        title: 'Đền Thờ Boss Tối Thượng: Bậc Thầy Tiếng Việt',
        desc: 'Cột mốc vinh danh tối thượng',
        icon: 'fa-solid fa-crown',
        xpReward: 0,
        heartPenalty: 0,
        status: 'locked',
        parents: ['vi_s4_easy', 'vi_s4_normal', 'vi_s4_hard'],
        objectives: ['Khẳng định phản xạ và cảm nhận tinh tế đạt chuẩn bản ngữ'],
        preview: 'Phong ba bão táp không bằng ngữ pháp Việt Nam.',
        trial: {
          prompt: 'Câu tục ngữ "Phong ba bão táp không bằng ngữ pháp Việt Nam" muốn nói lên điều gì?',
          choices: ['Sự phong phú, đa dạng và tinh tế của tiếng Việt', 'Tiếng Việt rất dễ học', 'Thời tiết Việt Nam rất khắc nghiệt'],
          answerIdx: 0,
          explanation: 'Đúng vậy! Câu nói khẳng định sự biến hóa phong phú và linh hoạt của tiếng Việt.'
        }
      },
      {
        id: 'vi_s5_easy',
        stage: 5,
        stageName: 'MỐC CHỦ ĐỀ 5: ĐỈNH CAO BẢN XỨ - PHONG BA BÃO TÁP TIẾNG VIỆT',
        isHub: false,
        difficulty: 'easy',
        title: 'Tổng Hợp Luyện Đọc Diễn Cảm',
        desc: 'Nhấn nhá câu từ truyền cảm hứng',
        icon: 'fa-solid fa-masks-theater',
        xpReward: 5,
        heartPenalty: 1,
        status: 'locked',
        parents: ['vi_s5_hub'],
        objectives: ['Ngắt nhịp câu đúng chỗ theo ngữ pháp chuẩn'],
        preview: 'Đất nước bốn ngàn năm lịch sử hào hùng.',
        trial: {
          prompt: 'Trong câu thơ: "Đất nước / bốn nghìn năm / vất vả và gian lao", nhịp ngắt chuẩn là:',
          choices: ['2 / 3 / 5', '1 / 1 / 8', 'Không ngắt nhịp'],
          answerIdx: 0,
          explanation: 'Nhịp ngắt thơ trữ tình chuẩn xác và truyền cảm hứng.'
        }
      },
      {
        id: 'vi_s5_normal',
        stage: 5,
        stageName: 'MỐC CHỦ ĐỀ 5: ĐỈNH CAO BẢN XỨ - PHONG BA BÃO TÁP TIẾNG VIỆT',
        isHub: false,
        difficulty: 'normal',
        title: 'Nghệ Thuật Chơi Chữ & Đố Vui Dân Gian',
        desc: 'Giải các câu đố hiểm hóc của Trạng Quỳnh',
        icon: 'fa-solid fa-puzzle-piece',
        xpReward: 10,
        heartPenalty: 2,
        status: 'locked',
        parents: ['vi_s5_hub'],
        objectives: ['Hiểu các thủ pháp đồng âm dị nghĩa, nói lái, chơi chữ'],
        preview: 'Trùng trục như con chó thui, chín mắt chín mũi chín đuôi chín đầu.',
        trial: {
          prompt: 'Câu đố: "Vừa bằng một hạt đỗ, ăn giỗ cả làng" là con gì?',
          choices: ['Con ruồi (đậu vào mâm cỗ)', 'Con voi', 'Con kiến'],
          answerIdx: 0,
          explanation: 'Quá hóm hỉnh! Con ruồi nhỏ như hạt đỗ bay vào mâm giỗ ăn cỗ cả làng.'
        }
      },
      {
        id: 'vi_s5_hard',
        stage: 5,
        stageName: 'MỐC CHỦ ĐỀ 5: ĐỈNH CAO BẢN XỨ - PHONG BA BÃO TÁP TIẾNG VIỆT',
        isHub: false,
        difficulty: 'hard',
        title: 'Trảm Boss Rồng Thần: Bậc Thầy Bản Xứ Thuần Thục',
        desc: 'Thử thách hùng biện & làm chủ ngôn ngữ toàn diện',
        icon: 'fa-solid fa-dragon',
        xpReward: 15,
        heartPenalty: 3,
        status: 'locked',
        parents: ['vi_s5_hub'],
        objectives: ['Tự tin sử dụng tiếng Việt như người bản địa trong mọi hoàn cảnh'],
        preview: 'Vinh danh cao nhất của học viên Slanguage!',
        trial: {
          prompt: 'Từ "Dạ" trong tiếng Việt có thể biểu đạt những sắc thái nào?',
          choices: ['Vừa để vâng lời, vừa để dạ dày, vừa làm tiếng đệm lắng nghe', 'Chỉ có đúng một nghĩa duy nhất', 'Là tiếng kêu của động vật'],
          answerIdx: 0,
          explanation: 'XUẤT QUỶ NHẬP THẦN! Bạn am hiểu sự đa nghĩa vi diệu của tiếng Việt. Bạn đã chinh phục toàn bộ Dungeon Slanguage!'
        }
      }
    ]
  }
};

class SlanguageDungeonTree {
  private currentLang: 'ja' | 'en' | 'vi' = 'ja';
  private totalXP: number = 2450;
  private currentHearts: number = 5;
  private maxHearts: number = 5;
  private selectedNode: DungeonNode | null = null;
  private selectedChoiceIdx: number | null = null;

  // DOM Elements
  private treeSvgCanvas: SVGSVGElement | null = null;
  private treeNodesFlow: HTMLElement | null = null;
  private treeMainTitle: HTMLElement | null = null;
  private treeMainSubtitle: HTMLElement | null = null;
  private treeProgressFill: HTMLElement | null = null;
  private treeProgressPercent: HTMLElement | null = null;
  private treeNodesRatio: HTMLElement | null = null;
  private treeTotalXP: HTMLElement | null = null;
  private navXPVal: HTMLElement | null = null;
  private navHeartsVal: HTMLElement | null = null;
  private navHeartIcon: HTMLElement | null = null;

  // Modal Elements
  private nodeModalOverlay: HTMLElement | null = null;
  private modalNodeBadge: HTMLElement | null = null;
  private modalNodeTier: HTMLElement | null = null;
  private modalNodeTitle: HTMLElement | null = null;
  private modalNodeStatus: HTMLElement | null = null;
  private modalNodeXP: HTMLElement | null = null;
  private modalTrialBox: HTMLElement | null = null;
  private modalTrialPrompt: HTMLElement | null = null;
  private modalTrialChoices: HTMLElement | null = null;
  private modalTrialResult: HTMLElement | null = null;
  private modalTrialStepBadge: HTMLElement | null = null;
  private modalTrialProgressFill: HTMLElement | null = null;
  private currentQuestionIdx: number = 0;
  private currentTrialWrongCount: number = 0;
  private currentQuestionsList: DungeonTrial[] = [];
  private currentTrialPhase: 'idle' | 'checked' = 'idle';
  private btnExecuteTrial: HTMLButtonElement | null = null;
  private btnHealHeartsModal: HTMLButtonElement | null = null;
  private modalHubReadingBox: HTMLElement | null = null;
  private readingArticleTitle: HTMLElement | null = null;
  private readingArticleContent: HTMLElement | null = null;
  private reviveModalOverlay: HTMLElement | null = null;
  private reviveModalBody: HTMLElement | null = null;
  private lockedPrereqModal: HTMLElement | null = null;
  private lockedPrereqModalBody: HTMLElement | null = null;

  constructor() {
    if (localStorage.getItem('slanguage_is_logged_in') !== 'true') {
      window.location.replace('../login/index.html');
      return;
    }
    this.checkLessonAccess();
    this.initStorage();
    this.cacheDom();
    this.loadDungeonProgress();
    this.initEventListeners();
    this.renderTree();
  }

  private checkLessonAccess(): void {
    const rawLesson = localStorage.getItem('slanguage_selected_lesson');
    if (!rawLesson) {
      // Học viên chưa chọn session -> điều hướng ngay đến trang select-lesson
      window.location.replace('../select-lesson/index.html');
      return;
    }
    try {
      const parsed = JSON.parse(rawLesson);
      const titleEl = document.getElementById('activeLessonTitle');
      if (titleEl && parsed) {
        const num = parsed.numStr || '01';
        const title = parsed.title || 'Buổi học';
        titleEl.textContent = 'Session ' + num + ' - ' + title;
      }
    } catch (e) {
      localStorage.removeItem('slanguage_selected_lesson');
      window.location.replace('../select-lesson/index.html');
    }
  }

  private initStorage(): void {
    let savedLang = (localStorage.getItem('slanguage_active_language') || localStorage.getItem('slanguage_current_lang') || localStorage.getItem('slanguage_user_lang') || 'ja') as 'ja' | 'en' | 'vi';
    if (!['ja', 'en', 'vi'].includes(savedLang)) {
      savedLang = 'ja';
    }
    this.currentLang = savedLang;
    localStorage.setItem('slanguage_active_language', savedLang);
    localStorage.setItem('slanguage_current_lang', savedLang);
    localStorage.setItem('slanguage_user_lang', savedLang);

    // Hiển thị đầy đủ cả 3 ngôn ngữ trong header dropdown & roadmap tabs
    document.querySelectorAll<HTMLElement>('.lang-dropdown-item').forEach(item => {
      item.style.display = 'flex';
      item.classList.toggle('active', item.getAttribute('data-lang') === savedLang);
    });

    document.querySelectorAll<HTMLElement>('#treeLanguageTabs .tree-tab-btn').forEach(btn => {
      btn.style.display = 'inline-flex';
      btn.classList.toggle('active', btn.getAttribute('data-lang') === savedLang);
    });

    const savedXP = localStorage.getItem('slanguage_user_xp');
    if (savedXP !== null) {
      const clean = savedXP.replace(/[^0-9]/g, '');
      const parsed = parseInt(clean, 10);
      if (!isNaN(parsed)) {
        this.totalXP = parsed;
      }
    }
    const savedHearts = localStorage.getItem('slanguage_user_hearts');
    if (savedHearts !== null) {
      this.currentHearts = Math.max(0, Math.min(5, parseInt(savedHearts, 10)));
    } else {
      this.currentHearts = 5;
    }
  }

  private cacheDom(): void {
    this.treeSvgCanvas = document.getElementById('treeSvgCanvas') as unknown as SVGSVGElement;
    this.treeNodesFlow = document.getElementById('treeNodesFlow');
    this.treeMainTitle = document.getElementById('treeMainTitle');
    this.treeMainSubtitle = document.getElementById('treeMainSubtitle');
    this.treeProgressFill = document.getElementById('treeProgressFill');
    this.treeProgressPercent = document.getElementById('treeProgressPercent');
    this.treeNodesRatio = document.getElementById('treeNodesRatio');
    this.treeTotalXP = document.getElementById('treeTotalXP');
    this.navXPVal = document.getElementById('headerXPVal') || document.getElementById('navXPVal');
    this.navHeartsVal = document.getElementById('headerHeartsVal') || document.getElementById('navHeartsVal');
    this.navHeartIcon = document.querySelector('.stat-chip.hearts i') || document.getElementById('navHeartIcon');

    // Sync streak and user name
    const savedStreak = localStorage.getItem('slanguage_user_streak') || '18';
    const streakBadge = document.getElementById('headerStreakVal');
    if (streakBadge) {
      streakBadge.textContent = `${savedStreak} Ngày`;
    }

    const savedUserName = localStorage.getItem('slanguage_user_name') || 'Vua Xứ Thanh';
    document.querySelectorAll('.user-info-text .name').forEach(el => {
      el.textContent = savedUserName;
    });

    const syncStatsFromStorage = () => {
      const sXP = localStorage.getItem('slanguage_user_xp');
      if (sXP !== null) {
        const parsed = parseInt(sXP.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(parsed)) this.totalXP = parsed;
      }
      const sHearts = localStorage.getItem('slanguage_user_hearts');
      if (sHearts !== null) {
        this.currentHearts = Math.max(0, Math.min(5, parseInt(sHearts, 10)));
      }
      this.updateStatsDisplays();
      const sStreak = localStorage.getItem('slanguage_user_streak') || '18';
      const strEl = document.getElementById('headerStreakVal');
      if (strEl) strEl.textContent = `${sStreak} Ngày`;
      const dropStr = document.getElementById('dropdownStreakVal');
      if (dropStr) dropStr.textContent = `${sStreak} Ngày`;
      const sName = localStorage.getItem('slanguage_user_name') || 'Vua Xứ Thanh';
      document.querySelectorAll('.user-info-text .name, #dropdownUserName').forEach(el => {
        el.textContent = sName;
      });
    };
    window.addEventListener('storage', syncStatsFromStorage);
    window.addEventListener('focus', syncStatsFromStorage);
    window.addEventListener('pageshow', syncStatsFromStorage);
    window.addEventListener('slanguage_data_changed', syncStatsFromStorage);

    // Modal
    this.nodeModalOverlay = document.getElementById('nodeModalOverlay');
    this.modalNodeBadge = document.getElementById('modalNodeBadge');
    this.modalNodeTier = document.getElementById('modalNodeTier');
    this.modalNodeTitle = document.getElementById('modalNodeTitle');
    this.modalNodeStatus = document.getElementById('modalNodeStatus');
    this.modalNodeXP = document.getElementById('modalNodeXP');
    this.modalTrialBox = document.getElementById('modalTrialBox');
    this.modalTrialPrompt = document.getElementById('modalTrialPrompt');
    this.modalTrialChoices = document.getElementById('modalTrialChoices');
    this.modalTrialResult = document.getElementById('modalTrialResult');
    this.modalTrialStepBadge = document.getElementById('modalTrialStepBadge');
    this.modalTrialProgressFill = document.getElementById('modalTrialProgressFill');
    this.btnExecuteTrial = document.getElementById('btnExecuteTrial') as HTMLButtonElement;
    this.btnHealHeartsModal = document.getElementById('btnHealHeartsModal') as HTMLButtonElement;
    this.modalHubReadingBox = document.getElementById('modalHubReadingBox');
    this.readingArticleTitle = document.getElementById('readingArticleTitle');
    this.readingArticleContent = document.getElementById('readingArticleContent');
    this.reviveModalOverlay = document.getElementById('reviveModalOverlay');
    this.reviveModalBody = document.getElementById('reviveModalBody');
    if (this.reviveModalOverlay) {
      this.reviveModalOverlay.addEventListener('click', (e) => {
        if (e.target === this.reviveModalOverlay) this.closeReviveModal();
      });
    }

    this.lockedPrereqModal = document.getElementById('lockedPrereqModal');
    this.lockedPrereqModalBody = document.getElementById('lockedPrereqModalBody');
    if (this.lockedPrereqModal) {
      this.lockedPrereqModal.addEventListener('click', (e) => {
        if (e.target === this.lockedPrereqModal) this.closeLockedPrereqModal();
      });
    }

    this.updateStatsDisplays();
  }

  private initEventListeners(): void {
    const isLoggedIn = localStorage.getItem('slanguage_is_logged_in') === 'true';
    if (isLoggedIn) {
      document.body.classList.add('user-authenticated');
      document.body.classList.remove('user-guest');
    } else {
      document.body.classList.add('user-guest');
      document.body.classList.remove('user-authenticated');
    }

    const logoutBtn = document.getElementById('navLogoutItem');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.setItem('slanguage_is_logged_in', 'false');
      });
    }

    // Language & User Dropdowns
    const langDropdownBtn = document.getElementById('langDropdownBtn');
    const langDropdown = document.getElementById('langDropdown');
    const userDropdownBtn = document.getElementById('userDropdownBtn');
    const userDropdown = document.getElementById('userDropdown');

    if (langDropdownBtn && langDropdown) {
      langDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        langDropdown.classList.toggle('active');
        langDropdown.classList.toggle('open');
        if (userDropdown) {
          userDropdown.classList.remove('active');
          userDropdown.classList.remove('open');
        }
      });
    }

    if (userDropdownBtn && userDropdown) {
      userDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('active');
        userDropdown.classList.toggle('open');
        if (langDropdown) {
          langDropdown.classList.remove('active');
          langDropdown.classList.remove('open');
        }
      });
    }

    document.addEventListener('click', (e) => {
      const target = e.target as Node;
      if (langDropdown && !langDropdown.contains(target)) {
        langDropdown.classList.remove('active');
        langDropdown.classList.remove('open');
      }
      if (userDropdown && !userDropdown.contains(target)) {
        userDropdown.classList.remove('active');
        userDropdown.classList.remove('open');
      }
    });

    // Language Dropdown Items
    document.querySelectorAll('.lang-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const lang = item.getAttribute('data-lang') as 'ja' | 'en' | 'vi';
        if (lang) this.switchLanguage(lang);
      });
    });

    // Tree Tabs
    document.querySelectorAll('#treeLanguageTabs .tree-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang') as 'ja' | 'en' | 'vi';
        if (lang) this.switchLanguage(lang);
      });
    });

    // Modal close
    const btnCloseModal = document.getElementById('btnCloseNodeModal');
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => this.closeModal());
    }
    if (this.nodeModalOverlay) {
      this.nodeModalOverlay.addEventListener('click', (e) => {
        if (e.target === this.nodeModalOverlay) this.closeModal();
      });
    }

    // Modal Trial action
    if (this.btnExecuteTrial) {
      this.btnExecuteTrial.addEventListener('click', () => this.handleTrialSubmission());
    }

    // Modal Heal action
    // Modal Heal action removed per requirements

    // Window resize -> Redraw winding SVG branches
    window.addEventListener('resize', () => {
      this.drawConnectingBranches();
    });

    this.bindPageTransitions();
  }

  public switchLanguage(lang: 'ja' | 'en' | 'vi'): void {
    if (!['ja', 'en', 'vi'].includes(lang)) return;

    this.currentLang = lang;
    localStorage.setItem('slanguage_active_language', lang);
    localStorage.setItem('slanguage_current_lang', lang);
    localStorage.setItem('slanguage_user_lang', lang);

    const rawUser = localStorage.getItem('slanguage_current_user');
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser);
        u.targetLanguage = lang;
        localStorage.setItem('slanguage_current_user', JSON.stringify(u));
      } catch (e) {}
    }

    const rawDb = localStorage.getItem('slanguage_users_db');
    if (rawDb) {
      try {
        const db = JSON.parse(rawDb);
        const userEmail = localStorage.getItem('slanguage_user_email');
        if (Array.isArray(db) && userEmail) {
          const uIdx = db.findIndex((x: any) => x.email === userEmail);
          if (uIdx !== -1) {
            db[uIdx].targetLanguage = lang;
            localStorage.setItem('slanguage_users_db', JSON.stringify(db));
          }
        }
      } catch (e) {}
    }

    window.dispatchEvent(new CustomEvent('slanguage_data_changed'));

    const langNames: Record<string, string> = {
      ja: 'Tiếng Nhật (JLPT N5)',
      en: 'English (IELTS & Giao tiếp)',
      vi: 'Tiếng Việt (Bản Xứ & Ứng Dụng)'
    };
    const flagImgs: Record<string, string> = {
      ja: '../assets/flags/flag-jp.png',
      en: '../assets/flags/flag-en.png',
      vi: '../assets/flags/flag-vn.png'
    };

    const currentLangLabel = document.getElementById('currentLangLabel');
    const currentLangFlag = document.getElementById('currentLangFlag') as HTMLImageElement;
    if (currentLangLabel && langNames[lang]) currentLangLabel.textContent = langNames[lang];
    if (currentLangFlag && flagImgs[lang]) {
      currentLangFlag.src = flagImgs[lang];
      currentLangFlag.alt = langNames[lang];
    }

    document.querySelectorAll('.lang-dropdown-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-lang') === lang);
    });

    document.querySelectorAll('#treeLanguageTabs .tree-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
    });

    this.loadDungeonProgress();
    this.renderTree();
    this.showToast(`Đã mở khóa Dungeon: ${langNames[lang]}`, flagImgs[lang]);
  }

  private updateStatsDisplays(): void {
    if (this.navXPVal) this.navXPVal.textContent = `${this.totalXP.toLocaleString()} XP`;
    const dropXP = document.getElementById('dropdownXPVal');
    if (dropXP) dropXP.textContent = `${this.totalXP.toLocaleString()} XP`;
    if (this.treeTotalXP) this.treeTotalXP.textContent = `${this.totalXP.toLocaleString()} XP`;
    if (this.navHeartsVal) this.navHeartsVal.textContent = `${this.currentHearts}/${this.maxHearts}`;
    const dropHearts = document.getElementById('dropdownHeartsVal');
    if (dropHearts) dropHearts.textContent = `${this.currentHearts}/${this.maxHearts}`;
    if (this.navHeartIcon) {
      if (this.currentHearts === 0) {
        this.navHeartIcon.style.color = '#64748b';
        this.navHeartIcon.style.animation = 'none';
      } else {
        this.navHeartIcon.style.color = 'var(--color-crimson, #DC143C)';
      }
    }
  }

  private renderTree(): void {
    const dungeon = dungeonDB[this.currentLang];
    if (!dungeon || !this.treeNodesFlow) return;

    if (this.treeMainTitle) {
      if (this.currentLang === 'ja') {
        this.treeMainTitle.textContent = 'Khám Phá Tiếng Nhật: Hành Trình Chinh Phục Ngôn Ngữ Xứ Phù Tang';
      } else {
        this.treeMainTitle.textContent = dungeon.dungeonTitle;
      }
    }
    if (this.treeMainSubtitle) {
      if (this.currentLang === 'ja') {
        this.treeMainSubtitle.innerHTML = `
          <p class="intro-lead">
            Tiếng Nhật là một ngôn ngữ giàu cảm xúc và tinh tế, kết hợp hài hòa giữa 3 hệ chữ viết: <strong>Hiragana</strong> (chữ mềm thuần Nhật), <strong>Katakana</strong> (chữ cứng cho từ mượn quốc tế) và <strong>Kanji</strong> (Hán tự biểu ý thâm sâu). Với trật tự câu SOV linh hoạt, hệ thống trợ từ chặt chẽ cùng các cấp bậc kính ngữ chuẩn mực, tiếng Nhật phản ánh đậm nét văn hóa khiêm nhường và trọng lễ nghi của xứ sở mặt trời mọc.
          </p>
          <div class="intro-pillars-grid">
            <div class="pillar-item">
              <i class="fa-solid fa-pen-nib"></i>
              <div>
                <strong>3 Hệ Chữ Viết</strong>
                <span>Hiragana mềm mại, Katakana dứt khoát & Kanji biểu ý</span>
              </div>
            </div>
            <div class="pillar-item">
              <i class="fa-solid fa-shapes"></i>
              <div>
                <strong>Cấu Trúc SOV</strong>
                <span>Động từ ở cuối câu, kết nối chặt chẽ bằng trợ từ</span>
              </div>
            </div>
            <div class="pillar-item">
              <i class="fa-solid fa-award"></i>
              <div>
                <strong>5 Tầng Chinh Phục</strong>
                <span>Từ sơ cấp N5 đến đàm thoại thực chiến lưu loát</span>
              </div>
            </div>
          </div>
        `;
      } else {
        this.treeMainSubtitle.innerHTML = `<p class="intro-lead">${dungeon.dungeonSubtitle}</p>`;
      }
    }

    const totalRooms = dungeon.nodes.filter(n => !n.isHub).length;
    const masteredRooms = dungeon.nodes.filter(n => !n.isHub && n.status === 'mastered').length;
    const progressPercent = Math.round((masteredRooms / totalRooms) * 100);

    if (this.treeProgressFill) this.treeProgressFill.style.width = `${progressPercent}%`;
    if (this.treeProgressPercent) this.treeProgressPercent.textContent = `${progressPercent}%`;
    if (this.treeNodesRatio) this.treeNodesRatio.textContent = `${masteredRooms} / ${totalRooms} Ải đã vượt`;

    // Group nodes by stage (1 to 5)
    const stages: Record<number, { hub?: DungeonNode; branches: DungeonNode[] }> = {};
    for (let i = 1; i <= 5; i++) {
      stages[i] = { branches: [] };
    }

    dungeon.nodes.forEach(node => {
      if (node.isHub) {
        stages[node.stage].hub = node;
      } else {
        stages[node.stage].branches.push(node);
      }
    });

    this.treeNodesFlow.innerHTML = '';

    // Render from Stage 1 to 5 (column-reverse places Stage 1 at bottom, Stage 5 Boss at top)
    for (let s = 1; s <= 5; s++) {
      const stageData = stages[s];
      const stageEl = document.createElement('div');
      stageEl.className = 'dungeon-stage-section';
      stageEl.setAttribute('data-stage', s.toString());

      // Stage Header Pill
      const stagePill = document.createElement('div');
      stagePill.className = 'dungeon-stage-pill';
      stagePill.innerHTML = `<i class="fa-solid fa-dungeon"></i> TẦNG ${s}: ${stageData.hub ? stageData.hub.stageName : `CHỦ ĐỀ ${s}`}`;
      stageEl.appendChild(stagePill);

      // 1. Chamber Hub Node
      if (stageData.hub) {
        const hubEl = this.createNodeElement(stageData.hub);
        hubEl.classList.add('dungeon-hub-card');
        stageEl.appendChild(hubEl);
      }

      // 2. Branches Row (Easy, Normal, Hard)
      const branchesRow = document.createElement('div');
      branchesRow.className = 'dungeon-branches-row';

      // Sort: easy -> normal -> hard
      const diffOrder: Record<string, number> = { easy: 1, normal: 2, hard: 3 };
      stageData.branches.sort((a, b) => (diffOrder[a.difficulty || ''] || 0) - (diffOrder[b.difficulty || ''] || 0));

      stageData.branches.forEach(branch => {
        const nodeEl = this.createNodeElement(branch);
        branchesRow.appendChild(nodeEl);
      });

      stageEl.appendChild(branchesRow);
      this.treeNodesFlow.appendChild(stageEl);
    }

    requestAnimationFrame(() => {
      setTimeout(() => {
        this.drawConnectingBranches();
      }, 70);
    });
  }

  private createNodeElement(node: DungeonNode): HTMLElement {
    const el = document.createElement('div');
    const diffClass = node.difficulty ? `diff-${node.difficulty}` : 'hub-node';
    el.className = `dungeon-node ${node.status} ${diffClass} ${node.isHub ? 'is-hub' : ''}`;
    el.id = `node_${node.id}`;

    let statusBadgeHtml = '';
    let statusText = 'Đang khóa 🔒';
    if (node.status === 'mastered') {
      statusBadgeHtml = `<div class="node-status-badge mastered"><i class="fa-solid fa-check"></i></div>`;
      statusText = node.isHub ? 'Đã đọc bài 📖' : 'Đã vượt ải 🌟';
    } else if (node.status === 'current') {
      statusBadgeHtml = `<div class="node-status-badge current"><i class="fa-solid fa-play"></i></div>`;
      statusText = node.isHub ? 'Đang đọc 📖' : 'Đang mở ⚡';
    } else if (node.status === 'available') {
      statusBadgeHtml = `<div class="node-status-badge available"><i class="fa-solid fa-unlock"></i></div>`;
      statusText = node.isHub ? 'Sẵn sàng đọc 📖' : 'Sẵn sàng khiêu chiến ⚔️';
    } else {
      statusBadgeHtml = `<div class="node-status-badge locked"><i class="fa-solid fa-lock"></i></div>`;
      statusText = 'Đang khóa 🔒';
    }

    // Difficulty Pill
    let diffPillHtml = '';
    let diffLabel = 'Mốc Chủ Đề';
    if (node.isHub) {
      diffPillHtml = `<span class="diff-chip chip-hub"><i class="fa-solid fa-book-open"></i> MỐC ${node.stage}</span>`;
      diffLabel = `MỐC CHỦ ĐỀ ${node.stage} (BÀI ĐỌC)`;
    } else if (node.difficulty === 'easy') {
      diffPillHtml = `<span class="diff-chip chip-easy"><i class="fa-solid fa-feather"></i> DỄ</span>`;
      diffLabel = 'Độ khó: DỄ (+5 XP / -1 ❤️)';
    } else if (node.difficulty === 'normal') {
      diffPillHtml = `<span class="diff-chip chip-normal"><i class="fa-solid fa-shield-halved"></i> VỪA</span>`;
      diffLabel = 'Độ khó: BÌNH THƯỜNG (+10 XP / -2 ❤️)';
    } else if (node.difficulty === 'hard') {
      diffPillHtml = `<span class="diff-chip chip-hard"><i class="fa-solid fa-skull"></i> KHÓ</span>`;
      diffLabel = 'Độ khó: KHÓ (+15 XP / -3 ❤️)';
    }

    // Compact Stakes Chip on Card
    let compactStakesHtml = '';
    if (node.isHub) {
      compactStakesHtml = `<div class="node-compact-stakes hub-mode"><span class="stake-reading-tag"><i class="fa-solid fa-book-open"></i> Bài đọc chủ đề</span></div>`;
    } else if (node.difficulty === 'easy') {
      compactStakesHtml = `<div class="node-compact-stakes"><span class="stake-win">+5 XP</span><span class="stake-loss">-1 ❤️</span></div>`;
    } else if (node.difficulty === 'normal') {
      compactStakesHtml = `<div class="node-compact-stakes"><span class="stake-win">+10 XP</span><span class="stake-loss">-2 ❤️</span></div>`;
    } else if (node.difficulty === 'hard') {
      compactStakesHtml = `<div class="node-compact-stakes"><span class="stake-win">+15 XP</span><span class="stake-loss">-3 ❤️</span></div>`;
    } else {
      compactStakesHtml = `<div class="node-compact-stakes hub-mode"><span class="stake-reading-tag"><i class="fa-solid fa-book-open"></i> Bài đọc chủ đề</span></div>`;
    }

    // Rich Hover Tooltip (Revealed when hovering on card or icon)
    let tooltipStakesHtml = '';
    let clickHint = '<i class="fa-solid fa-hand-pointer"></i> Nhấn để mở phòng thử thách';
    if (node.status === 'locked') {
      if (node.isHub) {
        clickHint = `<i class="fa-solid fa-lock"></i> Khóa: Hoàn thành ít nhất 1 bài trắc nghiệm Mốc ${node.stage - 1}`;
      } else {
        const hub = dungeonDB[this.currentLang]?.nodes.find(n => n.stage === node.stage && n.isHub);
        if (hub && hub.status !== 'mastered') {
          clickHint = `<i class="fa-solid fa-lock"></i> Khóa: Đọc xong bài đọc Mốc ${node.stage} để mở`;
        } else if (node.difficulty === 'normal') {
          clickHint = `<i class="fa-solid fa-lock"></i> Khóa: Hoàn thành bài Dễ trước`;
        } else if (node.difficulty === 'hard') {
          clickHint = `<i class="fa-solid fa-lock"></i> Khóa: Hoàn thành bài Bình thường trước`;
        } else {
          clickHint = `<i class="fa-solid fa-lock"></i> Chưa mở khóa`;
        }
      }
    } else if (node.isHub) {
      tooltipStakesHtml = `
        <div class="tooltip-stakes-bar hub-mode">
          <span class="stake-info" style="color: #38bdf8; font-weight:700;"><i class="fa-solid fa-book-open"></i> Bài đọc chủ đề (Không tính thưởng / phạt)</span>
        </div>`;
      clickHint = node.status === 'mastered'
        ? '<i class="fa-solid fa-book-reader"></i> Nhấn để đọc lại bài chuyên đề'
        : '<i class="fa-solid fa-book-reader"></i> Nhấn để mở bài đọc chuyên đề';
    } else {
      tooltipStakesHtml = `
        <div class="tooltip-stakes-bar">
          <span class="stake-win"><i class="fa-solid fa-trophy"></i> Thắng: +${node.xpReward} XP</span>
          ${node.heartPenalty > 0 ? `<span class="stake-loss"><i class="fa-solid fa-heart-crack"></i> Thua: -${node.heartPenalty} ❤️</span>` : ''}
        </div>`;
      if (node.status === 'mastered') {
        clickHint = '<i class="fa-solid fa-rotate-right"></i> Nhấn để khiêu chiến lại';
      }
    }

    const tooltipHtml = `
      <div class="node-hover-tooltip">
        <div class="tooltip-header">
          <span class="tooltip-stage-badge">${node.stageName}</span>
          <span class="tooltip-status-text ${node.status}">${statusText}</span>
        </div>
        <div class="tooltip-title">${node.title}</div>
        <div class="tooltip-desc">${node.desc}</div>
        ${tooltipStakesHtml}
        <div class="tooltip-click-hint">
          ${clickHint}
        </div>
      </div>
    `;

    // Only icon, difficulty badge, and mini stakes directly visible on card!
    el.innerHTML = `
      <div class="dungeon-node-card-inner">
        <div class="node-header-row">
          ${diffPillHtml}
          ${statusBadgeHtml}
        </div>
        <div class="node-icon-wrapper">
          <div class="node-icon-circle">
            <i class="${node.icon}"></i>
          </div>
        </div>
        ${compactStakesHtml}
      </div>
      ${tooltipHtml}
    `;

    el.addEventListener('click', () => {
      if (node.status === 'locked') {
        this.promptLockedNodeModal(node);
        return;
      }
      this.openModal(node);
    });

    return el;
  }

  private drawConnectingBranches(): void {
    if (!this.treeSvgCanvas) return;
    const dungeon = dungeonDB[this.currentLang];
    if (!dungeon) return;

    this.treeSvgCanvas.innerHTML = '';
    const canvasRect = this.treeSvgCanvas.getBoundingClientRect();
    if (canvasRect.width === 0 || canvasRect.height === 0) return;

    this.treeSvgCanvas.setAttribute('width', `${canvasRect.width}`);
    this.treeSvgCanvas.setAttribute('height', `${canvasRect.height}`);

    dungeon.nodes.forEach(node => {
      if (!node.parents || node.parents.length === 0) return;

      const childEl = document.getElementById(`node_${node.id}`);
      if (!childEl) return;
      const childRect = childEl.getBoundingClientRect();
      const childX = childRect.left + childRect.width / 2 - canvasRect.left;
      const childY = childRect.top + childRect.height / 2 - canvasRect.top;

      node.parents.forEach(parentId => {
        const parentEl = document.getElementById(`node_${parentId}`);
        if (!parentEl) return;

        const parentRect = parentEl.getBoundingClientRect();
        const parentX = parentRect.left + parentRect.width / 2 - canvasRect.left;
        const parentY = parentRect.top + parentRect.height / 2 - canvasRect.top;

        // Synchronize line color:
        // If child is a branch (easy/normal/hard), use child.difficulty!
        // If child is next Stage Hub, use parent's difficulty!
        const parentNode = dungeon.nodes.find(n => n.id === parentId);
        const effectiveDifficulty: DungeonDifficulty = (node.difficulty || parentNode?.difficulty || 'normal') as DungeonDifficulty;

        // Create Winding Serpentine Curve
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = this.calculateWindingPath(parentX, parentY, childX, childY, effectiveDifficulty);
        path.setAttribute('d', d);

        // All lines are DASHED and color-coded
        path.classList.add('dungeon-winding-path');
        if (effectiveDifficulty === 'easy') {
          path.classList.add('path-easy');
        } else if (effectiveDifficulty === 'normal') {
          path.classList.add('path-normal');
        } else if (effectiveDifficulty === 'hard') {
          path.classList.add('path-hard');
        }

        if (node.status === 'mastered') {
          path.classList.add('branch-mastered');
        } else if (node.status === 'locked') {
          path.classList.add('branch-locked');
        } else {
          path.classList.add('branch-active');
        }

        this.treeSvgCanvas!.appendChild(path);
      });
    });
  }

  
  private calculateWindingPath(
    x0: number, 
    y0: number, 
    x1: number, 
    y1: number, 
    difficulty?: DungeonDifficulty
  ): string {
    const dx = x1 - x0;
    const dy = y1 - y0;

    // Amplitude of the serpentine undulation
    let amp = 35;
    if (difficulty === 'easy') amp = -45;
    else if (difficulty === 'hard') amp = 45;
    else if (difficulty === 'normal') amp = 25;
    else amp = 20;

    const cp1x = x0 + dx * 0.15 + amp * 0.8;
    const cp1y = y0 + dy * 0.25;

    const midX = x0 + dx * 0.5 - amp * 0.6;
    const midY = y0 + dy * 0.5;

    const cp2x = x0 + dx * 0.85 + amp * 0.5;
    const cp2y = y0 + dy * 0.75;

    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} ` +
           `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ` +
           `${(midX - amp * 0.2).toFixed(1)} ${midY.toFixed(1)}, ` +
           `${midX.toFixed(1)} ${midY.toFixed(1)} ` +
           `S ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ` +
           `${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }

  private openModal(node: DungeonNode): void {
    if (!node.isHub && this.currentHearts === 0) {
      this.promptReviveWithPotion(() => {
        this.openModal(node);
      });
      return;
    }

    // Tách phần bài đọc chuyên đề thành trang riêng biệt giống như trang làm quiz
    if (node.isHub) {
      const readingData = {
        node: {
          id: node.id,
          stage: node.stage,
          stageName: node.stageName,
          title: node.title,
          desc: node.desc,
          icon: node.icon,
          status: node.status,
          isHub: true,
          readingArticle: node.readingArticle
        },
        lang: this.currentLang
      };
      localStorage.setItem('slanguage_active_reading_node', JSON.stringify(readingData));
      window.location.href = `../reading/index.html?nodeId=${encodeURIComponent(node.id)}&lang=${this.currentLang}`;
      return;
    }

    // Tách phần trả lời câu hỏi thành trang riêng full screen
    if (!node.isHub) {
      const trialData = {
        node: {
          id: node.id,
          stage: node.stage,
          stageName: node.stageName,
          title: node.title,
          desc: node.desc,
          icon: node.icon,
          difficulty: node.difficulty,
          xpReward: node.xpReward,
          heartPenalty: node.heartPenalty,
          status: node.status,
          isHub: false
        },
        trials: this.getTrialsForNode(node),
        lang: this.currentLang
      };
      localStorage.setItem('slanguage_active_quiz_node', JSON.stringify(trialData));
      window.location.href = `../quiz/index.html?nodeId=${encodeURIComponent(node.id)}&lang=${this.currentLang}`;
      return;
    }

    this.selectedNode = node;
    this.selectedChoiceIdx = null;
    if (!this.nodeModalOverlay) return;

    if (this.modalNodeBadge) {
      this.modalNodeBadge.innerHTML = `<i class="${node.icon}"></i>`;
    }
    if (this.modalNodeTier) {
      this.modalNodeTier.textContent = node.stageName;
    }
    if (this.modalNodeTitle) {
      this.modalNodeTitle.textContent = node.title;
    }

    // Modal Status Tag
    if (this.modalNodeStatus) {
      if (node.status === 'mastered') {
        this.modalNodeStatus.textContent = node.isHub ? 'Đã hoàn thành bài đọc 📖' : 'Đã hoàn thành 🌟';
        this.modalNodeStatus.className = 'node-tag status-tag mastered';
      } else if (node.status === 'locked') {
        this.modalNodeStatus.textContent = 'Đang khóa 🔒';
        this.modalNodeStatus.className = 'node-tag status-tag locked';
      } else {
        this.modalNodeStatus.textContent = node.isHub ? 'Sẵn sàng đọc bài 📖' : 'Sẵn sàng khiêu chiến ⚔️';
        this.modalNodeStatus.className = 'node-tag status-tag available';
      }
    }

    if (node.isHub) {
      // HUB MODE: READING ARTICLE (NO XP, NO PENALTY, NO QUIZ CHOICES)
      if (this.modalTrialBox) this.modalTrialBox.style.display = 'none';
      if (this.btnHealHeartsModal) this.btnHealHeartsModal.style.display = 'none';

      if (this.modalNodeXP) {
        this.modalNodeXP.innerHTML = `
          <span style="color: #38bdf8; font-weight:700;"><i class="fa-solid fa-book-open"></i> Bài Đọc Chuyên Đề: Tiếp thu kiến thức cốt lõi (Không thưởng / phạt)</span>
        `;
      }

      if (this.modalHubReadingBox) {
        this.modalHubReadingBox.style.display = 'block';
        if (this.readingArticleTitle) {
          this.readingArticleTitle.textContent = node.readingArticle?.title || node.title;
        }
        if (this.readingArticleContent) {
          const article = node.readingArticle;
          if (article) {
            const sectionsHtml = article.sections.map(sec => `
              <div class="reading-section-box">
                <h4 class="reading-section-heading">
                  ${sec.icon ? `<i class="${sec.icon}"></i>` : ''} ${sec.heading}
                </h4>
                <p class="reading-section-text">${sec.text.replace(/\n/g, '<br>')}</p>
                ${sec.callout ? `<div class="reading-callout-box"><i class="fa-solid fa-lightbulb"></i> <span>${sec.callout}</span></div>` : ''}
              </div>
            `).join('');

            this.readingArticleContent.innerHTML = `
              <p class="reading-lead-p">${article.lead}</p>
              ${sectionsHtml}
              <div class="reading-takeaway-box">
                <i class="fa-solid fa-gem"></i>
                <div>
                  <strong>Điểm Cốt Lõi:</strong>
                  <p>${article.keyTakeaway}</p>
                </div>
              </div>
            `;
          } else {
            this.readingArticleContent.innerHTML = `<p class="reading-lead-p">${node.desc}</p>`;
          }
        }
      }

      if (this.btnExecuteTrial) {
        this.btnExecuteTrial.disabled = false;
        this.btnExecuteTrial.classList.remove('complete-action');
        if (node.status === 'locked') {
          this.btnExecuteTrial.disabled = true;
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-lock"></i> Mốc chủ đề chưa mở khóa`;
          this.btnExecuteTrial.style.opacity = '0.5';
        } else if (node.status === 'mastered') {
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đã hoàn thành bài đọc (Đóng lại)`;
          this.btnExecuteTrial.style.opacity = '1';
        } else {
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-book-reader"></i> Đã Đọc Xong & Hoàn Thành Chủ Đề 🌟`;
          this.btnExecuteTrial.style.opacity = '1';
        }
      }
    } else {
      // CHALLENGE MODE: MULTI-QUESTION TRIAL PROGRESSION
      if (this.modalHubReadingBox) this.modalHubReadingBox.style.display = 'none';
      if (this.modalTrialBox) this.modalTrialBox.style.display = 'block';
      if (this.btnHealHeartsModal) this.btnHealHeartsModal.style.display = 'none';

      // Modal XP Tag & Stakes display
      if (this.modalNodeXP) {
        let diffText = 'Dễ';
        if (node.difficulty === 'normal') diffText = 'Bình thường';
        else if (node.difficulty === 'hard') diffText = 'Khó';

        this.modalNodeXP.innerHTML = `
          <span style="font-weight:700;">Độ khó: ${diffText}</span> •
          <span style="color:#22c55e;">+${node.xpReward} XP nếu đúng toàn bộ</span> •
          <span style="color:#ef4444;">-${node.heartPenalty} Máu khi hoàn thành nếu sai</span>
        `;
      }

      // Initialize question sequence
      this.currentQuestionIdx = 0;
      this.currentTrialWrongCount = 0;
      this.currentQuestionsList = this.getTrialsForNode(node);
      this.renderCurrentQuestion();
    }

    this.nodeModalOverlay.classList.add('active');
  }

  private renderCurrentQuestion(): void {
    if (!this.selectedNode) return;
    const node = this.selectedNode;
    const totalQ = this.currentQuestionsList.length;
    const qIdx = this.currentQuestionIdx;
    const currentTrial = this.currentQuestionsList[qIdx];
    this.selectedChoiceIdx = null;
    this.currentTrialPhase = 'idle';

    // Update Step Badge & Progress Bar
    if (this.modalTrialStepBadge) {
      this.modalTrialStepBadge.textContent = `Câu ${qIdx + 1}/${totalQ}`;
    }
    if (this.modalTrialProgressFill) {
      this.modalTrialProgressFill.style.width = `${((qIdx + 1) / totalQ) * 100}%`;
    }

    // Hide previous result feedback
    if (this.modalTrialResult) {
      this.modalTrialResult.style.display = 'none';
      this.modalTrialResult.textContent = '';
    }

    // Render Question Prompt
    if (this.modalTrialPrompt) {
      this.modalTrialPrompt.textContent = currentTrial.prompt;
    }

    // Render Choices
    if (this.modalTrialChoices) {
      this.modalTrialChoices.innerHTML = '';
      currentTrial.choices.forEach((choice, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dungeon-choice-btn';
        btn.innerHTML = `<span class="choice-num">${String.fromCharCode(65 + idx)}</span> <span>${choice}</span>`;
        btn.addEventListener('click', () => {
          if (this.currentTrialPhase === 'checked') return;
          this.modalTrialChoices!.querySelectorAll('.dungeon-choice-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          this.selectedChoiceIdx = idx;
          if (this.btnExecuteTrial) this.btnExecuteTrial.disabled = false;
        });
        this.modalTrialChoices!.appendChild(btn);
      });
    }

    // Initial Button State for this question: "Kiểm tra" (disabled cho đến khi chọn đáp án)
    if (this.btnExecuteTrial) {
      this.btnExecuteTrial.disabled = true;
      this.btnExecuteTrial.className = 'btn-trial-action check-action';
      if (node.status === 'locked') {
        this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-lock"></i> Ải chưa mở khóa`;
        this.btnExecuteTrial.style.opacity = '0.5';
      } else {
        this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Kiểm tra`;
        this.btnExecuteTrial.style.opacity = '1';
      }
    }
  }

  private closeModal(): void {
    if (this.nodeModalOverlay) {
      this.nodeModalOverlay.classList.remove('active');
    }
    this.selectedNode = null;
    this.selectedChoiceIdx = null;
    this.currentQuestionIdx = 0;
    this.currentTrialWrongCount = 0;
    this.currentTrialPhase = 'idle';
  }

  private handleTrialSubmission(): void {
    if (!this.selectedNode) return;
    const node = this.selectedNode;

    // HUB READING COMPLETION
    if (node.isHub) {
      if (node.status !== 'mastered') {
        node.status = 'mastered';
        this.unlockNextNodes(node);
        this.updateStatsDisplays();
        this.renderTree();
        this.showToast(`Bạn đã hoàn thành bài đọc Mốc ${node.stage}! Thử thách mức độ Dễ đã sẵn sàng khiêu chiến.`);
      }
      this.closeModal();
      return;
    }

    // ================= BƯỚC 1: NGƯỜI DÙNG BẤM "KIỂM TRA" =================
    if (this.currentTrialPhase === 'idle') {
      if (this.selectedChoiceIdx === null) {
        alert('Vui lòng chọn một đáp án trước khi kiểm tra!');
        return;
      }

      this.currentTrialPhase = 'checked';
      const currentTrial = this.currentQuestionsList[this.currentQuestionIdx];
      const isCorrect = (this.selectedChoiceIdx === currentTrial.answerIdx);
      const isLastQ = (this.currentQuestionIdx === this.currentQuestionsList.length - 1);

      // Khóa tương tác các đáp án để cố định câu trả lời
      const allChoices = this.modalTrialChoices?.querySelectorAll('.dungeon-choice-btn');
      if (allChoices) {
        allChoices.forEach(b => (b as HTMLElement).style.pointerEvents = 'none');
      }

      if (this.modalTrialResult) {
        this.modalTrialResult.style.display = 'block';
      }

      if (isCorrect) {
        // Nổi bật đáp án đúng màu xanh lá
        if (allChoices && allChoices[this.selectedChoiceIdx]) {
          allChoices[this.selectedChoiceIdx].classList.add('choice-correct');
        }

        this.modalTrialResult!.className = 'modal-trial-result success';
        this.modalTrialResult!.innerHTML = `
          <div class="result-icon"><i class="fa-solid fa-circle-check"></i></div>
          <div class="result-text">
            <strong>CHÍNH XÁC!</strong>
            <p>${currentTrial.explanation || 'Rất xuất sắc! Bấm nút bên dưới để tiếp tục.'}</p>
          </div>
        `;
      } else {
        this.currentTrialWrongCount++;

        // Nổi bật đáp án sai màu đỏ & hiện đáp án đúng màu xanh lá
        if (allChoices) {
          if (allChoices[this.selectedChoiceIdx]) {
            allChoices[this.selectedChoiceIdx].classList.add('choice-wrong');
          }
          if (allChoices[currentTrial.answerIdx]) {
            allChoices[currentTrial.answerIdx].classList.add('choice-correct');
          }
        }

        // Máu chỉ trừ khi người dùng đã hoàn thành bộ câu hỏi trắc nghiệm theo mức độ (không trừ tại từng câu)
        this.modalTrialResult!.className = 'modal-trial-result error';
        this.modalTrialResult!.innerHTML = `
          <div class="result-icon"><i class="fa-solid fa-circle-xmark"></i></div>
          <div class="result-text">
            <strong>CHƯA CHÍNH XÁC!</strong>
            <p>Đáp án đúng là: <strong>${currentTrial.choices[currentTrial.answerIdx]}</strong>.<br>${currentTrial.explanation || 'Hãy ghi nhớ lý do để vận dụng vào câu tiếp theo!'}</p>
          </div>
        `;
      }

      // Đổi nút: Nếu câu cuối -> "Hoàn thành", nếu chưa cuối -> "Tiếp theo"
      if (this.btnExecuteTrial) {
        this.btnExecuteTrial.disabled = false;
        if (isLastQ) {
          // CHẠM MỐC CÂU HỎI CUỐI CÙNG -> ĐỔI NÚT SANG HOÀN THÀNH
          this.btnExecuteTrial.className = 'btn-trial-action complete-action';
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-circle-check"></i> Hoàn thành`;
        } else {
          // CÁC CÂU HỎI TRƯỚC -> ĐỔI NÚT SANG TIẾP THEO
          this.btnExecuteTrial.className = 'btn-trial-action next-action';
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-arrow-right"></i> Tiếp theo`;
        }
      }
      return;
    }

    // ================= BƯỚC 2: NGƯỜI DÙNG BẤM "TIẾP THEO" HOẶC "HOÀN THÀNH" =================
    if (this.currentTrialPhase === 'checked') {
      const isLastQ = (this.currentQuestionIdx === this.currentQuestionsList.length - 1);

      if (!isLastQ) {
        // NGƯỜI DÙNG BẤM "TIẾP THEO" -> LÚC ĐÓ MỚI CHUYỂN SANG CÂU HỎI TIẾP THEO
        this.currentQuestionIdx++;
        this.renderCurrentQuestion();
      } else {
        // NGƯỜI DÙNG BẤM "HOÀN THÀNH" -> HOÀN TẤT TOÀN BỘ BỘ CÂU HỎI THEO MỨC ĐỘ!
        const totalQ = this.currentQuestionsList.length;
        const correctCount = totalQ - this.currentTrialWrongCount;

        if (this.currentTrialWrongCount === 0) {
          // ================= ĐÚNG TOÀN BỘ PHẦN CÁC CÂU HỎI (100% ĐÚNG) =================
          // EXP CHỈ CỘNG KHI NGƯỜI DÙNG ĐÚNG TOÀN BỘ PHẦN CÁC CÂU HỎI
          node.status = 'mastered';
          
          // Kiểm tra hiệu ứng Boost XP đang kích hoạt (không cộng dồn)
          let awardedXP = node.xpReward;
          const activeExpBoost = localStorage.getItem('slanguage_active_exp_boost');
          let boostNote = '';
          if (activeExpBoost === 'double_xp') {
            awardedXP = node.xpReward * 2;
            boostNote = ' (x2 XP Gấp Đôi!)';
            localStorage.removeItem('slanguage_active_exp_boost');
            localStorage.removeItem('slanguage_xp_boost_active');
          } else if (activeExpBoost === 'boost_10') {
            awardedXP = Math.round(node.xpReward * 1.1);
            boostNote = ' (+10% Boost XP!)';
            localStorage.removeItem('slanguage_active_exp_boost');
            localStorage.removeItem('slanguage_xp_boost_active');
          }

          if (activeExpBoost) {
            const rawInv = localStorage.getItem('slanguage_user_inventory');
            if (rawInv) {
              try {
                const inv = JSON.parse(rawInv);
                inv.xpBoostCount = 0;
                inv.doubleXPCount = 0;
                localStorage.setItem('slanguage_user_inventory', JSON.stringify(inv));
              } catch (e) {}
            }
          }

          this.totalXP += awardedXP;
          localStorage.setItem('slanguage_user_xp', this.totalXP.toString());

          // Cập nhật chuỗi Streak theo ngày học thực tế
          let currentStreak = parseInt(localStorage.getItem('slanguage_user_streak') || '18', 10);
          if (isNaN(currentStreak)) currentStreak = 18;
          const todayStr = new Date().toISOString().split('T')[0];
          const lastStudy = localStorage.getItem('slanguage_last_study_date');
          if (lastStudy !== todayStr) {
            currentStreak += 1;
            localStorage.setItem('slanguage_last_study_date', todayStr);
            localStorage.setItem('slanguage_user_streak', currentStreak.toString());
          }

          // Cập nhật Cấp cao nhất nếu đạt mốc cấp kỷ lục mới
          const currentLvl = Math.max(1, Math.floor(this.totalXP / 180) + 1);
          const savedHighest = localStorage.getItem('slanguage_user_highest_level');
          const highestLvl = savedHighest !== null ? Math.max(14, parseInt(savedHighest, 10)) : 14;
          if (currentLvl > highestLvl) {
            localStorage.setItem('slanguage_user_highest_level', currentLvl.toString());
          }

          // Ghi nhận lịch sử bài học và thời gian học cho trang cá nhân
          try {
            const rawHist = localStorage.getItem('slanguage_recent_lessons');
            let hList = rawHist ? JSON.parse(rawHist) : [];
            if (!Array.isArray(hList)) hList = [];
            hList.unshift({
              title: node.title || `Buổi học Mốc ${node.stage}`,
              lang: this.currentLang || 'ja',
              timestamp: new Date().toISOString(),
              score: `${Math.round((correctCount / totalQ) * 100)}/100`,
              status: correctCount === totalQ ? 'Xuất sắc' : 'Đạt',
              xpEarned: awardedXP
            });
            if (hList.length > 20) hList = hList.slice(0, 20);
            localStorage.setItem('slanguage_recent_lessons', JSON.stringify(hList));

            let totalMins = parseInt(localStorage.getItem('slanguage_total_study_minutes') || '2910', 10);
            if (isNaN(totalMins)) totalMins = 2910;
            totalMins += 15;
            localStorage.setItem('slanguage_total_study_minutes', totalMins.toString());
          } catch (e) {}

          this.updateStatsDisplays();
          window.dispatchEvent(new Event('storage'));
          window.dispatchEvent(new CustomEvent('slanguage_data_changed'));

          this.unlockNextNodes(node);
          this.renderTree();

          let unlockMsg = '';
          if (node.difficulty === 'easy') {
            unlockMsg = ` Thử thách mức độ Bình thường và Mốc ${node.stage + 1} đã mở khóa!`;
          } else if (node.difficulty === 'normal') {
            unlockMsg = ` Thử thách mức độ Khó đã mở khóa!`;
          } else {
            unlockMsg = ` Bạn đã chinh phục trọn vẹn độ khó cao nhất của Mốc ${node.stage}!`;
          }

          this.showToast(`Tuyệt đỉnh! Đã trả lời đúng toàn bộ ${totalQ}/${totalQ} câu, nhận +${awardedXP} XP${boostNote}.${unlockMsg}`);
          this.closeModal();
        } else {
          // ================= CÓ CÂU TRẢ LỜI SAI =================
          // 1. Máu chỉ trừ khi người dùng đã hoàn thành bộ câu hỏi trắc nghiệm theo mức độ
          const penalty = node.heartPenalty;
          this.currentHearts = Math.max(0, this.currentHearts - penalty);
          localStorage.setItem('slanguage_user_hearts', this.currentHearts.toString());
          this.updateStatsDisplays();
          this.triggerDamageFeedback();

          // 2. Không cộng EXP vì không đúng toàn bộ câu hỏi
          this.closeModal();

          if (this.currentHearts === 0) {
            this.showToast(`Bạn hoàn thành với ${correctCount}/${totalQ} câu đúng. Vì có câu trả lời sai nên bị trừ -${penalty} Máu (còn 0 Máu) và không nhận được EXP!`);
            this.promptReviveWithPotion();
          } else {
            this.showToast(`Bạn hoàn thành với ${correctCount}/${totalQ} câu đúng. Vì có câu trả lời sai nên bị trừ -${penalty} Máu (còn ${this.currentHearts}/5) và không nhận được EXP. Cần đúng 100% để vượt qua!`);
          }
        }
      }
    }
  }

  private getTrialsForNode(node: DungeonNode): DungeonTrial[] {
    if (node.trials && node.trials.length > 0) {
      return node.trials;
    }

    const q1: DungeonTrial = node.trial;
    let q2: DungeonTrial;
    let q3: DungeonTrial;

    if (this.currentLang === 'ja') {
      q2 = {
        prompt: `Trong chủ đề "${node.title}", mục tiêu trọng tâm cần ghi nhớ là gì?`,
        choices: [
          node.objectives[0] || 'Nắm vững kiến thức trọng tâm',
          'Chỉ cần học thuộc một nửa từ vựng',
          'Bỏ qua trợ từ và cách phát âm'
        ],
        answerIdx: 0,
        explanation: `Chính xác! ${node.objectives[0] || 'Nắm vững kiến thức trọng tâm'} là nguyên tắc cốt lõi của chủ đề.`
      };
      q3 = {
        prompt: `Ứng dụng thực tế của kiến thức: "${node.preview}" thể hiện điều gì?`,
        choices: [
          'Vận dụng linh hoạt ngữ cảnh giao tiếp và phản xạ chuẩn Nhật',
          'Không có ý nghĩa ngữ pháp trong đời sống thường ngày',
          'Chỉ dùng trong các văn bản cổ điển'
        ],
        answerIdx: 0,
        explanation: 'Rất chuẩn mực! Nắm chắc ứng dụng thực tế giúp bạn phản xạ tự nhiên như người bản xứ.'
      };
    } else if (this.currentLang === 'en') {
      q2 = {
        prompt: `What is the key principle when mastering "${node.title}"?`,
        choices: [
          node.objectives[0] || 'Understand the core grammatical structure and phonics',
          'Memorize words without practicing pronunciation',
          'Ignore context and sentence connectors'
        ],
        answerIdx: 0,
        explanation: `Well done! ${node.objectives[0] || 'Core principles'} are essential for natural fluency.`
      };
      q3 = {
        prompt: `How should you apply the lesson preview: "${node.preview}" in real-life speech?`,
        choices: [
          'Use natural intonation, correct stress, and conversational flow',
          'Speak word-by-word with flat monotone pitch',
          'Only write it down and never practice speaking'
        ],
        answerIdx: 0,
        explanation: 'Outstanding! Active application with correct intonation builds long-term reflexes.'
      };
    } else {
      q2 = {
        prompt: `Trong chủ điểm "${node.title}", quy tắc nào là then chốt?`,
        choices: [
          node.objectives[0] || 'Nắm vững cấu trúc câu và thanh điệu',
          'Dùng từ tự do không cần xét ngữ cảnh xưng hô',
          'Bỏ qua dấu câu và quy ước chính tả'
        ],
        answerIdx: 0,
        explanation: `Tuyệt vời! ${node.objectives[0] || 'Quy tắc chuẩn mực'} giúp văn phong trang trọng và chuẩn xác.`
      };
      q3 = {
        prompt: `Ý nghĩa thực tiễn từ gợi ý: "${node.preview}" là gì?`,
        choices: [
          'Phản xạ ngôn ngữ nhạy bén, thấu hiểu ngữ cảnh giao tiếp người Việt',
          'Chỉ áp dụng trong thi cử lý thuyết',
          'Không có tính ứng dụng trong thực tế'
        ],
        answerIdx: 0,
        explanation: 'Chính xác! Thấu hiểu sâu sắc văn hóa và ngữ cảnh giúp câu nói truyền cảm hứng.'
      };
    }

    return [q1, q2, q3];
  }

  private triggerDamageFeedback(): void {
    if (this.navHeartsVal) {
      this.navHeartsVal.style.color = '#ef4444';
      this.navHeartsVal.style.transform = 'scale(1.3)';
      setTimeout(() => {
        if (this.navHeartsVal) {
          this.navHeartsVal.style.color = '';
          this.navHeartsVal.style.transform = '';
        }
      }, 400);
    }
  }

  private healFullHearts(): void {
    this.currentHearts = this.maxHearts;
    localStorage.setItem('slanguage_user_hearts', this.currentHearts.toString());
    this.updateStatsDisplays();
    this.showToast('❤️ Sinh mệnh hồi phục đầy bình (5/5 Máu)! Sẵn sàng tiếp tục khiêu chiến!');
  }

  private promptReviveWithPotion(onReviveSuccess?: () => void): void {
    const rawInv = localStorage.getItem('slanguage_user_inventory');
    let inv: any = {};
    let healPotions = 0;
    if (rawInv) {
      try {
        inv = JSON.parse(rawInv);
        healPotions = inv.healPotionsCount ?? 0;
      } catch (e) {
        inv = {};
      }
    }

    if (!this.reviveModalOverlay || !this.reviveModalBody) return;

    if (healPotions > 0) {
      this.reviveModalBody.innerHTML = `
        <div class="revive-dialog-icon">
          <img src="../assets/potion_red.png" alt="Dược Phẩm Hồi Phục">
        </div>
        <h3 class="revive-dialog-title">Bạn Đã Hết Máu! 💔</h3>
        <p class="revive-dialog-desc">
          Sinh lực của bạn đã giảm về <strong>0/5 ❤️</strong>.<br>
          Trong tủ đồ của bạn hiện còn <strong>${healPotions} Dược Phẩm Hồi Phục</strong> 🧪.<br>
          Bạn có muốn sử dụng 1 bình để hồi phục lại đầy <strong>5/5 máu</strong> và tiếp tục bài học không?
        </p>
        <div class="revive-dialog-subnote">
          Số bình hiện có: <strong>${healPotions} bình</strong> ➔ Sau khi dùng: <strong>${healPotions - 1} bình</strong>.
        </div>
        <div class="revive-dialog-footer">
          <button type="button" class="btn-revive-cancel" id="btnReviveCancel">
            <i class="fa-solid fa-xmark"></i> Không, Giữ Lại
          </button>
          <button type="button" class="btn-revive-confirm" id="btnReviveConfirm">
            <i class="fa-solid fa-heart-pulse"></i> Sử Dụng Ngay (1 Bình)
          </button>
        </div>
      `;

      const btnCancel = document.getElementById('btnReviveCancel');
      const btnConfirm = document.getElementById('btnReviveConfirm');

      if (btnCancel) {
        btnCancel.onclick = () => {
          this.closeReviveModal();
        };
      }

      if (btnConfirm) {
        btnConfirm.onclick = () => {
          inv.healPotionsCount = Math.max(0, healPotions - 1);
          localStorage.setItem('slanguage_user_inventory', JSON.stringify(inv));
          this.currentHearts = 5;
          localStorage.setItem('slanguage_user_hearts', '5');
          this.updateStatsDisplays();
          this.closeReviveModal();
          this.showToast(`❤️ Đã sử dụng 1 Dược Phẩm Hồi Phục! Máu đã hồi phục đầy đủ (5/5). Còn lại: ${inv.healPotionsCount} bình.`);
          if (onReviveSuccess) {
            onReviveSuccess();
          }
        };
      }
    } else {
      this.reviveModalBody.innerHTML = `
        <div class="revive-dialog-icon">
          <i class="fa-solid fa-heart-crack" style="font-size: 2.2rem; color: #ff4d6d;"></i>
        </div>
        <h3 class="revive-dialog-title">Bạn Đã Cạn Kiệt Máu! 💔</h3>
        <p class="revive-dialog-desc">
          Sinh lực của bạn đã về <strong>0/5 ❤️</strong> và hiện không còn <strong>Dược Phẩm Hồi Phục</strong> nào trong tủ đồ.<br>
          Hãy ghé Cửa Hàng (Shop) để quy đổi EXP lấy Dược Phẩm Hồi Phục và sẵn sàng tiếp tục thử thách nhé!
        </p>
        <div class="revive-dialog-footer">
          <button type="button" class="btn-revive-cancel" id="btnReviveCancel">
            <i class="fa-solid fa-xmark"></i> Đóng
          </button>
          <a href="../shop/index.html" class="btn-revive-shop">
            <i class="fa-solid fa-store"></i> Đến Cửa Hàng (Shop)
          </a>
        </div>
      `;

      const btnCancel = document.getElementById('btnReviveCancel');
      if (btnCancel) {
        btnCancel.onclick = () => {
          this.closeReviveModal();
        };
      }
    }

    this.reviveModalOverlay.classList.add('active');
  }

  private closeReviveModal(): void {
    if (this.reviveModalOverlay) {
      this.reviveModalOverlay.classList.remove('active');
    }
  }

  private closeLockedPrereqModal(): void {
    if (this.lockedPrereqModal) {
      this.lockedPrereqModal.classList.remove('active');
    }
  }

  private promptLockedNodeModal(node: DungeonNode): void {
    if (!this.lockedPrereqModal || !this.lockedPrereqModalBody) return;
    const dungeon = dungeonDB[this.currentLang];
    if (!dungeon) return;

    let targetDiffName = 'này';
    let reqDiffName = '';
    let reqTitle = '';
    let reqNode: DungeonNode | undefined;
    let descHtml = '';

    if (node.isHub) {
      targetDiffName = `Bài đọc Mốc ${node.stage}`;
      const prevTrials = dungeon.nodes.filter(n => n.stage === node.stage - 1 && !n.isHub);
      reqNode = prevTrials.find(n => n.difficulty === 'easy') || prevTrials[0];
      reqDiffName = `Mốc ${node.stage - 1}`;
      reqTitle = reqNode?.title || (`Thử thách Mốc ${node.stage - 1}`);
      descHtml = `Bạn cần phải hoàn thành ít nhất 1 bài trắc nghiệm ở <strong>Mốc ${node.stage - 1}</strong> trước để mở khóa bài học của <strong>Mốc ${node.stage}</strong>!`;
    } else if (node.difficulty === 'hard') {
      targetDiffName = 'Khó';
      reqDiffName = 'Bình thường';
      reqNode = dungeon.nodes.find(n => n.stage === node.stage && !n.isHub && n.difficulty === 'normal');
      reqTitle = reqNode?.title || 'Thử thách mức độ Bình thường';
      descHtml = `Bạn cần phải vượt qua thử thách mức độ <strong>Bình thường</strong> trước để mở khóa mức độ <strong>Khó</strong> của Mốc ${node.stage}!`;
    } else if (node.difficulty === 'normal') {
      targetDiffName = 'Bình thường';
      reqDiffName = 'Dễ';
      reqNode = dungeon.nodes.find(n => n.stage === node.stage && !n.isHub && n.difficulty === 'easy');
      reqTitle = reqNode?.title || 'Thử thách mức độ Dễ';
      descHtml = `Bạn cần phải vượt qua thử thách mức độ <strong>Dễ</strong> trước để mở khóa mức độ <strong>Bình thường</strong> của Mốc ${node.stage}!`;
    } else {
      // easy node locked because Hub reading is not completed
      targetDiffName = 'Dễ';
      reqDiffName = `Bài đọc Mốc ${node.stage}`;
      reqNode = dungeon.nodes.find(n => n.stage === node.stage && n.isHub);
      reqTitle = reqNode?.title || `Bài đọc lý thuyết Mốc ${node.stage}`;
      descHtml = `Bạn cần phải đọc xong <strong>Bài đọc chuyên đề của Mốc ${node.stage}</strong> trước để mở khóa thử thách mức độ <strong>Dễ</strong>!`;
    }

    const confirmBtnText = reqNode?.isHub 
      ? `Đọc bài Mốc ${node.stage}`
      : `Vào bài ${reqDiffName}`;

    this.lockedPrereqModalBody.innerHTML = `
      <div class="locked-dialog-icon">
        <i class="fa-solid fa-lock"></i>
      </div>
      <h3 class="locked-dialog-title">Thử Thách Chưa Mở Khóa! 🔒</h3>
      <p class="locked-dialog-desc">
        ${descHtml}
      </p>
      <div class="locked-dialog-prereq-badge">
        <i class="fa-solid fa-circle-exclamation"></i>
        <div class="badge-text">
          Độ khó cần hoàn thành: <strong>${reqDiffName}</strong> (${reqTitle})
        </div>
      </div>
      <div class="locked-dialog-footer">
        <button type="button" class="btn-locked-cancel" id="btnLockedPrereqCancel">
          <i class="fa-solid fa-xmark"></i> Hủy
        </button>
        <button type="button" class="btn-locked-confirm" id="btnLockedPrereqGo">
          <i class="fa-solid fa-arrow-right"></i> ${confirmBtnText}
        </button>
      </div>
    `;

    const btnCancel = document.getElementById('btnLockedPrereqCancel');
    const btnGo = document.getElementById('btnLockedPrereqGo');

    if (btnCancel) {
      btnCancel.onclick = () => {
        this.closeLockedPrereqModal();
      };
    }

    if (btnGo) {
      btnGo.onclick = () => {
        this.closeLockedPrereqModal();
        if (reqNode) {
          this.openModal(reqNode);
        }
      };
    }

    this.lockedPrereqModal.classList.add('active');
  }


  private updateNodeStatuses(): void {
    const dungeon = dungeonDB[this.currentLang];
    if (!dungeon) return;

    for (let stage = 1; stage <= 5; stage++) {
      const hub = dungeon.nodes.find(n => n.stage === stage && n.isHub);
      const easy = dungeon.nodes.find(n => n.stage === stage && !n.isHub && n.difficulty === 'easy');
      const normal = dungeon.nodes.find(n => n.stage === stage && !n.isHub && n.difficulty === 'normal');
      const hard = dungeon.nodes.find(n => n.stage === stage && !n.isHub && n.difficulty === 'hard');

      // 1. Mở khóa bài đọc của mốc (Hub node):
      // Giai đoạn 1 luôn khả dụng (nếu chưa hoàn thành)
      // Các giai đoạn sau (>1) chỉ mở khi ít nhất 1 bài trắc nghiệm ở mốc trước đã hoàn thành (mastered)
      if (hub && hub.status !== 'mastered') {
        if (stage === 1) {
          hub.status = 'available';
        } else {
          const prevTrials = dungeon.nodes.filter(n => n.stage === stage - 1 && !n.isHub);
          const hasPrevTrialMastered = prevTrials.some(n => n.status === 'mastered');
          hub.status = hasPrevTrialMastered ? 'available' : 'locked';
        }
      }

      // 2. Mở khóa 3 thẻ trắc nghiệm trong mốc:
      // "sau khi đọc xong bài đọc của mốc thì mới mở ra 3 thẻ trắc nghiệm cho người dùng"
      const isHubRead = hub && hub.status === 'mastered';

      if (!isHubRead) {
        // Khi chưa đọc xong bài đọc của mốc, toàn bộ 3 thẻ trắc nghiệm đều bị khóa
        if (easy && easy.status !== 'mastered') easy.status = 'locked';
        if (normal && normal.status !== 'mastered') normal.status = 'locked';
        if (hard && hard.status !== 'mastered') hard.status = 'locked';
      } else {
        // Đã đọc xong bài đọc của mốc:
        // Thẻ Dễ được mở khóa đầu tiên
        if (easy && easy.status !== 'mastered') {
          easy.status = 'available';
        }

        // "để có thể làm được bài ở mốc độ khó tiếp theo thì cần phải vượt qua được bài trắc nghiệm có độ khó xếp trước"
        // Thẻ Bình thường chỉ mở khi thẻ Dễ đã hoàn thành
        if (normal && normal.status !== 'mastered') {
          normal.status = (easy && easy.status === 'mastered') ? 'available' : 'locked';
        }

        // Thẻ Khó chỉ mở khi thẻ Bình thường đã hoàn thành
        if (hard && hard.status !== 'mastered') {
          hard.status = (normal && normal.status === 'mastered') ? 'available' : 'locked';
        }
      }
    }
  }

  private saveDungeonProgress(): void {
    const dungeon = dungeonDB[this.currentLang];
    if (!dungeon) return;
    const masteredIds = dungeon.nodes
      .filter(n => n.status === 'mastered')
      .map(n => n.id);
    localStorage.setItem(`slanguage_dungeon_mastered_${this.currentLang}`, JSON.stringify(masteredIds));
  }

  private loadDungeonProgress(): void {
    const dungeon = dungeonDB[this.currentLang];
    if (!dungeon) return;
    const raw = localStorage.getItem(`slanguage_dungeon_mastered_${this.currentLang}`);
    if (raw) {
      try {
        const masteredIds: string[] = JSON.parse(raw);
        dungeon.nodes.forEach(node => {
          if (masteredIds.includes(node.id)) {
            node.status = 'mastered';
          }
        });
      } catch (e) {}
    }
    this.updateNodeStatuses();
  }

  private unlockNextNodes(completedNode: DungeonNode): void {
    this.updateNodeStatuses();
    this.saveDungeonProgress();
  }

  private showToast(message: string, flagImg?: string): void {
    const toast = document.getElementById('roadmapToast');
    if (!toast) return;

    const flagHtml = flagImg
      ? `<img src="${flagImg}" alt="Flag" style="width: 24px; height: 16px; object-fit: cover; border-radius: 3px; box-shadow: 0 1px 4px rgba(0,0,0,0.4); flex-shrink: 0; vertical-align: middle;">`
      : '';

    toast.style.display = 'flex';
    toast.style.flexDirection = 'column';
    toast.style.alignItems = 'flex-start';
    toast.style.gap = '6px';
    toast.style.border = '2px solid #4ADE80';
    toast.style.background = '#0a0d10';
    toast.style.borderRadius = '16px';
    toast.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.8), 0 0 18px rgba(74, 222, 128, 0.3)';
    toast.style.padding = '12px 20px';

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; padding-bottom: 5px; border-bottom: 1px solid rgba(74, 222, 128, 0.25); width: 100%;">
        <i class="fa-solid fa-dungeon" style="color: #4ADE80; font-size: 1rem;"></i>
        <span style="font-size: 0.85rem; font-weight: 700; color: #4ADE80; letter-spacing: 0.2px;">Slanguage Dungeon:</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; font-size: 0.95rem; font-weight: 700; color: #ffffff;">
        <span>${message}</span>
        ${flagHtml}
      </div>
    `;

    setTimeout(() => {
      toast.style.display = 'none';
    }, 3800);
  }

  private bindPageTransitions(): void {
    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (
        href && 
        !href.startsWith('#') && 
        !href.startsWith('javascript:') && 
        !link.hasAttribute('target')
      ) {
        link.addEventListener('click', (e: MouseEvent) => {
          e.preventDefault();
          this.triggerLoadingAndRedirect(href);
        });
      }
    });

    window.addEventListener('pageshow', () => {
      const sXP = localStorage.getItem('slanguage_user_xp');
      if (sXP !== null) {
        const parsed = parseInt(sXP.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(parsed)) this.totalXP = parsed;
      }
      const sHearts = localStorage.getItem('slanguage_user_hearts');
      if (sHearts !== null) {
        this.currentHearts = Math.max(0, Math.min(5, parseInt(sHearts, 10)));
      }
      this.updateStatsDisplays();
      const sStreak = localStorage.getItem('slanguage_user_streak') || '18';
      const strEl = document.getElementById('headerStreakVal');
      if (strEl) strEl.textContent = `${sStreak} Ngày`;
      const dropStr = document.getElementById('dropdownStreakVal');
      if (dropStr) dropStr.textContent = `${sStreak} Ngày`;
      const sName = localStorage.getItem('slanguage_user_name') || 'Vua Xứ Thanh';
      document.querySelectorAll('.user-info-text .name, #dropdownUserName').forEach(el => {
        el.textContent = sName;
      });

      const overlay = document.getElementById('slanguageLoadingOverlay');
      const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement;
      if (overlay) overlay.classList.remove('active');
      if (video) {
        video.pause();
        video.muted = true;
        video.currentTime = 0;
      }
    });

    window.addEventListener('pagehide', () => {
      const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement | null;
      if (video) {
        video.pause();
        video.muted = true;
      }
    });

  }

  private triggerLoadingAndRedirect(targetUrl: string, duration: number = 1500): void {
    const overlay = document.getElementById('slanguageLoadingOverlay');
    const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement;
    if (overlay) {
      overlay.classList.add('active');
      if (video) {
        video.muted = false;
        video.volume = 1.0;
        video.currentTime = 0;
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            video.muted = true;
            video.play();
          });
        }
      }
    }
    setTimeout(() => {
      if (video) {
        video.pause();
        video.muted = true;
      }
      if (overlay) overlay.classList.remove('active');
      window.location.href = targetUrl;
    }, duration);
  }
}

function initSlanguageDungeonTree(): void {
  (window as unknown as { roadmapApp?: SlanguageDungeonTree }).roadmapApp = new SlanguageDungeonTree();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSlanguageDungeonTree);
} else {
  initSlanguageDungeonTree();
}

// ================= MOBILE SIDE DRAWER CONTROLLER =================
function initMobileSideDrawer(): void {
  const hamburgerBtn = document.getElementById('navHamburgerBtn');
  const sideDrawer = document.getElementById('sideDrawer');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const drawerCloseBtn = document.getElementById('drawerCloseBtn');

  if (!hamburgerBtn || !sideDrawer || !drawerBackdrop) return;

  const openDrawer = (e: Event): void => {
    e.stopPropagation();
    sideDrawer.classList.add('open');
    drawerBackdrop.classList.add('open');
    document.body.classList.add('drawer-open');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
  };

  const closeDrawer = (): void => {
    sideDrawer.classList.remove('open');
    drawerBackdrop.classList.remove('open');
    document.body.classList.remove('drawer-open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
  };

  hamburgerBtn.addEventListener('click', openDrawer);
  drawerCloseBtn?.addEventListener('click', closeDrawer);
  drawerBackdrop.addEventListener('click', closeDrawer);

  sideDrawer.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeDrawer);
  });

  // Sync drawer user stats
  try {
    const rawUser = localStorage.getItem('slanguage_user');
    const user = rawUser ? JSON.parse(rawUser) : null;
    const streak = user?.streak ?? localStorage.getItem('slanguage_user_streak') ?? '18';
    const xp = user?.xp ?? localStorage.getItem('slanguage_user_xp') ?? '2450';
    const hearts = user?.hearts ?? localStorage.getItem('slanguage_user_hearts') ?? '5';
    const name = user?.name ?? user?.username ?? localStorage.getItem('slanguage_user_name') ?? 'Vua Xứ Thanh';
    const avatar = user?.avatar ?? localStorage.getItem('slanguage_user_avatar');

    const streakEl = document.getElementById('drawerStreakVal');
    if (streakEl) streakEl.textContent = `${streak} Ngày`;

    const xpEl = document.getElementById('drawerXPVal');
    if (xpEl) xpEl.textContent = `${Number(xp).toLocaleString()} XP`;

    const heartsEl = document.getElementById('drawerHeartsVal');
    if (heartsEl) heartsEl.textContent = `${hearts}/5`;

    const nameEl = document.getElementById('drawerUserName');
    if (nameEl) nameEl.textContent = name;

    const avatarEl = document.getElementById('drawerUserAvatar') as HTMLImageElement | null;
    if (avatarEl && avatar) avatarEl.src = avatar;
  } catch (err) {
    console.warn('Error syncing drawer user stats:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobileSideDrawer);
} else {
  initMobileSideDrawer();
}
