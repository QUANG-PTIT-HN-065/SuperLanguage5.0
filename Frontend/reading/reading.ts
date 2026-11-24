/**
 * SLANGUAGE - FULL SCREEN DEDICATED READING MODULE (TRANG BÀI ĐỌC CHUYÊN ĐỀ)
 * Provides an immersive, distraction-free reading experience for Milestone Hub lessons.
 */

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

interface ReadingNodeData {
  id: string;
  stage: number;
  stageName: string;
  title: string;
  desc: string;
  icon: string;
  status: 'available' | 'locked' | 'mastered';
  isHub: boolean;
  readingArticle?: DungeonReadingArticle;
}

// ================= CURATED ARTICLES REPOSITORY =================
const articlesDB: Record<string, Record<string, DungeonReadingArticle>> = {
  ja: {
    ja_s1_hub: {
      title: 'Cổng Khởi Nguyên: Hệ Thống Ngữ Âm & 2 Bảng Chữ Cái Kana',
      lead: 'Chào mừng bạn bước vào thế giới tiếng Nhật! Trước khi bước vào các ngả đường thử thách độ khó, hãy cùng khám phá bức tranh toàn cảnh về cách người Nhật kết hợp 2 bảng chữ cái Kana và 5 nguyên âm cốt lõi.',
      sections: [
        {
          heading: '1. Nguồn Gốc & Sự Ra Đời Của Hiragana & Katakana',
          icon: 'fa-solid fa-scroll',
          text: "Vào thế kỷ thứ 8-9, người Nhật đã sáng tạo ra hai hệ thống chữ biểu âm độc đáo dựa trên việc tinh giản các nét từ chữ Hán cổ (Man'yogana).\n• Hiragana (chữ mềm): Mang nét viết mềm mại, uốn lượn uyển chuyển, vốn được các nữ sĩ quý tộc cung đình sử dụng để sáng tác văn chương, thơ waka và nhật ký.\n• Katakana (chữ cứng): Được các tăng lữ Phật giáo phát triển bằng các nét thẳng, sắc nhọn dứt khoát để ghi chú nhanh bài giảng kinh viện."
        },
        {
          heading: '2. Phân Chia Nhiệm Vụ Trong Thực Tế',
          icon: 'fa-solid fa-layer-group',
          text: "Trong văn bản tiếng Nhật hiện đại ngày nay:\n• Hiragana: Dùng để ghi các từ thuần Nhật (Yamato-kotoba), hệ thống trợ từ ngữ pháp (は, が, を, に...) và đuôi biến đổi của động từ/tính từ (Okurigana).\n• Katakana: Chuyên dùng để phiên âm các từ mượn tiếng nước ngoài (Gairaigo) như コーヒー (cà phê), カメラ (máy ảnh), tên riêng người nước ngoài, hoặc tạo hiệu ứng nhấn mạnh trong truyện tranh Manga.",
          callout: 'Mẹo học nhanh: Khi gặp một từ toàn chữ Katakana, hãy thử đọc to phát âm theo âm tiếng Anh, bạn sẽ đoán được nghĩa của từ đến hơn 80%!'
        },
        {
          heading: '3. 5 Nguyên Âm Vàng Cốt Lõi: A - I - U - E - O',
          icon: 'fa-solid fa-volume-high',
          text: "Toàn bộ hệ thống phát âm tiếng Nhật được xây dựng từ 5 nguyên âm chính:\n• あ (a): Mở miệng vừa phải, âm thanh vang tự nhiên như âm 'a'.\n• い (i): Cười mỉm nhẹ, phát âm gọn ghẽ như 'i'.\n• う (u): Môi khép hờ, không chu tròn môi mà âm thanh nằm giữa 'u' và 'ư'.\n• え (e): Mở miệng ngang, đọc dứt khoát như 'e'.\n• お (o): Tròn môi vừa phải, âm phát ra chắc khỏe như 'ô'."
        }
      ],
      keyTakeaway: 'Làm chủ 2 bảng chữ cái Kana và 5 nguyên âm chính là nền móng vững chắc giúp bạn đọc được mọi biển báo, thực đơn và sách truyện tại Nhật Bản!'
    },
    ja_s2_hub: {
      title: 'Điện Thờ Cổ Tự: Thế Giới Hán Tự (Kanji) & Khung Ngữ Pháp SOV',
      lead: 'Kanji không phải là một bức tường cản trở, mà chính là chiếc kính lúp giúp bạn nắm bắt tức thì ý nghĩa của từ ngữ mà không cần phải đọc từng âm tiết rời rạc.',
      sections: [
        {
          heading: '1. Bản Chất Chữ Hán (Kanji): Chữ Tượng Hình Biểu Ý',
          icon: 'fa-solid fa-monument',
          text: "Khác với chữ Latinh chỉ ghi âm, Kanji mang trực tiếp hình tượng và ý niệm của sự vật:\n• Chữ 木 (ki) là một cái cây, ghép hai cái cây 林 (hayashi) là rừng thưa, và ba cái cây 森 (mori) là rừng rậm sum sê.\n• Ở trình độ sơ cấp N5, bạn chỉ cần làm quen với khoảng 100 - 150 Hán tự quen thuộc nhất biểu thị số đếm, thời gian, con người và thiên nhiên."
        },
        {
          heading: '2. Bí Quyết Phân Biệt Âm On (Onyomi) & Âm Kun (Kunyomi)',
          icon: 'fa-solid fa-yin-yang',
          text: "• Âm On: Là âm phỏng theo tiếng Hán cổ khi du nhập sang Nhật, thường dùng khi ghép 2 hoặc nhiều chữ Hán lại thành một từ mới (Ví dụ: 日本 = Ni-hon = Nhật Bản, 学生 = Gakusei = Học sinh).\n• Âm Kun: Là cách đọc theo âm thuần Nhật khi chữ Hán đứng độc lập một mình hoặc có đuôi Hiragana kèm theo (Ví dụ: 水 = mizu = nước, 食べる = taberu = ăn)."
        },
        {
          heading: '3. Trật Tự Câu SOV & Sức Mạnh Của Trợ Từ',
          icon: 'fa-solid fa-network-wired',
          text: "Trong khi tiếng Việt nói 'Tôi ăn cơm' (Chủ - Động - Tân), tiếng Nhật lại nói 'Tôi cơm ăn' (Chủ - Tân - Động - SOV). Động từ luôn luôn nằm ở cuối câu! Mối quan hệ giữa các thành phần được quyết định bởi trợ từ:\n• は (wa): Đưa từ đứng trước thành chủ đề chính của câu chuyện.\n• を (o): Đánh dấu món đồ trực tiếp chịu tác động của hành động.\n• に (ni): Chỉ đích đến hoặc mốc thời gian cụ thể diễn ra hành động."
        }
      ],
      keyTakeaway: 'Khi nắm chắc trật tự SOV và ma trận 4 trợ từ then chốt, bạn đã định hình được bộ khung xương vững chắc cho mọi câu văn tiếng Nhật!'
    },
    ja_s3_hub: {
      title: 'Quảng Trường Đời Sống: Giao Tiếp Thực Chiến & Văn Hóa Đàm Thoại Tokyo',
      lead: 'Học một ngôn ngữ là bước vào một nền văn hóa. Giao tiếp tiếng Nhật đề cao sự tinh tế, lịch thiệp và thấu hiểu lẫn nhau giữa con người với con người.',
      sections: [
        {
          heading: "1. Cụm Từ 'Bảo Bối' Toàn Năng: Sumimasen (すみません)",
          icon: 'fa-solid fa-comments',
          text: "Nếu chỉ được học một từ duy nhất khi đặt chân đến nước Nhật, từ đó chắc chắn là 'Sumimasen'. Người Nhật dùng từ này trong 3 tình huống then chốt:\n1. Xin lỗi lịch sự: Khi vô tình va quẹt hoặc muốn xin nhường đường nơi đông người.\n2. Cảm ơn sâu sắc: Khi ai đó làm điều tốt giúp bạn và bạn thấy áy náy làm phiền họ.\n3. Xin phép: Khi giơ tay gọi nhân viên phục vụ trong nhà hàng hoặc xin phép vào phòng."
        },
        {
          heading: '2. Lễ Nghi Chào Hỏi Chuẩn Mực Theo Thời Gian',
          icon: 'fa-solid fa-handshake',
          text: "• Sáng sớm: おはようございます (Ohayō gozaimasu) - Lời chào trang trọng khởi đầu ngày mới.\n• Ban ngày: こんにちは (Konnichiwa) - Lời chào thân thiện phổ biến nhất.\n• Chiều tối: こんばんは (Konbanwa) - Dùng khi gặp nhau sau khi hoàng hôn buông xuống.\n• Trước bữa ăn: いただきます (Itadakimasu) - Thể hiện lòng biết ơn sâu sắc đối với thức ăn và công sức người chế biến."
        },
        {
          heading: '3. Trải Nghiệm Thực Tế Tại Konbini (Cửa Hàng Tiện Lợi)',
          icon: 'fa-solid fa-store',
          text: "Khi ghé cửa hàng tiện lợi như 7-Eleven, Lawson hay FamilyMart, thu ngân thường hỏi:\n• 「袋はご利用ですか？」(Fukuro wa go-riyō desu ka? = Quý khách có dùng túi nilon không?) -> Trả lời: 「大丈夫です」(Daijōbu desu = Không cần đâu ạ).\n• 「温めますか？」(Atatamemasu ka? = Có cần hâm nóng đồ ăn không?) -> Trả lời: 「お願いします」(Onegaishimasu = Vâng xin làm nóng giúp)."
        }
      ],
      keyTakeaway: 'Giao tiếp đàm thoại không chỉ nằm ở số lượng từ vựng, mà chính là thái độ tôn trọng và sự tinh tế trong cách ứng xử!'
    },
    ja_s4_hub: {
      title: 'Phòng Biến Hóa: Bí Kíp Động Từ & Sức Mạnh Thần Kỳ Của Thể Te (て形)',
      lead: 'Nếu ví danh từ là những viên gạch thì động từ chính là lớp vữa kết dính và tạo nên chuyển động phong phú cho cả câu chuyện.',
      sections: [
        {
          heading: '1. Phân Nhóm 3 Loại Động Từ Tiếng Nhật',
          icon: 'fa-solid fa-cubes',
          text: "• Nhóm 1 (Godan): Đuôi tận cùng thuộc hàng 'u' (như 書く / kaku = viết, 飲む / nomu = uống, 行く / iku = đi).\n• Nhóm 2 (Ichidan): Có đuôi 'iru' hoặc 'eru' (như 食べる / taberu = ăn, 見る / miru = xem).\n• Nhóm 3 (Bất quy tắc): Chỉ gồm đúng 2 động từ đặc biệt là する (suru = làm) và 来る (kuru = đến)."
        },
        {
          heading: '2. Thể Te (て形) - Chìa Khóa Vạn Năng Của Ngữ Pháp Sơ Cấp',
          icon: 'fa-solid fa-wand-magic-sparkles',
          text: "Khi làm chủ thể Te, bạn mở khóa được hàng chục mẫu câu giao tiếp tự nhiên:\n• 〜てください (~te kudasai): Xin hãy làm điều gì đó giúp tôi.\n• 〜ています (~te imasu): Đang thực hiện một hành động (như đang học bài, trời đang mưa).\n• 〜てもいいですか (~te mo ii desu ka): Tôi có thể làm việc này được không ạ?\n• Nối câu: Làm hành động A rồi đến hành động B (V1-te, V2-te, V3)."
        },
        {
          heading: '3. Mẹo Ghi Nhớ Bài Vè Chuyển Thể Te Trong 1 Giây',
          icon: 'fa-solid fa-bolt',
          text: "Hãy nhớ các cặp vần thần thánh:\n'い・ち・り (i, chi, ri) biến thành って (tte)'\n'み・び・に (mi, bi, ni) biến thành んで (nde)'\n'き (ki) biến thành いて (ite), ぎ (gi) biến thành いで (ide)'\nLuyện tập chuyển đổi 5 động từ mỗi ngày sẽ giúp bạn nói thể Te lưu loát trong vô thức!"
        }
      ],
      keyTakeaway: 'Làm chủ thể Te đồng nghĩa với việc bạn đã vượt qua được ngọn núi ngữ pháp cao nhất trong chương trình tiếng Nhật sơ cấp!'
    },
    ja_s5_hub: {
      title: 'Đền Thờ Đỉnh Cao: Chiến Lược Chinh Phục JLPT N5 & Hành Trình Vươn Xa',
      lead: 'Chứng chỉ JLPT N5 là dấu mốc đầu tiên khẳng định năng lực ngôn ngữ và sự nỗ lực kiên định của bạn trên con đường chinh phục tiếng Nhật.',
      sections: [
        {
          heading: '1. Cấu Trúc Đề Thi JLPT N5 Chuẩn Quốc Tế',
          icon: 'fa-solid fa-award',
          text: "Bài thi gồm 3 phần thi độc lập:\n1. Kiến thức ngôn ngữ (25 phút): Nhận diện chữ Hán, chọn cách đọc Hiragana, tìm từ vựng đồng nghĩa.\n2. Ngữ pháp & Đọc hiểu (50 phút): Điền trợ từ, sắp xếp sao tạo câu chuẩn, đọc hiểu 3 đoạn văn ngắn.\n3. Nghe hiểu (30 phút): Nghe đoạn hội thoại đời sống, quan sát tranh minh họa và chọn phương án hành động đúng."
        },
        {
          heading: '2. Chiến Thuật Phân Bổ Thời Gian & Mẹo Tránh Bẫy',
          icon: 'fa-solid fa-clock',
          text: "• Không bao giờ bỏ trống đáp án: Vì đề thi không trừ điểm câu sai, luôn chọn đáp án khả dĩ nhất nếu sắp hết giờ.\n• Tận dụng thời gian trống ở phần Nghe: Đọc lướt qua 4 hình vẽ hoặc câu chữ trước khi băng phát âm thanh.\n• Cẩn thận với trường âm (obaasan vs obasan) và âm ngắt (kitte vs kite) - đây là các bẫy phổ biến nhất ở phần Từ vựng N5!"
        },
        {
          heading: '3. Bước Chân Kế Tiếp Hướng Tới N4 & N3',
          icon: 'fa-solid fa-mountain-sun',
          text: 'Sau khi hoàn thành 5 tầng lộ trình của Slanguage, bạn đã nắm chắc hơn 800 từ vựng cốt lõi, 150 chữ Hán căn bản và hơn 50 cấu trúc câu giao tiếp. Hãy tiếp tục giữ vững ngọn lửa đam mê để vươn tới N4 và N3!'
        }
      ],
      keyTakeaway: 'Kiên trì mỗi ngày một chút tri thức là chìa khóa mở ra cánh cửa thành công tại xứ sở hoa anh đào!'
    }
  },
  en: {
    en_s1_hub: {
      title: 'Gateway of Pronunciation: IPA Phonetic Blueprint & Stress Rules',
      lead: 'English is not a phonetic language — spelling does not always dictate sound! Understanding the International Phonetic Alphabet (IPA) is your master key to decoding pronunciation instantly.',
      sections: [
        {
          heading: '1. The 44 Core Phonemes & Pure Vowels',
          icon: 'fa-solid fa-microphone',
          text: "Standard English comprises 20 vowel sounds (monophthongs and diphthongs) and 24 consonants:\n• Short Vowels vs. Long Vowels: The difference between /ɪ/ ('ship') and /iː/ ('sheep') can change the meaning of your sentence entirely!\n• The Omnipresent Schwa /ə/: The most frequent vowel sound in spoken English, appearing in unstressed syllables such as 'about', 'banana', and 'computer'."
        },
        {
          heading: '2. Word Stress & Rhythm Dynamics',
          icon: 'fa-solid fa-drum',
          text: "English is a stress-timed language:\n• Two-syllable nouns usually stress the first syllable (PRE-sent, OB-ject).\n• Two-syllable verbs usually stress the second syllable (pre-SENT, ob-JECT).\n• Stressed syllables are louder, longer, and higher in pitch, while unstressed vowels reduce into the schwa /ə/.",
          callout: 'Pro Tip: Tap your finger on the desk every time you hit a stressed syllable to internalize the natural musical cadence of English!'
        },
        {
          heading: '3. Connected Speech: Linking and Elision',
          icon: 'fa-solid fa-link',
          text: "Native speakers rarely enunciate each word in isolation:\n• Consonant to Vowel Linking: 'Pick it up' flows naturally as 'Pi-ki-tup'.\n• Glottal Stops and T-Flapping: In American English, the 't' in 'water' and 'butter' sounds like a quick light 'd'."
        }
      ],
      keyTakeaway: 'Mastering the IPA and stress rules allows you to pronounce any unfamiliar English word accurately straight from the dictionary!'
    },
    en_s2_hub: {
      title: 'Temple of Tenses: The Architectural Blueprint of English Time',
      lead: 'Tenses in English do not merely describe chronological time — they express aspect, completion, duration, and speaker attitude toward actions.',
      sections: [
        {
          heading: '1. The Aspect Matrix: Simple, Continuous, Perfect',
          icon: 'fa-solid fa-hourglass-half',
          text: "• Simple Aspect: Deals with facts, habits, and completed milestones ('I work', 'She wrote').\n• Continuous Aspect: Focuses on actions in progress and temporary states ('I am working', 'They were driving').\n• Perfect Aspect: Connects two reference points in time, viewing an action from a retrospective perspective."
        },
        {
          heading: '2. Present Perfect: The Ultimate Dilemma',
          icon: 'fa-solid fa-arrows-split-up-and-left',
          text: "Many learners confuse Past Simple and Present Perfect:\n• Past Simple: Requires a finished past timeframe ('I visited London in 2022').\n• Present Perfect: Emphasizes life experience or ongoing relevance ('I have visited London twice')."
        }
      ],
      keyTakeaway: 'Always think about whether the consequences of the action affect the present moment before choosing between Past Simple and Present Perfect!'
    },
    en_s3_hub: {
      title: 'Agora of Fluency: Idiomatic Nuances & Natural Conversational Flow',
      lead: 'Sounding like a native speaker requires stepping beyond textbook grammar into real-world idioms, discourse markers, and situational pragmatics.',
      sections: [
        {
          heading: '1. Essential Idioms for Everyday Life',
          icon: 'fa-solid fa-comments',
          text: "• 'Break a leg': Wishing someone good luck before a performance.\n• 'Under the weather': Feeling mildly sick or exhausted.\n• 'Hit the nail on the head': Saying exactly the right thing."
        },
        {
          heading: '2. Conversational Fillers and Softeners',
          icon: 'fa-solid fa-handshake',
          text: "Use softeners like 'Could you possibly...', 'Would you mind...', and 'I was wondering if...' to make requests courteous and natural in professional environments."
        }
      ],
      keyTakeaway: 'Language fluency is about connecting emotionally and pragmatically with listeners, not just compiling strings of dictionary vocabulary!'
    },
    en_s4_hub: {
      title: 'Chamber of Modals & Complex Clausal Structures',
      lead: 'Modal verbs and conditional clauses enable you to express nuance, hypothesis, deduction, and polite obligations.',
      sections: [
        {
          heading: '1. Modals of Deduction: Must, Can’t, Might',
          icon: 'fa-solid fa-magnifying-glass',
          text: "• Must: 95% certainty ('She must be at home; the lights are on').\n• Can’t: 95% certainty of impossibility ('He can't be at work; it's Sunday').\n• Might/Could: 50% possibility ('They might join us later')."
        },
        {
          heading: '2. Conditional Hierarchies (Types 0, 1, 2, 3)',
          icon: 'fa-solid fa-code-branch',
          text: "From scientific truths (Zero) to real possibilities (First), hypothetical dreams (Second), and past regrets (Third: 'If I had studied harder, I would have passed')."
        }
      ],
      keyTakeaway: 'Mastering modal nuances gives you the precision required for academic writing and professional business communication.'
    },
    en_s5_hub: {
      title: 'Sanctuary of Mastery: IELTS 7.5+ / CEFR C1 Strategy',
      lead: 'Reaching high-tier international certifications requires cohesive lexical resource, grammatical range, and rapid critical synthesis.',
      sections: [
        {
          heading: '1. Lexical Sophistication & Collocations',
          icon: 'fa-solid fa-book-journal-whills',
          text: 'Replace elementary vocabulary with natural collocations: instead of saying "big change", use "profound transformation" or "dramatic shift".'
        },
        {
          heading: '2. Cohesion and Coherence Strategies',
          icon: 'fa-solid fa-diagram-project',
          text: 'Use versatile transition words such as "Consequently", "Notwithstanding", "In light of", and "Conversely" to weave complex arguments together effortlessly.'
        }
      ],
      keyTakeaway: 'Consistent deliberate practice and exposure to authentic native material transforms your knowledge into unconscious competence!'
    }
  },
  vi: {
    vi_s1_hub: {
      title: 'Cổng Khởi Nguyên: Vũ Điệu 6 Thanh Âm & Âm Vận Tiếng Việt',
      lead: 'Tiếng Việt là một ngôn ngữ thanh điệu giàu nhạc tính. Sáu thanh điệu tựa như 6 nốt nhạc bổng trầm định hình nên linh hồn và vẻ đẹp của tiếng mẹ đẻ.',
      sections: [
        {
          heading: '1. Bản Đồ 6 Thanh Điệu Chuẩn: Ngang, Huyền, Sắc, Hỏi, Ngã, Nặng',
          icon: 'fa-solid fa-music',
          text: "• Thanh Ngang (Không dấu): Giọng bằng phẳng, cao vừa phải (Ví dụ: Ba, Ca, Hoa).\n• Thanh Huyền: Giọng trầm xuống nhẹ nhàng, êm dịu (Bà, Cà, Hòa).\n• Thanh Sắc: Giọng vút cao lên sắc bén, dứt khoát (Bá, Cá, Hóa).\n• Thanh Hỏi: Giọng hơi chùng xuống rồi hơi hất nhẹ lên (Bả, Cả, Hỏa).\n• Thanh Ngã: Giọng nghẽn thanh hầu một thoáng rồi vút lên (Bã, Hõa).\n• Thanh Nặng: Giọng đột ngột khép lại ở cuống họng, trầm đặc (Bạ, Cạ, Họa)."
        },
        {
          heading: '2. Quy Tắc Bỏ Dấu Thanh Mới Chuẩn Chính Tả',
          icon: 'fa-solid fa-feather-pointed',
          text: "Theo chuẩn chính tả hiện đại của Bộ Giáo Dục:\n• Với nguyên âm đôi có âm đệm (như oa, oe, uy): Đặt dấu thanh vào nguyên âm chính thứ hai (Ví dụ: Hóa, Thủy, Khỏe).\n• Với nguyên âm đôi không có âm cuối (ia, ya, ua, ưa): Đặt dấu ở nguyên âm đầu (Mía, Múa, Cửa).",
          callout: 'Bí kíp: Ngâm nga các câu ca dao hoặc thơ lục bát giúp đôi tai làm quen với nhạc tính bằng - trắc một cách tự nhiên nhất!'
        }
      ],
      keyTakeaway: 'Hiểu rõ vị trí và cao độ của 6 thanh điệu giúp bạn phát âm chuẩn xác, không bị nhầm lẫn giữa hỏi - ngã và làm chủ ngữ điệu Việt Nam!'
    },
    vi_s2_hub: {
      title: 'Cổ Tự Từ Vựng: Hệ Thống Từ Hán Việt & Đại Từ Xưng Hô Thân Tộc',
      lead: 'Hơn 60% vốn từ tiếng Việt bắt nguồn từ gốc Hán. Nắm được quy luật Hán Việt mở ra cánh cửa giải nghĩa hàng vạn từ ngữ triết học, văn hóa và pháp luật.',
      sections: [
        {
          heading: '1. Sức Mạnh Của Từ Tố Hán Việt',
          icon: 'fa-solid fa-scroll',
          text: "• 'Thủy' nghĩa là nước (Thủy điện, Thủy triều, Thủy ngân).\n• 'Mộc' nghĩa là cây cối (Mộc mạc, Thảo mộc, Mộc tinh).\n• 'Nhân' nghĩa là người hoặc lòng tốt (Nhân đạo, Nhân quyền, Nhân ái)."
        },
        {
          heading: '2. Đại Từ Xưng Hô Đậm Đà Tình Nghĩa',
          icon: 'fa-solid fa-users',
          text: "Khác với 'I' và 'You' đơn giản trong tiếng Anh, tiếng Việt dùng hệ thống xưng hô gia đình đưa vào giao tiếp xã hội (Ông, Bà, Bác, Chú, Cô, Anh, Chị, Em) thể hiện sự gắn kết và kính trọng."
        }
      ],
      keyTakeaway: 'Xưng hô chuẩn mực và hiểu từ Hán Việt là thước đo cốt lõi của sự tinh tế và am hiểu văn hóa người Việt!'
    },
    vi_s3_hub: {
      title: 'Phố Cổ Thành Ngữ: Ca Dao Tục Ngữ & Nghệ Thuật Ứng Xử Dân Gian',
      lead: 'Ca dao tục ngữ là kết tinh trí tuệ ngàn đời của ông cha, đúc kết kinh nghiệm sống và triết lý nhân sinh sâu sắc.',
      sections: [
        {
          heading: '1. Đạo Lý Ơn Nghĩa & Gia Đình',
          icon: 'fa-solid fa-heart',
          text: "• 'Uống nước nhớ nguồn' - Lòng biết ơn tiền nhân.\n• 'Bầu ơi thương lấy bí cùng' - Tình nghĩa đồng bào chia ngọt sẻ bùi.\n• 'Công cha như núi Thái Sơn, nghĩa mẹ như nước trong nguồn chảy ra'."
        }
      ],
      keyTakeaway: 'Vận dụng thành ngữ, tục ngữ đúng ngữ cảnh làm cho câu chuyện thêm phần duyên dáng, sâu lắng và giàu bản sắc.'
    },
    vi_s4_hub: {
      title: 'Viện Hàn Lâm Ngữ Pháp: Cấu Trúc Câu Phức & Nghệ Thuật Biểu Cảm',
      lead: 'Ngữ pháp tiếng Việt là ngữ pháp ngữ nghĩa và ngữ cảnh, giàu tính linh hoạt và đa tầng biểu cảm.',
      sections: [
        {
          heading: '1. Cặp Từ Hô Ứng & Quan Hệ Từ',
          icon: 'fa-solid fa-diagram-project',
          text: "• Vì... nên... (Nguyên nhân - kết quả).\n• Tuy... nhưng... (Tương phản, nhượng bộ).\n• Càng... càng... (Tương quan tăng tiến)."
        }
      ],
      keyTakeaway: 'Sử dụng linh hoạt các trợ từ và tình thái từ (nhé, nha, cơ, mà, đấy) giúp lời nói trở nên truyền cảm và thân thiết.'
    },
    vi_s5_hub: {
      title: 'Đỉnh Núi Vinh Danh: Đỉnh Cao Tiếng Việt & Bản Sắc Văn Hóa',
      lead: 'Chạm tay vào đỉnh cao tiếng Việt là cảm thụ được vẻ đẹp văn chương của Truyện Kiều, thơ Hồ Xuân Hương và những áng văn bất hủ.',
      sections: [
        {
          heading: '1. Vẻ Đẹp Ngôn Từ Thi Ca',
          icon: 'fa-solid fa-trophy',
          text: 'Tiếng Việt giàu thanh âm trầm bổng, khi đối xứng, khi dồn dập, ngân vang như tiếng chuông chùa, tha thiết như khúc dân ca ru hời.'
        }
      ],
      keyTakeaway: 'Yêu tiếng Việt là gìn giữ sự trong sáng của tiếng nước mình và tự hào lan tỏa văn hóa Việt ra toàn thế giới!'
    }
  }
};

class SlanguageReadingApp {
  private currentLang: 'ja' | 'en' | 'vi' = 'ja';
  private currentNodeId: string = 'ja_s1_hub';
  private nodeData: ReadingNodeData | null = null;
  private currentArticle: DungeonReadingArticle | null = null;

  // DOM Elements
  private btnExitReading: HTMLElement | null = null;
  private headerStageCrumb: HTMLElement | null = null;
  private headerNodeTitle: HTMLElement | null = null;
  private headerStreakVal: HTMLElement | null = null;
  private headerXPVal: HTMLElement | null = null;
  private headerHeartsVal: HTMLElement | null = null;
  private readingScrollProgressBar: HTMLElement | null = null;

  // Hero elements
  private stageHeroIcon: HTMLElement | null = null;
  private stageHeroTier: HTMLElement | null = null;
  private stageHeroTitle: HTMLElement | null = null;
  private stageHeroStatus: HTMLElement | null = null;
  private stageHeroXP: HTMLElement | null = null;
  private stageHeroReadTime: HTMLElement | null = null;
  private stageHeroUnlock: HTMLElement | null = null;

  // Content elements
  private articleStageBadge: HTMLElement | null = null;
  private articleMainTitle: HTMLElement | null = null;
  private articleLeadText: HTMLElement | null = null;
  private readingSectionsContainer: HTMLElement | null = null;
  private articleTakeawayText: HTMLElement | null = null;

  // Controls
  private btnFontDecr: HTMLElement | null = null;
  private btnFontIncr: HTMLElement | null = null;
  private fontSizeVal: HTMLElement | null = null;
  private btnNarrationToggle: HTMLElement | null = null;
  private narrationIcon: HTMLElement | null = null;
  private narrationText: HTMLElement | null = null;
  private btnCompleteReading: HTMLElement | null = null;

  // Modals
  private modalConfirmExit: HTMLElement | null = null;
  private btnCancelExit: HTMLElement | null = null;
  private btnConfirmExit: HTMLElement | null = null;
  private modalVictory: HTMLElement | null = null;
  private btnVictoryReturn: HTMLElement | null = null;
  private readingToast: HTMLElement | null = null;
  private readingToastText: HTMLElement | null = null;

  // State
  private fontScale: number = 1.0;
  private isSpeaking: boolean = false;
  private isCompleted: boolean = false;
  private totalXP: number = 2450;
  private currentHearts: number = 5;
  private currentStreak: number = 18;

  constructor() {
    this.initDOMElements();
    this.initUserData();
    this.loadNodeAndArticle();
    this.renderContent();
    this.attachEventListeners();
    this.initScrollTracker();
  }

  private initDOMElements(): void {
    this.btnExitReading = document.getElementById('btnExitReading');
    this.headerStageCrumb = document.getElementById('headerStageCrumb');
    this.headerNodeTitle = document.getElementById('headerNodeTitle');
    this.headerStreakVal = document.getElementById('headerStreakVal');
    this.headerXPVal = document.getElementById('headerXPVal');
    this.headerHeartsVal = document.getElementById('headerHeartsVal');
    this.readingScrollProgressBar = document.getElementById('readingScrollProgressBar');

    this.stageHeroIcon = document.getElementById('stageHeroIcon');
    this.stageHeroTier = document.getElementById('stageHeroTier');
    this.stageHeroTitle = document.getElementById('stageHeroTitle');
    this.stageHeroStatus = document.getElementById('stageHeroStatus');
    this.stageHeroXP = document.getElementById('stageHeroXP');
    this.stageHeroReadTime = document.getElementById('stageHeroReadTime');
    this.stageHeroUnlock = document.getElementById('stageHeroUnlock');

    this.articleStageBadge = document.getElementById('articleStageBadge');
    this.articleMainTitle = document.getElementById('articleMainTitle');
    this.articleLeadText = document.getElementById('articleLeadText');
    this.readingSectionsContainer = document.getElementById('readingSectionsContainer');
    this.articleTakeawayText = document.getElementById('articleTakeawayText');

    this.btnFontDecr = document.getElementById('btnFontDecr');
    this.btnFontIncr = document.getElementById('btnFontIncr');
    this.fontSizeVal = document.getElementById('fontSizeVal');
    this.btnNarrationToggle = document.getElementById('btnNarrationToggle');
    this.narrationIcon = document.getElementById('narrationIcon');
    this.narrationText = document.getElementById('narrationText');
    this.btnCompleteReading = document.getElementById('btnCompleteReading');

    this.modalConfirmExit = document.getElementById('modalConfirmExit');
    this.btnCancelExit = document.getElementById('btnCancelExit');
    this.btnConfirmExit = document.getElementById('btnConfirmExit');
    this.modalVictory = document.getElementById('modalVictory');
    this.btnVictoryReturn = document.getElementById('btnVictoryReturn');
    this.readingToast = document.getElementById('readingToast');
    this.readingToastText = document.getElementById('readingToastText');
  }

  private initUserData(): void {
    // Sync current lang
    const urlParams = new URLSearchParams(window.location.search);
    const paramLang = urlParams.get('lang');
    const paramNodeId = urlParams.get('nodeId');

    const savedLang = localStorage.getItem('slanguage_user_lang') as 'ja' | 'en' | 'vi';
    if (paramLang && (paramLang === 'ja' || paramLang === 'en' || paramLang === 'vi')) {
      this.currentLang = paramLang;
    } else if (savedLang && (savedLang === 'ja' || savedLang === 'en' || savedLang === 'vi')) {
      this.currentLang = savedLang;
    } else {
      this.currentLang = 'ja';
    }

    if (paramNodeId) {
      this.currentNodeId = paramNodeId;
    } else {
      this.currentNodeId = `${this.currentLang}_s1_hub`;
    }

    // Sync XP
    const savedXP = localStorage.getItem('slanguage_user_xp');
    if (savedXP) {
      this.totalXP = parseInt(savedXP, 10);
    } else {
      this.totalXP = 2450;
      localStorage.setItem('slanguage_user_xp', '2450');
    }

    // Sync Hearts
    const savedHearts = localStorage.getItem('slanguage_user_hearts');
    if (savedHearts) {
      this.currentHearts = parseInt(savedHearts, 10);
    } else {
      this.currentHearts = 5;
    }

    // Sync Streak
    const savedStreak = localStorage.getItem('slanguage_user_streak');
    if (savedStreak) {
      this.currentStreak = parseInt(savedStreak, 10);
    } else {
      this.currentStreak = 18;
    }

    // Check mastered state for current node
    const masteredKey = `slanguage_dungeon_mastered_${this.currentLang}`;
    const rawMastered = localStorage.getItem(masteredKey);
    if (rawMastered) {
      try {
        const masteredList: string[] = JSON.parse(rawMastered);
        if (masteredList.includes(this.currentNodeId)) {
          this.isCompleted = true;
        }
      } catch (e) {}
    }

    this.updateHUDStats();
  }

  private updateHUDStats(): void {
    if (this.headerStreakVal) this.headerStreakVal.textContent = `${this.currentStreak} Ngày`;
    if (this.headerXPVal) this.headerXPVal.textContent = `${this.totalXP} XP`;
    if (this.headerHeartsVal) this.headerHeartsVal.textContent = `${this.currentHearts}/5`;
  }

  private loadNodeAndArticle(): void {
    // 1. Try reading from active reading node in localStorage
    const rawActive = localStorage.getItem('slanguage_active_reading_node');
    if (rawActive) {
      try {
        const parsed = JSON.parse(rawActive);
        if (parsed.node && parsed.node.id === this.currentNodeId) {
          this.nodeData = parsed.node;
          if (parsed.node.readingArticle) {
            this.currentArticle = parsed.node.readingArticle;
          }
        }
      } catch (e) {}
    }

    // 2. Fallback to curated articles repository
    if (!this.currentArticle) {
      const langArticles = articlesDB[this.currentLang] || articlesDB.ja;
      this.currentArticle = langArticles[this.currentNodeId] || langArticles[`${this.currentLang}_s1_hub`] || articlesDB.ja.ja_s1_hub;
    }

    // 3. Fallback node metadata if not present
    if (!this.nodeData) {
      let stageNum = 1;
      const match = this.currentNodeId.match(/_s(\d+)_/);
      if (match) {
        stageNum = parseInt(match[1], 10);
      }
      this.nodeData = {
        id: this.currentNodeId,
        stage: stageNum,
        stageName: `MỐC CHỦ ĐỀ ${stageNum}`,
        title: this.currentArticle?.title || 'Bài Đọc Chuyên Đề',
        desc: 'Trạm trung chuyển kiến thức cốt lõi',
        icon: 'fa-solid fa-book-open',
        status: this.isCompleted ? 'mastered' : 'available',
        isHub: true,
        readingArticle: this.currentArticle || undefined
      };
    }
  }

  private renderContent(): void {
    if (!this.nodeData || !this.currentArticle) return;

    // Header nav crumb
    if (this.headerStageCrumb) {
      this.headerStageCrumb.textContent = `MỐC CHỦ ĐỀ ${this.nodeData.stage}`;
    }
    if (this.headerNodeTitle) {
      this.headerNodeTitle.textContent = this.currentArticle.title;
    }

    // Stage Hero Banner
    if (this.stageHeroTier) {
      this.stageHeroTier.textContent = this.nodeData.stageName || `MỐC CHỦ ĐỀ ${this.nodeData.stage}`;
    }
    if (this.stageHeroTitle) {
      this.stageHeroTitle.textContent = this.currentArticle.title;
    }
    if (this.stageHeroIcon) {
      this.stageHeroIcon.className = this.nodeData.icon || 'fa-solid fa-book-open';
    }

    if (this.stageHeroStatus) {
      if (this.isCompleted) {
        this.stageHeroStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> Đã hoàn thành 🌟';
        this.stageHeroStatus.style.borderColor = 'rgba(16, 185, 129, 0.6)';
        this.stageHeroStatus.style.color = '#34d399';
      } else {
        this.stageHeroStatus.innerHTML = '<i class="fa-solid fa-book-reader"></i> Bài đọc mở đường 📖';
      }
    }

    // Article Content
    if (this.articleStageBadge) {
      this.articleStageBadge.textContent = `Giai đoạn ${this.nodeData.stage}`;
    }
    if (this.articleMainTitle) {
      this.articleMainTitle.textContent = this.currentArticle.title;
    }
    if (this.articleLeadText) {
      this.articleLeadText.textContent = this.currentArticle.lead;
    }

    // Sections
    if (this.readingSectionsContainer) {
      this.readingSectionsContainer.innerHTML = this.currentArticle.sections.map((sec, idx) => `
        <section class="reading-section-box">
          <h3 class="reading-section-heading">
            ${sec.icon ? `<i class="${sec.icon}"></i>` : `<i class="fa-solid fa-bookmark"></i>`}
            <span>${sec.heading}</span>
          </h3>
          <p class="reading-section-text">${this.formatText(sec.text)}</p>
          ${sec.callout ? `
            <div class="reading-callout-box">
              <i class="fa-solid fa-lightbulb"></i>
              <span>${sec.callout}</span>
            </div>
          ` : ''}
        </section>
      `).join('');
    }

    // Key Takeaway
    if (this.articleTakeawayText) {
      this.articleTakeawayText.textContent = this.currentArticle.keyTakeaway;
    }

    // Complete Button state
    if (this.btnCompleteReading) {
      if (this.isCompleted) {
        this.btnCompleteReading.classList.add('completed');
        this.btnCompleteReading.innerHTML = '<i class="fa-solid fa-circle-check"></i> Đã hoàn thành bài đọc (Trở về lộ trình)';
      } else {
        this.btnCompleteReading.classList.remove('completed');
        this.btnCompleteReading.innerHTML = '<i class="fa-solid fa-book-reader"></i> Đã Đọc Xong & Hoàn Thành Chủ Đề 🌟';
      }
    }
  }

  private formatText(rawText: string): string {
    if (!rawText) return '';
    return rawText
      .replace(/\\n/g, '<br>')
      .replace(/\n/g, '<br>')
      .replace(/•/g, '<span style="color:#00b4d8; font-weight:800; margin-right:4px;">•</span>');
  }

  private attachEventListeners(): void {
    // Exit navigation
    if (this.btnExitReading) {
      this.btnExitReading.addEventListener('click', () => {
        if (!this.isCompleted) {
          this.openConfirmExitModal();
        } else {
          this.returnToRoadmap();
        }
      });
    }

    // Modal Exit actions
    if (this.btnCancelExit) {
      this.btnCancelExit.addEventListener('click', () => {
        this.closeConfirmExitModal();
      });
    }
    if (this.btnConfirmExit) {
      this.btnConfirmExit.addEventListener('click', () => {
        this.closeConfirmExitModal();
        this.returnToRoadmap();
      });
    }

    // Victory modal return
    if (this.btnVictoryReturn) {
      this.btnVictoryReturn.addEventListener('click', () => {
        this.returnToRoadmap();
      });
    }

    // Font scaling
    if (this.btnFontIncr) {
      this.btnFontIncr.addEventListener('click', () => {
        this.adjustFontSize(0.1);
      });
    }
    if (this.btnFontDecr) {
      this.btnFontDecr.addEventListener('click', () => {
        this.adjustFontSize(-0.1);
      });
    }

    // Audio TTS Narration
    if (this.btnNarrationToggle) {
      this.btnNarrationToggle.addEventListener('click', () => {
        this.toggleNarration();
      });
    }

    // Complete button
    if (this.btnCompleteReading) {
      this.btnCompleteReading.addEventListener('click', () => {
        this.handleCompleteReading();
      });
    }
  }

  private initScrollTracker(): void {
    window.addEventListener('scroll', () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        const percent = Math.min(100, Math.max(0, (scrollTop / docHeight) * 100));
        if (this.readingScrollProgressBar) {
          this.readingScrollProgressBar.style.width = `${percent.toFixed(1)}%`;
        }
      }
    });
  }

  private adjustFontSize(delta: number): void {
    this.fontScale = Math.min(1.3, Math.max(0.85, parseFloat((this.fontScale + delta).toFixed(2))));
    document.documentElement.style.setProperty('--reading-font-scale', this.fontScale.toString());
    if (this.fontSizeVal) {
      this.fontSizeVal.textContent = `${Math.round(this.fontScale * 100)}%`;
    }
  }

  private toggleNarration(): void {
    if (!('speechSynthesis' in window)) {
      this.showToast('Trình duyệt không hỗ trợ tổng hợp giọng nói Web Speech.');
      return;
    }

    if (this.isSpeaking) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
      this.updateNarrationUI(false);
      return;
    }

    if (!this.currentArticle) return;

    // Build plain text for TTS
    let fullText = `${this.currentArticle.title}. ${this.currentArticle.lead}. `;
    this.currentArticle.sections.forEach(sec => {
      fullText += `${sec.heading}. ${sec.text}. `;
      if (sec.callout) fullText += `${sec.callout}. `;
    });
    fullText += `Điểm cốt lõi: ${this.currentArticle.keyTakeaway}.`;

    // Strip Markdown / HTML tags & bullets
    const cleanText = fullText.replace(/<[^>]*>/g, ' ').replace(/[•\\n]/g, ' ');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    // Pick appropriate voice
    const voices = window.speechSynthesis.getVoices();
    let voice = voices.find(v => v.lang.startsWith(this.currentLang === 'ja' ? 'ja' : this.currentLang === 'en' ? 'en' : 'vi'));
    if (!voice && voices.length > 0) {
      voice = voices.find(v => v.lang.includes('vi') || v.lang.includes('en'));
    }
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      this.isSpeaking = false;
      this.updateNarrationUI(false);
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      this.updateNarrationUI(false);
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    this.isSpeaking = true;
    this.updateNarrationUI(true);
  }

  private updateNarrationUI(speaking: boolean): void {
    if (!this.btnNarrationToggle || !this.narrationIcon || !this.narrationText) return;
    if (speaking) {
      this.btnNarrationToggle.classList.add('playing');
      this.narrationIcon.className = 'fa-solid fa-volume-xmark';
      this.narrationText.textContent = 'Dừng đọc (Đang phát...)';
    } else {
      this.btnNarrationToggle.classList.remove('playing');
      this.narrationIcon.className = 'fa-solid fa-volume-high';
      this.narrationText.textContent = 'Nghe bài đọc (Audio TTS)';
    }
  }

  private handleCompleteReading(): void {
    // Stop audio narration if active
    if (this.isSpeaking && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
      this.updateNarrationUI(false);
    }

    if (!this.nodeData) return;

    if (!this.isCompleted) {
      this.isCompleted = true;

      // 1. Mark node as mastered in localStorage
      this.markNodeMastered(this.currentNodeId);

      // (LƯU Ý: KHÔNG CỘNG THÊM ĐIỂM EXP KHI HOÀN THÀNH BÀI ĐỌC THEO LOGIC CŨ)

      // 2. Update Study time (+5 mins)
      let totalMins = parseInt(localStorage.getItem('slanguage_total_study_minutes') || '2910', 10);
      totalMins += 5;
      localStorage.setItem('slanguage_total_study_minutes', totalMins.toString());

      // 3. Update button state
      if (this.btnCompleteReading) {
        this.btnCompleteReading.classList.add('completed');
        this.btnCompleteReading.innerHTML = '<i class="fa-solid fa-circle-check"></i> Đã hoàn thành bài đọc (Trở về lộ trình)';
      }

      // 4. Save recent lessons history (0 XP)
      this.saveRecentLesson(this.nodeData);

      // 5. Thông báo Toast theo logic cũ
      this.showToast(`Bạn đã hoàn thành bài đọc Mốc ${this.nodeData.stage}! Thử thách mức độ Dễ đã sẵn sàng khiêu chiến.`);
    }

    // Hiển thị modal chúc mừng theo model và logic cũ
    this.openVictoryModal();
  }

  private markNodeMastered(nodeId: string): void {
    const key = `slanguage_dungeon_mastered_${this.currentLang}`;
    const raw = localStorage.getItem(key);
    let masteredIds: string[] = [];
    if (raw) {
      try {
        masteredIds = JSON.parse(raw);
      } catch (e) {
        masteredIds = [];
      }
    }
    if (!masteredIds.includes(nodeId)) {
      masteredIds.push(nodeId);
      localStorage.setItem(key, JSON.stringify(masteredIds));
    }
  }

  private saveRecentLesson(node: ReadingNodeData): void {
    const raw = localStorage.getItem('slanguage_recent_lessons');
    let history: any[] = [];
    if (raw) {
      try {
        history = JSON.parse(raw);
      } catch (e) {
        history = [];
      }
    }

    const item = {
      title: node.title,
      sub: `${node.stageName || `Mốc ${node.stage}`} (Bài đọc chuyên đề)`,
      icon: node.icon || 'fa-solid fa-book-open',
      time: 'Vừa xong',
      xp: '0 XP'
    };

    history.unshift(item);
    if (history.length > 5) history.pop();
    localStorage.setItem('slanguage_recent_lessons', JSON.stringify(history));
  }

  private openConfirmExitModal(): void {
    if (this.modalConfirmExit) {
      this.modalConfirmExit.classList.add('active');
    }
  }

  private closeConfirmExitModal(): void {
    if (this.modalConfirmExit) {
      this.modalConfirmExit.classList.remove('active');
    }
  }

  private openVictoryModal(): void {
    if (this.modalVictory) {
      if (this.nodeData) {
        const titleEl = document.getElementById('victoryModalTitle');
        const descEl = document.getElementById('victoryModalDesc');
        if (titleEl) {
          titleEl.textContent = 'Xuất Sắc! Tiếp Thu Hoàn Tất! 🌟';
        }
        if (descEl) {
          descEl.innerHTML = `Bạn đã hoàn thành bài đọc chuyên đề của <strong>${this.nodeData.stageName || `Mốc ${this.nodeData.stage}`}</strong>!<br>Thử thách mức độ <strong>Dễ</strong> đã sẵn sàng khiêu chiến.`;
        }
      }
      this.modalVictory.classList.add('active');
    }
  }

  private returnToRoadmap(): void {
    window.location.href = `../roadmap/index.html?lang=${this.currentLang}`;
  }

  private showToast(message: string): void {
    if (!this.readingToast || !this.readingToastText) return;
    this.readingToastText.textContent = message;
    this.readingToast.classList.add('show');
    setTimeout(() => {
      this.readingToast?.classList.remove('show');
    }, 3200);
  }
}

// Global initialization
declare global {
  interface Window {
    readingApp: SlanguageReadingApp | null;
    initSlanguageReadingApp: () => void;
  }
}

window.readingApp = null;
window.initSlanguageReadingApp = function() {
  if (!window.readingApp) {
    window.readingApp = new SlanguageReadingApp();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.initSlanguageReadingApp();
});
