/**
 * Slanguage - Smart Vocabulary Practice TypeScript Module
 * Features:
 * - Multi-language vocabulary decks (English, Japanese, Vietnamese)
 * - 3D Flashcard Spaced Repetition System (SRS)
 * - Web Speech API text-to-speech pronunciation
 * - Speed Quiz Arena with streak bonus & countdown
 * - Searchable Vocabulary Vault with filter categories
 * - Shared localStorage persistence for XP, streaks, and current language
 */

interface VocabItem {
  id: string;
  word: string;
  phonetic: string;
  level: string;
  tag: string;
  meaning: string;
  exampleTarget: string;
  exampleMeaning: string;
  nuance: string;
  status: 'mastered' | 'unmastered';
  category: 'daily' | 'work' | 'idioms' | 'urgent';
}

interface LanguageVocabData {
  langId: 'ja' | 'en' | 'vi';
  name: string;
  nativeName: string;
  flagImg: string;
  heroTitle: string;
  heroDesc: string;
  ttsCode: string;
  deck: VocabItem[];
}

const vocabDatabase: Record<string, LanguageVocabData> = {
  ja: {
    langId: 'ja',
    name: 'Tiếng Nhật',
    nativeName: '日本語',
    flagImg: '../assets/flags/flag-jp.png',
    heroTitle: 'Luyện Từ Vựng Thông Minh: Tiếng Nhật (JLPT N5)',
    heroDesc: 'Hệ thống lặp lại ngắt quãng thông minh tự động đo lường độ phản xạ của não bộ, nhắc lại đúng thời điểm vàng trước khi bạn kịp quên.',
    ttsCode: 'ja-JP',
    deck: [
      {
        id: 'ja-1',
        word: '美味しい (Oishii)',
        phonetic: '/oɪ.ʃiː/ - [Tính từ đuôi い]',
        level: 'JLPT N5',
        tag: 'Ẩm thực & Thường nhật',
        meaning: 'Ngon miệng, thơm ngon, đậm đà',
        exampleTarget: '「このラーメンはとても美味しいですね！」',
        exampleMeaning: '"Món ramen này thực sự rất là ngon miệng đấy nhỉ!"',
        nuance: 'Thường nói sau khi nếm thử đồ ăn, có thể kéo dài "Oishiii~" để thể hiện sự cảm thán.',
        status: 'mastered',
        category: 'daily'
      },
      {
        id: 'ja-2',
        word: '頑張る (Ganbaru)',
        phonetic: '/ɡam.ba.ɾɯ/ - [Động từ nhóm 1]',
        level: 'JLPT N5',
        tag: 'Giao tiếp hàng ngày',
        meaning: 'Cố gắng hết mình, nỗ lực kiên trì',
        exampleTarget: '「明日の日本語の試験、頑張ってください！」',
        exampleMeaning: '"Kỳ thi tiếng Nhật ngày mai, hãy cố gắng hết sức nhé!"',
        nuance: 'Là nét văn hóa cổ vũ tinh thần đặc trưng của người Nhật (Ganbatte kudasai).',
        status: 'mastered',
        category: 'daily'
      },
      {
        id: 'ja-3',
        word: '木漏れ日 (Komorebi)',
        phonetic: '/ko.mo.ɾe.bi/ - [Danh từ văn học]',
        level: 'Từ vựng thi vị',
        tag: 'Thiên nhiên & Cảm xúc',
        meaning: 'Ánh nắng lấp lánh xuyên qua kẽ lá',
        exampleTarget: '「森の中を歩くと、美しい木漏れ日が差し込んでいた。」',
        exampleMeaning: '"Khi dạo bước trong rừng, những tia nắng len lỏi qua tán lá đẹp tuyệt vời."',
        nuance: 'Từ ngữ độc nhất vô nhị trong tiếng Nhật miêu tả vẻ đẹp thanh tao của tự nhiên.',
        status: 'unmastered',
        category: 'idioms'
      },
      {
        id: 'ja-4',
        word: '一期一会 (Ichigo Ichie)',
        phonetic: '/i.tɕi.ɡo i.tɕi.e/ - [Yojijukugo]',
        level: 'Thành ngữ 4 chữ',
        tag: 'Triết lý & Trà đạo',
        meaning: 'Đời người chỉ gặp một lần (Trân quý từng cuộc hội ngộ)',
        exampleTarget: '「お客様との出会いを一期一会として大切にする。」',
        exampleMeaning: '"Luôn trân trọng cuộc gặp gỡ với mỗi khách hàng như cơ duyên duy nhất trong đời."',
        nuance: 'Bắt nguồn từ văn hóa trà đạo Sen no Rikyu, nhắc nhở ta sống trọn vẹn cho hiện tại.',
        status: 'unmastered',
        category: 'idioms'
      },
      {
        id: 'ja-5',
        word: 'お疲れ様 (Otsukaresama)',
        phonetic: '/o.tsɯ.ka.ɾe.sa.ma/ - [Lời chào công sở]',
        level: 'Tiếng Nhật công sở',
        tag: 'Công việc & Văn phòng',
        meaning: 'Bạn đã vất vả rồi / Cảm ơn vì một ngày làm việc',
        exampleTarget: '「今日も一日、お疲れ様でした！」',
        exampleMeaning: '"Hôm nay mọi người đã làm việc vất vả rồi, cảm ơn nhiều!"',
        nuance: 'Câu cửa miệng bắt buộc khi kết thúc ngày làm việc hoặc chia tay đồng nghiệp.',
        status: 'unmastered',
        category: 'work'
      },
      {
        id: 'ja-6',
        word: '懐かしい (Natsukashii)',
        phonetic: '/na.tsɯ.ka.ɕiː/ - [Tính từ đuôi い]',
        level: 'JLPT N4',
        tag: 'Cảm xúc hoài niệm',
        meaning: 'Nhớ nhung, gợi lại kỷ niệm xưa đẹp đẽ',
        exampleTarget: '「高校時代の写真を見ると、とても懐かしい気持ちになる。」',
        exampleMeaning: '"Mỗi khi xem lại những bức ảnh thời cấp 3, lòng tôi lại trào dâng bao hoài niệm."',
        nuance: 'Dùng khi bắt gặp một món đồ, bài hát hay khung cảnh gợi nhớ về quá khứ ấm áp.',
        status: 'unmastered',
        category: 'daily'
      }
    ]
  },
  en: {
    langId: 'en',
    name: 'English (Tiếng Anh)',
    nativeName: 'English',
    flagImg: '../assets/flags/flag-us.png',
    heroTitle: 'Smart Vocabulary Mastery: Advanced Fluency & Idioms',
    heroDesc: 'Accelerate your retention curve with context-rich idioms, workplace collocations, and native speech models.',
    ttsCode: 'en-US',
    deck: [
      {
        id: 'en-1',
        word: 'Hit the nail on the head',
        phonetic: '/hɪt ðə neɪl ɒn ðə hed/ - [Idiom]',
        level: 'CEFR C1',
        tag: 'Business & Negotiation',
        meaning: 'Nói trúng phóc, hoàn toàn chính xác điểm mấu chốt',
        exampleTarget: '"Your strategic presentation really hit the nail on the head regarding our bottleneck."',
        exampleMeaning: '"Bài thuyết trình chiến lược của bạn đã chỉ đúng ngay điểm thắt nghẽn của chúng ta."',
        nuance: 'Thường dùng trong các buổi họp hay tranh luận khi ai đó đưa ra nhận định cực chuẩn.',
        status: 'mastered',
        category: 'work'
      },
      {
        id: 'en-2',
        word: 'Serendipity',
        phonetic: '/ˌser.ənˈdɪp.ə.ti/ - [Noun]',
        level: 'Advanced Vocabulary',
        tag: 'Cảm xúc & Cuộc sống',
        meaning: 'Sự tình cờ may mắn mang lại điều tốt đẹp bất ngờ',
        exampleTarget: '"Meeting my co-founder in a small Tokyo coffee shop was pure serendipity."',
        exampleMeaning: '"Gặp gỡ người bạn đồng sáng lập trong quán cà phê nhỏ ở Tokyo quả là duyên may kỳ diệu."',
        nuance: 'Được bình chọn là một trong những từ đẹp nhất trong tiếng Anh miêu tả sự tình cờ định mệnh.',
        status: 'mastered',
        category: 'idioms'
      },
      {
        id: 'en-3',
        word: 'Resilient',
        phonetic: '/rɪˈzɪl.jənt/ - [Adjective]',
        level: 'CEFR B2',
        tag: 'Tính cách & Năng lực',
        meaning: 'Kiên cường, bền bỉ, có khả năng phục hồi nhanh sau khó khăn',
        exampleTarget: '"The startup remained highly resilient despite global market disruptions."',
        exampleMeaning: '"Công ty khởi nghiệp vẫn kiên cường vượt qua dù thị trường thế giới biến động mạnh."',
        nuance: 'Dùng khen ngợi tinh thần vượt khó của con người hoặc sự vững chãi của hệ thống.',
        status: 'unmastered',
        category: 'work'
      },
      {
        id: 'en-4',
        word: 'Bite the bullet',
        phonetic: '/baɪt ðə ˈbʊl.ɪt/ - [Idiom]',
        level: 'CEFR C1',
        tag: 'Giao tiếp hàng ngày',
        meaning: 'Cắn răng chịu đựng, dũng cảm đối mặt với việc khó',
        exampleTarget: '"I decided to bite the bullet and invest all my savings into the project."',
        exampleMeaning: '"Tôi quyết định cắn răng chịu mạo hiểm dốc hết tiền tiết kiệm vào dự án."',
        nuance: 'Xuất phát từ thời xưa binh lính cắn viên đạn chì để kìm cơn đau khi phẫu thuật chiến trường.',
        status: 'unmastered',
        category: 'idioms'
      },
      {
        id: 'en-5',
        word: 'Eloquent',
        phonetic: '/ˈel.ə.kwənt/ - [Adjective]',
        level: 'CEFR C1',
        tag: 'Kỹ năng trình bày',
        meaning: 'Hùng biện lưu loát, diễn đạt đầy sức thuyết phục',
        exampleTarget: '"Her eloquent speech inspired thousands of young entrepreneurs."',
        exampleMeaning: '"Bài phát biểu hùng hồn của cô ấy đã truyền cảm hứng cho hàng ngàn bạn trẻ khởi nghiệp."',
        nuance: 'Khen ngợi phong thái nói chuyện hoặc văn phong mượt mà, sâu sắc và lay động lòng người.',
        status: 'unmastered',
        category: 'daily'
      }
    ]
  },
  vi: {
    langId: 'vi',
    name: 'Tiếng Việt',
    nativeName: 'Tiếng Việt',
    flagImg: '../assets/flags/flag-vn.png',
    heroTitle: 'Luyện Từ Vựng & Thành Ngữ Tiếng Việt Chuyên Sâu',
    heroDesc: 'Khám phá vẻ đẹp ngôn ngữ mẹ đẻ qua các điển tích, thành ngữ dân gian và từ ngữ xu hướng hiện đại.',
    ttsCode: 'vi-VN',
    deck: [
      {
        id: 'vi-1',
        word: 'Học ăn, học nói',
        phonetic: '/hɔk˧˨ʔ an hoːk˧˨ʔ nɔj˧˦/ - [Thành ngữ]',
        level: 'Văn hóa ứng xử',
        tag: 'Đạo đức & Giao tiếp',
        meaning: 'Rèn luyện những chuẩn mực căn bản và văn minh trong cách đối nhân xử thế',
        exampleTarget: '"Cổ nhân dạy: Học ăn, học nói, học gói, học mở để hoàn thiện nhân cách."',
        exampleMeaning: '"Lời khuyên về việc học hỏi toàn diện từ cách ăn mặc, nói năng đến việc cư xử khéo léo."',
        nuance: 'Thể hiện triết lý giáo dục nhân văn và lễ nghi sâu sắc trong đời sống người Việt.',
        status: 'mastered',
        category: 'idioms'
      },
      {
        id: 'vi-2',
        word: 'Chân cứng đá mềm',
        phonetic: '/tɕən kɯŋ˧˦ ɗaː˧˦ mɛm˧˨/ - [Thành ngữ]',
        level: 'Thành ngữ cổ',
        tag: 'Ý chí & Lời chúc',
        meaning: 'Ý chí kiên định vượt qua mọi chông gai thử thách',
        exampleTarget: '"Chúc bạn lên đường thượng lộ bình an, chân cứng đá mềm gặt hái thành công!"',
        exampleMeaning: '"Lời chúc gửi gắm niềm tin vào nghị lực phi thường của người ra đi lập nghiệp."',
        nuance: 'Dùng như lời chúc may mắn, chúc sự bền gan vững chí trước hành trình lớn.',
        status: 'mastered',
        category: 'idioms'
      },
      {
        id: 'vi-3',
        word: 'Chân thành',
        phonetic: '/tɕən tʰa̤ŋ˨˩/ - [Tính từ]',
        level: 'Đời sống thường nhật',
        tag: 'Phẩm chất con người',
        meaning: 'Thành thật từ đáy lòng, không dối trá vụ lợi',
        exampleTarget: '"Tình bạn bền vững luôn bắt đầu từ những điều chân thành nhất."',
        exampleMeaning: '"Sự mộc mạc và trung thực là chìa khóa gắn kết mọi trái tim."',
        nuance: 'Một trong những giá trị cốt lõi đẹp nhất trong văn hóa gắn kết người Việt Nam.',
        status: 'unmastered',
        category: 'daily'
      },
      {
        id: 'vi-4',
        word: 'Cà phê bệt',
        phonetic: '/kaː fe bət˧˨ʔ/ - [Văn hóa hiện đại]',
        level: 'Đời sống Sài Gòn',
        tag: 'Văn hóa đô thị',
        meaning: 'Ngồi uống cà phê bệt trên thềm gạch, vỉa hè thoáng mát',
        exampleTarget: '"Sáng cuối tuần ra nhà thờ Đức Bà ngồi cà phê bệt ngắm phố xá thong dong."',
        exampleMeaning: '"Nét sinh hoạt đường phố bình dị, cởi mở đặc trưng của giới trẻ Việt Nam."',
        nuance: 'Mang đậm tính giao lưu phóng khoáng, tự do và gần gũi với thiên nhiên.',
        status: 'unmastered',
        category: 'daily'
      }
    ]
  }
};

class SlanguageVocabulary {
  private currentLang: 'ja' | 'en' | 'vi' = 'ja';
  private currentDeck: VocabItem[] = [];
  private activeCardIndex = 0;
  private currentXP = 2450;
  private quizStreak = 0;
  private quizScore = 0;
  private quizTimerInterval: number | null = null;
  private quizRemainingTime = 15;
  private currentQuizItem: VocabItem | null = null;

  constructor() {
    if (localStorage.getItem('slanguage_is_logged_in') !== 'true') {
      window.location.replace('../login/index.html');
      return;
    }
    this.loadInitialState();
    this.bindNavbarDropdowns();
    this.syncNavbarStats();
    this.initHeroStats();
    this.initModeTabs();
    this.initFlashcardDeck();
    this.initSpeedQuiz();
    this.initVocabularyVault();
    this.bindShortcuts();
    this.bindPageTransitions();
  }

  private loadInitialState(): void {
    let savedLang = (localStorage.getItem('slanguage_active_language') || localStorage.getItem('slanguage_current_lang') || localStorage.getItem('slanguage_user_lang') || 'ja') as 'ja' | 'en' | 'vi';
    if (savedLang === 'en' || savedLang === 'ja' || savedLang === 'vi') {
      this.currentLang = savedLang;
    } else {
      this.currentLang = 'ja';
    }
    localStorage.setItem('slanguage_current_lang', this.currentLang);
    localStorage.setItem('slanguage_active_language', this.currentLang);
    localStorage.setItem('slanguage_user_lang', this.currentLang);

    const savedXP = localStorage.getItem('slanguage_user_xp');
    if (savedXP !== null) {
      const clean = savedXP.replace(/[^0-9]/g, '');
      const parsed = parseInt(clean, 10);
      if (!isNaN(parsed)) {
        this.currentXP = parsed;
      }
    }

    this.loadSavedWordStatuses();
    this.updateCurrentDeck();
  }

  private updateCurrentDeck(filterCategory: string = 'all'): void {
    const langData = vocabDatabase[this.currentLang] || vocabDatabase.ja;
    if (filterCategory === 'all') {
      this.currentDeck = [...langData.deck];
    } else {
      this.currentDeck = langData.deck.filter(item => item.category === filterCategory);
      if (this.currentDeck.length === 0) {
        this.currentDeck = [...langData.deck];
      }
    }
    this.activeCardIndex = 0;
  }

  // ================= NAVBAR & DROPDOWNS =================
  private bindNavbarDropdowns(): void {
    const langDropdown = document.getElementById('langDropdown');
    const langDropdownBtn = document.getElementById('langDropdownBtn');
    const userDropdown = document.getElementById('userDropdown');
    const userDropdownBtn = document.getElementById('userDropdownBtn');

    if (langDropdown && langDropdownBtn) {
      langDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = langDropdown.classList.contains('open') || langDropdown.classList.contains('active');
        if (isOpen) {
          langDropdown.classList.remove('open', 'active', 'show');
          langDropdownBtn.setAttribute('aria-expanded', 'false');
        } else {
          langDropdown.classList.add('open', 'active', 'show');
          langDropdownBtn.setAttribute('aria-expanded', 'true');
          if (userDropdown && userDropdownBtn) {
            userDropdown.classList.remove('open', 'active', 'show');
            userDropdownBtn.setAttribute('aria-expanded', 'false');
          }
        }
      });
    }

    if (userDropdown && userDropdownBtn) {
      userDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = userDropdown.classList.contains('open') || userDropdown.classList.contains('active');
        if (isOpen) {
          userDropdown.classList.remove('open', 'active', 'show');
          userDropdownBtn.setAttribute('aria-expanded', 'false');
        } else {
          userDropdown.classList.add('open', 'active', 'show');
          userDropdownBtn.setAttribute('aria-expanded', 'true');
          if (langDropdown && langDropdownBtn) {
            langDropdown.classList.remove('open', 'active', 'show');
            langDropdownBtn.setAttribute('aria-expanded', 'false');
          }
        }
      });
    }

    // Close on click outside
    document.addEventListener('click', (e) => {
      const target = e.target as Node;
      if (langDropdown && !langDropdown.contains(target)) {
        langDropdown.classList.remove('open', 'active', 'show');
        if (langDropdownBtn) langDropdownBtn.setAttribute('aria-expanded', 'false');
      }
      if (userDropdown && !userDropdown.contains(target)) {
        userDropdown.classList.remove('open', 'active', 'show');
        if (userDropdownBtn) userDropdownBtn.setAttribute('aria-expanded', 'false');
      }
    });

    const langItems = document.querySelectorAll('.lang-dropdown-item');
    langItems.forEach(item => {
      item.addEventListener('click', () => {
        const selectedLang = item.getAttribute('data-lang') as 'ja' | 'en' | 'vi';
        if (selectedLang && selectedLang !== this.currentLang) {
          this.switchLanguage(selectedLang);
        }
        if (langDropdown) {
          langDropdown.classList.remove('open', 'active', 'show');
          if (langDropdownBtn) langDropdownBtn.setAttribute('aria-expanded', 'false');
        }
      });
    });

    const logoutBtn = document.getElementById('navLogoutItem');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.setItem('slanguage_is_logged_in', 'false');
      });
    }
  }

  private syncNavbarStats(): void {
    const navXPVal = document.getElementById('headerXPVal') || document.getElementById('navXPVal');
    if (navXPVal) {
      navXPVal.textContent = `${this.currentXP.toLocaleString()} XP`;
    }
    const dropXP = document.getElementById('dropdownXPVal');
    if (dropXP) dropXP.textContent = `${this.currentXP.toLocaleString()} XP`;

    // Check saved Hearts (Mạng / Máu sinh lực)
    const savedHearts = localStorage.getItem('slanguage_user_hearts');
    const hearts = savedHearts !== null ? Math.max(0, Math.min(5, parseInt(savedHearts, 10))) : 5;
    const heartsBadge = document.getElementById('headerHeartsVal') || document.getElementById('navHeartsVal');
    if (heartsBadge) {
      heartsBadge.textContent = `${hearts}/5`;
    }
    const dropHearts = document.getElementById('dropdownHeartsVal');
    if (dropHearts) dropHearts.textContent = `${hearts}/5`;

    // Check saved Streak
    const savedStreak = localStorage.getItem('slanguage_user_streak') || '18';
    const streakBadge = document.getElementById('headerStreakVal');
    if (streakBadge) {
      streakBadge.textContent = `${savedStreak} Ngày`;
    }
    const dropStreak = document.getElementById('dropdownStreakVal');
    if (dropStreak) dropStreak.textContent = `${savedStreak} Ngày`;

    // Check saved user name
    const savedUserName = localStorage.getItem('slanguage_user_name') || 'Vua Xứ Thanh';
    document.querySelectorAll('.user-info-text .name, #dropdownUserName').forEach(el => {
      el.textContent = savedUserName;
    });

    // Auth state synchronization
    const isLoggedIn = localStorage.getItem('slanguage_is_logged_in') === 'true';
    if (isLoggedIn) {
      document.body.classList.add('user-authenticated');
      document.body.classList.remove('user-guest');
    } else {
      document.body.classList.add('user-guest');
      document.body.classList.remove('user-authenticated');
    }

    this.updateDropdownUI();
  }

  private updateDropdownUI(): void {
    const langData = vocabDatabase[this.currentLang];
    const currentLangFlag = document.getElementById('currentLangFlag') as HTMLImageElement;
    const currentLangLabel = document.getElementById('currentLangLabel');

    if (currentLangFlag) currentLangFlag.src = langData.flagImg;
    if (currentLangLabel) currentLangLabel.textContent = langData.name;

    document.querySelectorAll<HTMLElement>('.lang-dropdown-item').forEach(item => {
      item.style.display = 'flex';
      const lang = item.getAttribute('data-lang');
      if (lang === this.currentLang) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  public switchLanguage(lang: 'ja' | 'en' | 'vi'): void {
    if (!['ja', 'en', 'vi'].includes(lang)) return;

    this.currentLang = lang;
    localStorage.setItem('slanguage_current_lang', lang);
    localStorage.setItem('slanguage_active_language', lang);
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

    this.updateDropdownUI();
    this.loadSavedWordStatuses();
    this.updateCurrentDeck();
    this.initHeroStats();
    this.renderCurrentCard();
    this.initSpeedQuiz();
    this.renderVault();

    const langName = vocabDatabase[lang].name;
    this.showToast(`Đã chuyển sang học: ${langName}`, vocabDatabase[lang].flagImg);
  }

  private saveWordStatus(wordId: string, status: 'mastered' | 'unmastered'): void {
    try {
      const key = `slanguage_vocab_status_${this.currentLang}`;
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      saved[wordId] = status;
      localStorage.setItem(key, JSON.stringify(saved));
    } catch (e) {
      console.warn('Cannot save word status:', e);
    }
  }

  private loadSavedWordStatuses(): void {
    try {
      const key = `slanguage_vocab_status_${this.currentLang}`;
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      const deck = vocabDatabase[this.currentLang]?.deck;
      if (deck) {
        deck.forEach(item => {
          if (saved[item.id] === 'mastered' || saved[item.id] === 'unmastered') {
            item.status = saved[item.id];
          }
        });
      }
    } catch (e) {
      console.warn('Cannot load word status:', e);
    }
  }

  private updateVaultCounts(): void {
    const deck = vocabDatabase[this.currentLang]?.deck || [];
    const total = deck.length;
    const mastered = deck.filter(it => it.status === 'mastered').length;
    const unmastered = total - mastered;

    const countAll = document.getElementById('vaultCountAll');
    const countMastered = document.getElementById('vaultCountMastered');
    const countUnmastered = document.getElementById('vaultCountUnmastered');

    if (countAll) countAll.textContent = total.toString();
    if (countMastered) countMastered.textContent = mastered.toString();
    if (countUnmastered) countUnmastered.textContent = unmastered.toString();

    // Hero stats
    const statTotal = document.getElementById('statTotalWords');
    const statMastered = document.getElementById('statMasteredWords');
    const statReview = document.getElementById('statReviewWords');
    const statRetention = document.getElementById('statRetentionRate');

    if (statTotal) statTotal.textContent = (total * 15).toString();
    if (statMastered) statMastered.textContent = (mastered * 15).toString();
    if (statReview) statReview.textContent = (unmastered * 15).toString();
    if (statRetention) {
      const rate = total > 0 ? Math.round((mastered / total) * 100) : 0;
      statRetention.textContent = `${rate}%`;
    }
  }

  // ================= HERO STATS =================
  private initHeroStats(): void {
    const data = vocabDatabase[this.currentLang];
    const heroTitle = document.getElementById('vocabHeroTitle');
    const heroDesc = document.getElementById('vocabHeroDesc');

    if (heroTitle) heroTitle.textContent = data.heroTitle;
    if (heroDesc) heroDesc.textContent = data.heroDesc;

    this.updateVaultCounts();
  }

  // ================= MODE TABS =================
  private initModeTabs(): void {
    const tabs = document.querySelectorAll('.mode-tab');
    const panels = {
      flashcard: document.getElementById('tabFlashcard'),
      quiz: document.getElementById('tabQuiz'),
      vault: document.getElementById('tabVault')
    };

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const target = tab.getAttribute('data-tab') as keyof typeof panels;
        Object.values(panels).forEach(p => p?.classList.remove('active'));
        if (target && panels[target]) {
          panels[target]?.classList.add('active');
          if (target === 'quiz') this.startSpeedQuizQuestion();
          if (target === 'vault') this.renderVault();
        }
      });
    });

    const deckSelect = document.getElementById('deckSelect') as HTMLSelectElement;
    if (deckSelect) {
      deckSelect.addEventListener('change', () => {
        this.updateCurrentDeck(deckSelect.value);
        this.renderCurrentCard();
        this.renderVault();
        this.showToast(`Đã lọc danh sách: ${deckSelect.options[deckSelect.selectedIndex].text}`);
      });
    }
  }

  // ================= TAB 1: 3D FLASHCARD =================
  private initFlashcardDeck(): void {
    const flashcardBox = document.getElementById('flashcardBox');
    const btnNextCard = document.getElementById('btnNextCard');
    const btnPrevCard = document.getElementById('btnPrevCard');
    const btnShuffle = document.getElementById('btnShuffle');
    const btnSpeakerPrompt = document.getElementById('btnSpeakerPrompt');
    const fcSoundBtnFront = document.getElementById('fcSoundBtnFront');
    const fcSoundBtnBack = document.getElementById('fcSoundBtnBack');

    // Flip card on card click
    if (flashcardBox) {
      flashcardBox.addEventListener('click', () => {
        flashcardBox.classList.toggle('flipped');
      });
    }

    // Card navigation with side arrow buttons
    if (btnNextCard) {
      btnNextCard.addEventListener('click', (e) => {
        e.stopPropagation();
        this.nextCard();
      });
    }
    if (btnPrevCard) {
      btnPrevCard.addEventListener('click', (e) => {
        e.stopPropagation();
        this.prevCard();
      });
    }

    // Shuffle
    if (btnShuffle) {
      btnShuffle.addEventListener('click', () => {
        this.shuffleDeck();
        this.renderCurrentCard();
        this.showToast('Đã xáo trộn thứ tự bộ thẻ! 🔀');
      });
    }

    // Speech synthesis
    if (btnSpeakerPrompt) {
      btnSpeakerPrompt.addEventListener('click', () => this.playCurrentWordAudio());
    }
    if (fcSoundBtnFront) {
      fcSoundBtnFront.addEventListener('click', (e) => {
        e.stopPropagation();
        this.playCurrentWordAudio();
      });
    }
    if (fcSoundBtnBack) {
      fcSoundBtnBack.addEventListener('click', (e) => {
        e.stopPropagation();
        this.playCurrentSentenceAudio();
      });
    }

    this.renderCurrentCard();
  }

  private renderCurrentCard(): void {
    if (this.currentDeck.length === 0) return;
    const item = this.currentDeck[this.activeCardIndex];
    const flashcardBox = document.getElementById('flashcardBox');
    if (flashcardBox) flashcardBox.classList.remove('flipped');

    // Front elements
    const fcTag = document.getElementById('fcTag');
    const fcWord = document.getElementById('fcWord');
    const fcPhonetic = document.getElementById('fcPhonetic');

    if (fcTag) fcTag.textContent = item.tag;
    if (fcWord) fcWord.textContent = item.word;
    if (fcPhonetic) fcPhonetic.textContent = item.phonetic;

    // Back elements
    const fcBackTag = document.getElementById('fcBackTag');
    const fcMeaning = document.getElementById('fcMeaning');
    const fcExampleTarget = document.getElementById('fcExampleTarget');
    const fcExampleMeaning = document.getElementById('fcExampleMeaning');
    const fcNuance = document.getElementById('fcNuance');

    if (fcBackTag) fcBackTag.textContent = item.level;
    if (fcMeaning) fcMeaning.textContent = item.meaning;
    if (fcExampleTarget) fcExampleTarget.textContent = item.exampleTarget;
    if (fcExampleMeaning) fcExampleMeaning.textContent = item.exampleMeaning;
    if (fcNuance) fcNuance.innerHTML = `💡 <strong>Mẹo ghi nhớ:</strong> ${item.nuance}`;

    // Progress counter
    const cardIndexLabel = document.getElementById('cardIndexLabel');
    const cardTotalLabel = document.getElementById('cardTotalLabel');
    const cardProgressFill = document.getElementById('cardProgressFill');

    if (cardIndexLabel) cardIndexLabel.textContent = (this.activeCardIndex + 1).toString();
    if (cardTotalLabel) cardTotalLabel.textContent = this.currentDeck.length.toString();
    if (cardProgressFill) {
      const pct = Math.round(((this.activeCardIndex + 1) / this.currentDeck.length) * 100);
      cardProgressFill.style.width = `${pct}%`;
    }
  }

  private nextCard(): void {
    if (this.activeCardIndex < this.currentDeck.length - 1) {
      this.activeCardIndex++;
    } else {
      this.activeCardIndex = 0;
      this.showToast('Bạn đã duyệt hết vòng thẻ này! Vòng lặp mới bắt đầu. 🔁');
    }
    this.renderCurrentCard();
  }

  private prevCard(): void {
    if (this.activeCardIndex > 0) {
      this.activeCardIndex--;
    } else {
      this.activeCardIndex = this.currentDeck.length - 1;
    }
    this.renderCurrentCard();
  }

  private shuffleDeck(): void {
    for (let i = this.currentDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.currentDeck[i], this.currentDeck[j]] = [this.currentDeck[j], this.currentDeck[i]];
    }
    this.activeCardIndex = 0;
  }

  private handleSRSResponse(interval: string | null): void {
    let xpGain = 0;
    let message = '';

    switch (interval) {
      case 'again':
        xpGain = 0;
        message = 'Đã xếp vào hàng đợi ôn lại ngay hôm nay ⏳';
        break;
      case 'hard':
        xpGain = 5;
        message = 'Ghi nhận: Hơi khó (+5 XP). Thuật toán sẽ nhắc sau 24h! 🧠';
        break;
      case 'good':
        xpGain = 10;
        message = 'Rất tốt! (+10 XP). Nhắc lại sau 3 ngày! ✨';
        break;
      case 'easy':
        xpGain = 20;
        message = 'Xuất sắc! Đã thuộc làu (+20 XP). Nhắc lại sau 7 ngày! 🏆';
        break;
      default:
        xpGain = 5;
        message = 'Đã lưu phản hồi SRS!';
    }

    if (xpGain > 0) {
      this.addXP(xpGain);
    }
    this.showToast(message);
    this.nextCard();
  }

  private playCurrentWordAudio(): void {
    if (this.currentDeck.length === 0) return;
    const item = this.currentDeck[this.activeCardIndex];
    this.speakText(item.word);
  }

  private playCurrentSentenceAudio(): void {
    if (this.currentDeck.length === 0) return;
    const item = this.currentDeck[this.activeCardIndex];
    this.speakText(item.exampleTarget);
  }

  private speakText(text: string): void {
    if (!('speechSynthesis' in window)) {
      this.showToast('Trình duyệt chưa hỗ trợ Text-to-speech');
      return;
    }
    // Zero-latency engine wakeup
    window.speechSynthesis.resume();
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }
    const cleanText = text.replace(/\(.*\)/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const langCode = vocabDatabase[this.currentLang].ttsCode;
    utterance.lang = langCode;
    utterance.rate = 0.95;

    // Fast-path voice assignment: prefer local system voices (0ms latency)
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const match = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith(langCode.substring(0, 2).toLowerCase()) && v.localService) ||
                    voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith(langCode.substring(0, 2).toLowerCase()));
      if (match) {
        utterance.voice = match;
      }
    }
    window.speechSynthesis.speak(utterance);
  }

  // ================= TAB 2: SPEED QUIZ =================
  private initSpeedQuiz(): void {
    const playSoundBtn = document.getElementById('quizPlaySound');
    const nextBtn = document.getElementById('quizNextBtn');

    if (playSoundBtn) {
      playSoundBtn.addEventListener('click', () => {
        if (this.currentQuizItem) this.speakText(this.currentQuizItem.word);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.startSpeedQuizQuestion();
      });
    }

    this.startSpeedQuizQuestion();
  }

  private startSpeedQuizQuestion(): void {
    const deck = vocabDatabase[this.currentLang].deck;
    if (deck.length === 0) return;

    // Pick random question item
    const randomIndex = Math.floor(Math.random() * deck.length);
    this.currentQuizItem = deck[randomIndex];

    const targetWordEl = document.getElementById('quizTargetWord');
    const subHintEl = document.getElementById('quizSubHint');
    const feedbackBanner = document.getElementById('quizFeedbackBanner');
    const optionsGrid = document.getElementById('quizOptionsGrid');

    if (feedbackBanner) feedbackBanner.classList.remove('show', 'wrong-border');
    if (targetWordEl) targetWordEl.textContent = this.currentQuizItem.word;
    if (subHintEl) subHintEl.textContent = `Phiên âm: ${this.currentQuizItem.phonetic}`;

    // Generate 4 options (1 correct, 3 distractors)
    const options: string[] = [this.currentQuizItem.meaning];
    const otherItems = deck.filter(it => it.id !== this.currentQuizItem!.id);
    this.shuffleArray(otherItems);

    for (let i = 0; i < Math.min(3, otherItems.length); i++) {
      options.push(otherItems[i].meaning);
    }
    this.shuffleArray(options);

    if (optionsGrid) {
      optionsGrid.innerHTML = '';
      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quiz-option-btn';
        btn.innerHTML = `<span>${opt}</span> <i class="fa-solid fa-arrow-right" style="opacity: 0.4;"></i>`;
        btn.addEventListener('click', () => this.handleQuizAnswer(btn, opt));
        optionsGrid.appendChild(btn);
      });
    }

    this.startQuizTimer();
  }

  private startQuizTimer(): void {
    if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);
    this.quizRemainingTime = 15;
    const timerText = document.getElementById('quizTimerText');
    if (timerText) timerText.textContent = `${this.quizRemainingTime}s`;

    this.quizTimerInterval = window.setInterval(() => {
      this.quizRemainingTime--;
      if (timerText) timerText.textContent = `${this.quizRemainingTime}s`;
      if (this.quizRemainingTime <= 0) {
        clearInterval(this.quizTimerInterval!);
        this.handleQuizTimeout();
      }
    }, 1000);
  }

  private handleQuizAnswer(selectedBtn: HTMLButtonElement, selectedAnswer: string): void {
    if (!this.currentQuizItem) return;
    if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);

    const isCorrect = selectedAnswer === this.currentQuizItem.meaning;
    const allButtons = document.querySelectorAll('.quiz-option-btn');
    allButtons.forEach(b => (b as HTMLButtonElement).disabled = true);

    const feedbackBanner = document.getElementById('quizFeedbackBanner');
    const feedbackMsg = document.getElementById('quizFeedbackMsg');
    const streakCount = document.getElementById('quizStreakCount');
    const scoreCount = document.getElementById('quizScoreCount');

    if (isCorrect) {
      selectedBtn.classList.add('correct');
      this.quizStreak++;
      const bonusXP = 15 + (this.quizStreak * 5);
      this.quizScore += bonusXP;
      this.addXP(bonusXP);

      // Trả lời đúng: Đánh dấu đã thuộc
      this.currentQuizItem.status = 'mastered';
      this.saveWordStatus(this.currentQuizItem.id, 'mastered');
      this.updateVaultCounts();

      if (feedbackBanner && feedbackMsg) {
        feedbackBanner.classList.add('show');
        feedbackBanner.classList.remove('wrong-border');
        feedbackMsg.textContent = `Chính xác xuất sắc! +${bonusXP} XP 🔥 (Đã thuộc)`;
      }
    } else {
      selectedBtn.classList.add('wrong');
      this.quizStreak = 0;

      // Trả lời sai: Mặc định đánh chưa thuộc
      this.currentQuizItem.status = 'unmastered';
      this.saveWordStatus(this.currentQuizItem.id, 'unmastered');
      this.updateVaultCounts();

      // Highlight the correct one
      allButtons.forEach(b => {
        if (b.textContent?.includes(this.currentQuizItem!.meaning)) {
          b.classList.add('correct');
        }
      });

      if (feedbackBanner && feedbackMsg) {
        feedbackBanner.classList.add('show', 'wrong-border');
        feedbackMsg.textContent = `Chưa chính xác! (Chưa thuộc) - Đáp án đúng: "${this.currentQuizItem.meaning}"`;
      }
    }

    if (streakCount) streakCount.textContent = this.quizStreak.toString();
    if (scoreCount) scoreCount.textContent = `${this.quizScore} XP`;
  }

  private handleQuizTimeout(): void {
    this.quizStreak = 0;
    const streakCount = document.getElementById('quizStreakCount');
    if (streakCount) streakCount.textContent = '0';

    if (this.currentQuizItem) {
      // Hết giờ coi như sai: Mặc định đánh chưa thuộc
      this.currentQuizItem.status = 'unmastered';
      this.saveWordStatus(this.currentQuizItem.id, 'unmastered');
      this.updateVaultCounts();
    }

    const feedbackBanner = document.getElementById('quizFeedbackBanner');
    const feedbackMsg = document.getElementById('quizFeedbackMsg');
    if (feedbackBanner && feedbackMsg && this.currentQuizItem) {
      feedbackBanner.classList.add('show', 'wrong-border');
      feedbackMsg.textContent = `Hết giờ! (Chưa thuộc) - Đáp án đúng là: "${this.currentQuizItem.meaning}"`;
    }
  }

  // ================= TAB 3: VOCABULARY VAULT =================
  private initVocabularyVault(): void {
    const searchInput = document.getElementById('vaultSearchInput') as HTMLInputElement;
    const filterPills = document.querySelectorAll('.vault-pill');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const activePill = document.querySelector('.vault-pill.active');
        const filter = activePill?.getAttribute('data-filter') || 'all';
        this.renderVault(searchInput.value, filter);
      });
    }

    filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const filter = pill.getAttribute('data-filter') || 'all';
        this.renderVault(searchInput?.value || '', filter);
      });
    });

    this.renderVault();
  }

  private renderVault(keyword: string = '', statusFilter: string = 'all'): void {
    const vaultGrid = document.getElementById('vaultGrid');
    if (!vaultGrid) return;

    this.loadSavedWordStatuses();
    this.updateVaultCounts();

    let items = vocabDatabase[this.currentLang].deck;

    if (keyword.trim()) {
      const q = keyword.toLowerCase().trim();
      items = items.filter(it => 
        it.word.toLowerCase().includes(q) ||
        it.phonetic.toLowerCase().includes(q) ||
        it.meaning.toLowerCase().includes(q) ||
        it.exampleTarget.toLowerCase().includes(q)
      );
    }

    if (statusFilter === 'mastered') {
      items = items.filter(it => it.status === 'mastered');
    } else if (statusFilter === 'unmastered') {
      items = items.filter(it => it.status !== 'mastered');
    }

    vaultGrid.innerHTML = '';

    if (items.length === 0) {
      vaultGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #64748b;">
          <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.5;"></i>
          <p style="font-size: 1.05rem; font-weight: 600;">Không tìm thấy từ vựng phù hợp với bộ lọc.</p>
        </div>
      `;
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'vault-word-card';

      const isMastered = item.status === 'mastered';
      const st = isMastered
        ? { label: 'Đã thuộc', cls: 'mastered' }
        : { label: 'Chưa thuộc', cls: 'unmastered' };

      card.innerHTML = `
        <div class="vwc-header">
          <div class="vwc-word">${item.word}</div>
          <span class="vwc-phonetic">${item.phonetic}</span>
        </div>
        <div class="vwc-meaning">${item.meaning}</div>
        <div class="vwc-example">
          "${item.exampleTarget}"<br>
          <small style="color: #64748b;">${item.exampleMeaning}</small>
        </div>
        <div class="vwc-footer">
          <span class="vwc-status-badge ${st.cls}">${st.label}</span>
          <div class="vwc-actions">
            <button type="button" class="vwc-btn btn-speak" title="Nghe phát âm">
              <i class="fa-solid fa-volume-high"></i>
            </button>
            <button type="button" class="vwc-btn btn-study" title="Đưa vào thẻ Flashcard ôn ngay">
              <i class="fa-solid fa-play"></i>
            </button>
          </div>
        </div>
      `;

      card.querySelector('.btn-speak')?.addEventListener('click', () => {
        this.speakText(item.word);
      });

      card.querySelector('.btn-study')?.addEventListener('click', () => {
        const foundIdx = this.currentDeck.findIndex(d => d.id === item.id);
        if (foundIdx !== -1) {
          this.activeCardIndex = foundIdx;
          const flashTab = document.querySelector('[data-tab="flashcard"]') as HTMLButtonElement;
          if (flashTab) flashTab.click();
          this.renderCurrentCard();
          this.showToast(`Đang mở thẻ ôn tập: "${item.word}" 🚀`);
        }
      });

      vaultGrid.appendChild(card);
    });
  }

  // ================= KEYBOARD SHORTCUTS =================
  private bindShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        const flashcardBox = document.getElementById('flashcardBox');
        if (flashcardBox) flashcardBox.classList.toggle('flipped');
      } else if (e.code === 'ArrowRight') {
        this.nextCard();
      } else if (e.code === 'ArrowLeft') {
        this.prevCard();
      }
    });
  }

  // ================= UTILITIES =================
  private addXP(points: number): void {
    this.currentXP += points;
    localStorage.setItem('slanguage_user_xp', this.currentXP.toString());

    // Cập nhật Cấp cao nhất nếu đạt mốc cấp kỷ lục mới
    const currentLvl = Math.max(1, Math.floor(this.currentXP / 180) + 1);
    const savedHighest = localStorage.getItem('slanguage_user_highest_level');
    const highestLvl = savedHighest !== null ? Math.max(14, parseInt(savedHighest, 10)) : 14;
    if (currentLvl > highestLvl) {
      localStorage.setItem('slanguage_user_highest_level', currentLvl.toString());
    }
    let currentStreak = parseInt(localStorage.getItem('slanguage_user_streak') || '18', 10);
    if (isNaN(currentStreak)) currentStreak = 18;
    const todayStr = new Date().toISOString().split('T')[0];
    const lastStudy = localStorage.getItem('slanguage_last_study_date');
    if (lastStudy !== todayStr) {
      currentStreak += 1;
      localStorage.setItem('slanguage_last_study_date', todayStr);
      localStorage.setItem('slanguage_user_streak', currentStreak.toString());
    }

    const navXPVal = document.getElementById('headerXPVal') || document.getElementById('navXPVal');
    if (navXPVal) {
      navXPVal.textContent = `${this.currentXP.toLocaleString()} XP`;
      navXPVal.parentElement?.classList.add('bounce');
      setTimeout(() => navXPVal.parentElement?.classList.remove('bounce'), 400);
    }
    const dropXP = document.getElementById('dropdownXPVal');
    if (dropXP) dropXP.textContent = `${this.currentXP.toLocaleString()} XP`;

    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('slanguage_data_changed'));
  }

  private showToast(message: string, flagImg?: string): void {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const flagHtml = flagImg
      ? `<img src="${flagImg}" alt="Flag" style="width: 24px; height: 16px; object-fit: cover; border-radius: 3px; box-shadow: 0 1px 4px rgba(0,0,0,0.4); flex-shrink: 0; vertical-align: middle;">`
      : '';

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.display = 'flex';
    toast.style.flexDirection = 'column';
    toast.style.alignItems = 'flex-start';
    toast.style.gap = '6px';
    toast.style.padding = '12px 18px';
    toast.style.border = '2px solid #FFB703';
    toast.style.background = '#061A28';
    toast.style.borderRadius = '16px';
    toast.style.boxShadow = '0 12px 32px rgba(6, 26, 40, 0.6), 0 0 18px rgba(255, 183, 3, 0.25)';

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; padding-bottom: 5px; border-bottom: 1px solid rgba(255, 183, 3, 0.25); width: 100%;">
        <img src="../assets/logo.png" alt="S Language Logo" style="width: 20px; height: 20px; object-fit: contain; flex-shrink: 0;">
        <span style="font-size: 0.85rem; font-weight: 700; color: #FFB703; letter-spacing: 0.2px;">S Language thông báo:</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; font-size: 0.95rem; font-weight: 700; color: #ffffff;">
        <span>${message}</span>
        ${flagHtml}
      </div>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  private shuffleArray(array: any[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  private bindPageTransitions(): void {
    const overlay = document.getElementById('slanguageLoadingOverlay');
    if (overlay) overlay.style.pointerEvents = 'none';

    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (
        href && 
        !href.startsWith('#') && 
        !href.startsWith('javascript:') && 
        !link.hasAttribute('target') &&
        !href.startsWith('mailto:') &&
        !href.startsWith('tel:')
      ) {
        link.addEventListener('click', (e: MouseEvent) => {
          const cleanHref = href.split('?')[0].split('#')[0];
          // If clicking on current page, smooth scroll to top instead of reloading or freezing
          if (
            cleanHref === './index.html' ||
            cleanHref === 'index.html' ||
            cleanHref === '' ||
            cleanHref.endsWith('/vocabulary/') ||
            cleanHref.endsWith('/vocabulary/index.html')
          ) {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }

          e.preventDefault();
          this.triggerLoadingAndRedirect(href);
        });
      }
    });

    // Auto-sync Header Stats across tabs or on focus
    const syncHeaderStats = () => {
      this.syncNavbarStats();
    };
    window.addEventListener('storage', syncHeaderStats);
    window.addEventListener('focus', syncHeaderStats);
    window.addEventListener('slanguage_data_changed', syncHeaderStats);

    window.addEventListener('pageshow', () => {
      syncHeaderStats();
      const vOverlay = document.getElementById('slanguageLoadingOverlay');
      const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement | null;
      if (vOverlay) {
        vOverlay.classList.remove('active');
        vOverlay.style.pointerEvents = 'none';
      }
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

  private triggerLoadingAndRedirect(targetUrl: string, duration: number = 700): void {
    const overlay = document.getElementById('slanguageLoadingOverlay');
    const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement | null;
    if (overlay) {
      overlay.classList.add('active');
      overlay.style.pointerEvents = 'auto';
      if (video) {
        video.muted = true;
        video.currentTime = 0;
        video.play().catch(() => {});
      }
    }
    setTimeout(() => {
      if (video) {
        video.pause();
        video.muted = true;
      }
      if (overlay) {
        overlay.classList.remove('active');
        overlay.style.pointerEvents = 'none';
      }
      window.location.href = targetUrl;
    }, duration);

    // Failsafe unlock if navigation takes too long
    setTimeout(() => {
      if (overlay) {
        overlay.classList.remove('active');
        overlay.style.pointerEvents = 'none';
      }
    }, 1800);
  }
}

// Initialize on DOM ready

function initSlanguageVocabulary(): void {
  (window as unknown as { vocabularyApp?: SlanguageVocabulary }).vocabularyApp = new SlanguageVocabulary();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSlanguageVocabulary);
} else {
  initSlanguageVocabulary();
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
