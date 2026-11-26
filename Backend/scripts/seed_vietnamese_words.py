# -*- coding: utf-8 -*-
"""Nạp 400 từ vựng tiếng Việt theo các chủ đề giao tiếp thực tế, dễ hiểu.

Chạy từ thư mục Backend với môi trường đã cấu hình:
    python scripts/seed_vietnamese_words.py

Script sử dụng SUPABASE_SECRET_KEY, tái sử dụng từ/chủ đề đã có và an toàn khi chạy lại nhiều lần.
"""

import sys
import unicodedata
from pathlib import Path
from typing import Any, Dict, Iterable, List

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.supabase import supabase_admin  # noqa: E402

LANGUAGE_CODE = "vi"
WORDS_PER_BATCH = 100
TOPICS = [
    {
        "name": "Chào Hỏi & Làm Quen",
        "description": "Các câu chào hỏi cơ bản, cảm ơn, xin lỗi và giới thiệu bản thân.",
        "icon_url": "waving_hand",
        "sort_order": 10,
        "words": [
            {"word": "xin chào", "phonetic": None, "meaning": "hello", "part_of_speech": "phrase", "example_sentence": "Xin chào, rất vui được gặp bạn.", "example_meaning": "Hello, nice to meet you.", "level": "A1", "audio_url": None},
            {"word": "tạm biệt", "phonetic": None, "meaning": "goodbye", "part_of_speech": "phrase", "example_sentence": "Tạm biệt, hẹn gặp lại ngày mai.", "example_meaning": "Goodbye, see you tomorrow.", "level": "A1", "audio_url": None},
            {"word": "cảm ơn", "phonetic": None, "meaning": "thank you", "part_of_speech": "phrase", "example_sentence": "Cảm ơn bạn đã giúp mình.", "example_meaning": "Thank you for helping me.", "level": "A1", "audio_url": None},
            {"word": "xin lỗi", "phonetic": None, "meaning": "sorry / excuse me", "part_of_speech": "phrase", "example_sentence": "Xin lỗi, cho mình hỏi đường một chút.", "example_meaning": "Excuse me, can I ask for directions?", "level": "A1", "audio_url": None},
            {"word": "không sao", "phonetic": None, "meaning": "no problem / it's okay", "part_of_speech": "phrase", "example_sentence": "Không sao đâu, đừng lo lắng.", "example_meaning": "It's okay, don't worry.", "level": "A1", "audio_url": None},
            {"word": "vâng", "phonetic": None, "meaning": "yes (polite)", "part_of_speech": "other", "example_sentence": "Vâng, em hiểu rồi ạ.", "example_meaning": "Yes, I understand.", "level": "A1", "audio_url": None},
            {"word": "không", "phonetic": None, "meaning": "no / not", "part_of_speech": "adverb", "example_sentence": "Tôi không uống cà phê tối.", "example_meaning": "I don't drink coffee at night.", "level": "A1", "audio_url": None},
            {"word": "tên", "phonetic": None, "meaning": "name", "part_of_speech": "noun", "example_sentence": "Tên mình là Minh.", "example_meaning": "My name is Minh.", "level": "A1", "audio_url": None},
            {"word": "tuổi", "phonetic": None, "meaning": "age / years old", "part_of_speech": "noun", "example_sentence": "Năm nay bạn bao nhiêu tuổi?", "example_meaning": "How old are you this year?", "level": "A1", "audio_url": None},
            {"word": "bạn bè", "phonetic": None, "meaning": "friends", "part_of_speech": "noun", "example_sentence": "Cuối tuần mình hay đi chơi với bạn bè.", "example_meaning": "On weekends I often hang out with friends.", "level": "A1", "audio_url": None},
            {"word": "tôi", "phonetic": None, "meaning": "I / me (neutral)", "part_of_speech": "other", "example_sentence": "Tôi đang học tiếng Việt.", "example_meaning": "I am learning Vietnamese.", "level": "A1", "audio_url": None},
            {"word": "bạn", "phonetic": None, "meaning": "you / friend", "part_of_speech": "other", "example_sentence": "Bạn đến từ nước nào?", "example_meaning": "Which country are you from?", "level": "A1", "audio_url": None},
            {"word": "quê hương", "phonetic": None, "meaning": "hometown", "part_of_speech": "noun", "example_sentence": "Quê hương tôi ở miền Trung.", "example_meaning": "My hometown is in Central Vietnam.", "level": "A1", "audio_url": None},
            {"word": "nước ngoài", "phonetic": None, "meaning": "foreign country / abroad", "part_of_speech": "noun", "example_sentence": "Anh ấy có nhiều bạn nước ngoài.", "example_meaning": "He has many foreign friends.", "level": "A1", "audio_url": None},
            {"word": "tiếng Việt", "phonetic": None, "meaning": "Vietnamese language", "part_of_speech": "noun", "example_sentence": "Tiếng Việt rất thú vị.", "example_meaning": "Vietnamese is very interesting.", "level": "A1", "audio_url": None},
            {"word": "hiểu", "phonetic": None, "meaning": "to understand", "part_of_speech": "verb", "example_sentence": "Bạn nói chậm thì mình hiểu.", "example_meaning": "If you speak slowly, I understand.", "level": "A1", "audio_url": None},
            {"word": "nói", "phonetic": None, "meaning": "to speak / say", "part_of_speech": "verb", "example_sentence": "Cô ấy nói tiếng Việt rất tự nhiên.", "example_meaning": "She speaks Vietnamese very naturally.", "level": "A1", "audio_url": None},
            {"word": "nghe", "phonetic": None, "meaning": "to listen / hear", "part_of_speech": "verb", "example_sentence": "Mình thích nghe nhạc Việt.", "example_meaning": "I like listening to Vietnamese music.", "level": "A1", "audio_url": None},
            {"word": "hỏi", "phonetic": None, "meaning": "to ask", "part_of_speech": "verb", "example_sentence": "Không biết thì cứ hỏi nhé.", "example_meaning": "If you don't know, just ask.", "level": "A1", "audio_url": None},
            {"word": "gặp mặt", "phonetic": None, "meaning": "to meet up", "part_of_speech": "verb", "example_sentence": "Hôm nào rảnh chúng ta gặp mặt nhé.", "example_meaning": "Let's meet up whenever you're free.", "level": "A1", "audio_url": None},
        ],
    },
    {
        "name": "Gia Đình & Người Thân",
        "description": "Từ vựng về bố mẹ, anh chị em, ông bà và họ hàng thân thiết.",
        "icon_url": "family_restroom",
        "sort_order": 20,
        "words": [
            {"word": "gia đình", "phonetic": None, "meaning": "family", "part_of_speech": "noun", "example_sentence": "Gia đình mình sống ở Hà Nội.", "example_meaning": "My family lives in Hanoi.", "level": "A1", "audio_url": None},
            {"word": "bố", "phonetic": None, "meaning": "dad / father", "part_of_speech": "noun", "example_sentence": "Bố mình thích uống trà buổi sáng.", "example_meaning": "My dad likes drinking tea in the morning.", "level": "A1", "audio_url": None},
            {"word": "mẹ", "phonetic": None, "meaning": "mom / mother", "part_of_speech": "noun", "example_sentence": "Mẹ nấu cơm rất ngon.", "example_meaning": "Mom cooks very delicious meals.", "level": "A1", "audio_url": None},
            {"word": "ông nội", "phonetic": None, "meaning": "paternal grandfather", "part_of_speech": "noun", "example_sentence": "Ông nội năm nay bảy mươi tuổi.", "example_meaning": "My paternal grandfather is seventy this year.", "level": "A1", "audio_url": None},
            {"word": "bà nội", "phonetic": None, "meaning": "paternal grandmother", "part_of_speech": "noun", "example_sentence": "Bà nội hay kể chuyện ngày xưa.", "example_meaning": "My paternal grandmother often tells stories about the past.", "level": "A1", "audio_url": None},
            {"word": "ông ngoại", "phonetic": None, "meaning": "maternal grandfather", "part_of_speech": "noun", "example_sentence": "Cuối tuần nhà mình về thăm ông ngoại.", "example_meaning": "This weekend we visit my maternal grandfather.", "level": "A1", "audio_url": None},
            {"word": "bà ngoại", "phonetic": None, "meaning": "maternal grandmother", "part_of_speech": "noun", "example_sentence": "Bà ngoại trồng nhiều cây ăn quả.", "example_meaning": "My maternal grandmother grows many fruit trees.", "level": "A1", "audio_url": None},
            {"word": "anh trai", "phonetic": None, "meaning": "older brother", "part_of_speech": "noun", "example_sentence": "Anh trai mình đang làm kỹ sư.", "example_meaning": "My older brother works as an engineer.", "level": "A1", "audio_url": None},
            {"word": "chị gái", "phonetic": None, "meaning": "older sister", "part_of_speech": "noun", "example_sentence": "Chị gái mình rất thích đi du lịch.", "example_meaning": "My older sister loves traveling.", "level": "A1", "audio_url": None},
            {"word": "em trai", "phonetic": None, "meaning": "younger brother", "part_of_speech": "noun", "example_sentence": "Em trai mình học lớp tám.", "example_meaning": "My younger brother is in eighth grade.", "level": "A1", "audio_url": None},
            {"word": "em gái", "phonetic": None, "meaning": "younger sister", "part_of_speech": "noun", "example_sentence": "Em gái mình thích vẽ tranh.", "example_meaning": "My younger sister likes drawing.", "level": "A1", "audio_url": None},
            {"word": "vợ", "phonetic": None, "meaning": "wife", "part_of_speech": "noun", "example_sentence": "Vợ anh ấy là giáo viên.", "example_meaning": "His wife is a teacher.", "level": "A1", "audio_url": None},
            {"word": "chồng", "phonetic": None, "meaning": "husband", "part_of_speech": "noun", "example_sentence": "Chồng chị ấy làm việc ở ngân hàng.", "example_meaning": "Her husband works at a bank.", "level": "A1", "audio_url": None},
            {"word": "con trai", "phonetic": None, "meaning": "son / boy", "part_of_speech": "noun", "example_sentence": "Con trai họ năm nay lên lớp một.", "example_meaning": "Their son starts first grade this year.", "level": "A1", "audio_url": None},
            {"word": "con gái", "phonetic": None, "meaning": "daughter / girl", "part_of_speech": "noun", "example_sentence": "Con gái chị ấy biết chơi đàn.", "example_meaning": "Her daughter knows how to play the piano.", "level": "A1", "audio_url": None},
            {"word": "em bé", "phonetic": None, "meaning": "baby", "part_of_speech": "noun", "example_sentence": "Em bé đang ngủ rất ngoan.", "example_meaning": "The baby is sleeping peacefully.", "level": "A1", "audio_url": None},
            {"word": "họ hàng", "phonetic": None, "meaning": "relatives", "part_of_speech": "noun", "example_sentence": "Tết là dịp gặp gỡ họ hàng.", "example_meaning": "Tet is a time to meet relatives.", "level": "A1", "audio_url": None},
            {"word": "hàng xóm", "phonetic": None, "meaning": "neighbor", "part_of_speech": "noun", "example_sentence": "Hàng xóm nhà mình rất thân thiện.", "example_meaning": "Our neighbors are very friendly.", "level": "A1", "audio_url": None},
            {"word": "yêu thương", "phonetic": None, "meaning": "to love / care for", "part_of_speech": "verb", "example_sentence": "Mọi người trong nhà luôn yêu thương nhau.", "example_meaning": "Everyone in the family always loves each other.", "level": "A1", "audio_url": None},
            {"word": "chăm sóc", "phonetic": None, "meaning": "to take care of", "part_of_speech": "verb", "example_sentence": "Bố mẹ chăm sóc con cái chu đáo.", "example_meaning": "Parents take good care of their children.", "level": "A1", "audio_url": None},
        ],
    },
    {
        "name": "Số Đếm & Tiền Bạc Cơ Bản",
        "description": "Đếm số, đọc giá tiền Việt Nam Đồng và hỏi số lượng.",
        "icon_url": "payments",
        "sort_order": 30,
        "words": [
            {"word": "một", "phonetic": None, "meaning": "one", "part_of_speech": "noun", "example_sentence": "Cho mình một cốc trà đá.", "example_meaning": "Give me one glass of iced tea.", "level": "A1", "audio_url": None},
            {"word": "hai", "phonetic": None, "meaning": "two", "part_of_speech": "noun", "example_sentence": "Mình mua hai cái bánh mì.", "example_meaning": "I bought two banh mi.", "level": "A1", "audio_url": None},
            {"word": "ba", "phonetic": None, "meaning": "three", "part_of_speech": "noun", "example_sentence": "Nhóm mình có ba người.", "example_meaning": "Our group has three people.", "level": "A1", "audio_url": None},
            {"word": "bốn", "phonetic": None, "meaning": "four", "part_of_speech": "noun", "example_sentence": "Bàn này ngồi được bốn người.", "example_meaning": "This table seats four people.", "level": "A1", "audio_url": None},
            {"word": "năm", "phonetic": None, "meaning": "five", "part_of_speech": "noun", "example_sentence": "Đợi mình năm phút nhé.", "example_meaning": "Wait for me five minutes.", "level": "A1", "audio_url": None},
            {"word": "sáu", "phonetic": None, "meaning": "six", "part_of_speech": "noun", "example_sentence": "Sáng nay mình dậy lúc sáu giờ.", "example_meaning": "This morning I woke up at six.", "level": "A1", "audio_url": None},
            {"word": "bảy", "phonetic": None, "meaning": "seven", "part_of_speech": "noun", "example_sentence": "Một tuần có bảy ngày.", "example_meaning": "A week has seven days.", "level": "A1", "audio_url": None},
            {"word": "tám", "phonetic": None, "meaning": "eight", "part_of_speech": "noun", "example_sentence": "Lớp học bắt đầu lúc tám giờ.", "example_meaning": "Class starts at eight o'clock.", "level": "A1", "audio_url": None},
            {"word": "chín", "phonetic": None, "meaning": "nine", "part_of_speech": "noun", "example_sentence": "Cửa hàng mở cửa đến chín giờ tối.", "example_meaning": "The shop is open until nine at night.", "level": "A1", "audio_url": None},
            {"word": "mười", "phonetic": None, "meaning": "ten", "part_of_speech": "noun", "example_sentence": "Vé gửi xe giá mười nghìn đồng.", "example_meaning": "The parking ticket costs ten thousand dong.", "level": "A1", "audio_url": None},
            {"word": "trăm", "phonetic": None, "meaning": "hundred", "part_of_speech": "noun", "example_sentence": "Chiếc áo này giá hai trăm nghìn.", "example_meaning": "This shirt costs two hundred thousand.", "level": "A1", "audio_url": None},
            {"word": "nghìn", "phonetic": None, "meaning": "thousand", "part_of_speech": "noun", "example_sentence": "Ly cà phê giá ba mươi nghìn.", "example_meaning": "The cup of coffee costs thirty thousand.", "level": "A1", "audio_url": None},
            {"word": "triệu", "phonetic": None, "meaning": "million", "part_of_speech": "noun", "example_sentence": "Điện thoại này giá mười triệu.", "example_meaning": "This phone costs ten million.", "level": "A1", "audio_url": None},
            {"word": "tiền", "phonetic": None, "meaning": "money", "part_of_speech": "noun", "example_sentence": "Mình quên mang tiền mặt rồi.", "example_meaning": "I forgot to bring cash.", "level": "A1", "audio_url": None},
            {"word": "giá tiền", "phonetic": None, "meaning": "price", "part_of_speech": "noun", "example_sentence": "Giá tiền được ghi trên nhãn.", "example_meaning": "The price is written on the tag.", "level": "A1", "audio_url": None},
            {"word": "bao nhiêu", "phonetic": None, "meaning": "how much / how many", "part_of_speech": "other", "example_sentence": "Tô phở này bao nhiêu tiền ạ?", "example_meaning": "How much is this bowl of pho?", "level": "A1", "audio_url": None},
            {"word": "rẻ", "phonetic": None, "meaning": "cheap", "part_of_speech": "adjective", "example_sentence": "Quán này bán đồ ăn vừa ngon vừa rẻ.", "example_meaning": "This place sells food that is both tasty and cheap.", "level": "A1", "audio_url": None},
            {"word": "đắt", "phonetic": None, "meaning": "expensive", "part_of_speech": "adjective", "example_sentence": "Cái túi đó hơi đắt.", "example_meaning": "That bag is a bit expensive.", "level": "A1", "audio_url": None},
            {"word": "chuyển khoản", "phonetic": None, "meaning": "bank transfer", "part_of_speech": "verb", "example_sentence": "Quán có nhận chuyển khoản không ạ?", "example_meaning": "Does the shop accept bank transfers?", "level": "A1", "audio_url": None},
            {"word": "tính tiền", "phonetic": None, "meaning": "to pay the bill / check please", "part_of_speech": "verb", "example_sentence": "Em ơi, tính tiền giúp anh nhé.", "example_meaning": "Excuse me, please bring the bill.", "level": "A1", "audio_url": None},
        ],
    },
    {
        "name": "Ngày Tháng & Giờ Giấc",
        "description": "Nói về hôm nay, ngày mai, các buổi trong ngày và hẹn giờ.",
        "icon_url": "schedule",
        "sort_order": 40,
        "words": [
            {"word": "hôm nay", "phonetic": None, "meaning": "today", "part_of_speech": "adverb", "example_sentence": "Hôm nay trời mát mẻ.", "example_meaning": "Today the weather is cool.", "level": "A1", "audio_url": None},
            {"word": "ngày mai", "phonetic": None, "meaning": "tomorrow", "part_of_speech": "adverb", "example_sentence": "Ngày mai mình được nghỉ học.", "example_meaning": "Tomorrow I have a day off from school.", "level": "A1", "audio_url": None},
            {"word": "hôm qua", "phonetic": None, "meaning": "yesterday", "part_of_speech": "adverb", "example_sentence": "Hôm qua mình đi xem phim.", "example_meaning": "Yesterday I went to watch a movie.", "level": "A1", "audio_url": None},
            {"word": "buổi sáng", "phonetic": None, "meaning": "morning", "part_of_speech": "noun", "example_sentence": "Buổi sáng mình hay chạy bộ.", "example_meaning": "In the morning I often go jogging.", "level": "A1", "audio_url": None},
            {"word": "buổi trưa", "phonetic": None, "meaning": "noon / midday", "part_of_speech": "noun", "example_sentence": "Buổi trưa trời khá nắng.", "example_meaning": "At noon it is quite sunny.", "level": "A1", "audio_url": None},
            {"word": "buổi chiều", "phonetic": None, "meaning": "afternoon", "part_of_speech": "noun", "example_sentence": "Buổi chiều mình đi đá bóng.", "example_meaning": "In the afternoon I play football.", "level": "A1", "audio_url": None},
            {"word": "buổi tối", "phonetic": None, "meaning": "evening / night", "part_of_speech": "noun", "example_sentence": "Buổi tối cả nhà ăn cơm cùng nhau.", "example_meaning": "In the evening the whole family eats dinner together.", "level": "A1", "audio_url": None},
            {"word": "tuần", "phonetic": None, "meaning": "week", "part_of_speech": "noun", "example_sentence": "Tuần sau mình có bài kiểm tra.", "example_meaning": "Next week I have a test.", "level": "A1", "audio_url": None},
            {"word": "cuối tuần", "phonetic": None, "meaning": "weekend", "part_of_speech": "noun", "example_sentence": "Cuối tuần bạn có dự định gì không?", "example_meaning": "Do you have any plans for the weekend?", "level": "A1", "audio_url": None},
            {"word": "tháng", "phonetic": None, "meaning": "month", "part_of_speech": "noun", "example_sentence": "Tháng này mình bận làm dự án.", "example_meaning": "This month I am busy with a project.", "level": "A1", "audio_url": None},
            {"word": "sinh nhật", "phonetic": None, "meaning": "birthday", "part_of_speech": "noun", "example_sentence": "Chúc mừng sinh nhật bạn nhé!", "example_meaning": "Happy birthday to you!", "level": "A1", "audio_url": None},
            {"word": "đồng hồ", "phonetic": None, "meaning": "clock / watch", "part_of_speech": "noun", "example_sentence": "Đồng hồ trên tường chạy rất đúng giờ.", "example_meaning": "The wall clock keeps very accurate time.", "level": "A1", "audio_url": None},
            {"word": "giờ", "phonetic": None, "meaning": "hour / o'clock", "part_of_speech": "noun", "example_sentence": "Bây giờ là mấy giờ rồi?", "example_meaning": "What time is it now?", "level": "A1", "audio_url": None},
            {"word": "phút", "phonetic": None, "meaning": "minute", "part_of_speech": "noun", "example_sentence": "Xe buýt sẽ đến trong mười phút nữa.", "example_meaning": "The bus will arrive in ten minutes.", "level": "A1", "audio_url": None},
            {"word": "sớm", "phonetic": None, "meaning": "early", "part_of_speech": "adverb", "example_sentence": "Hôm nay bạn đến sớm thế!", "example_meaning": "You arrived so early today!", "level": "A1", "audio_url": None},
            {"word": "muộn", "phonetic": None, "meaning": "late", "part_of_speech": "adverb", "example_sentence": "Đường tắc nên mình đến muộn.", "example_meaning": "Traffic was jammed so I arrived late.", "level": "A1", "audio_url": None},
            {"word": "bây giờ", "phonetic": None, "meaning": "now", "part_of_speech": "adverb", "example_sentence": "Bây giờ mình phải về nhà rồi.", "example_meaning": "I have to go home now.", "level": "A1", "audio_url": None},
            {"word": "ngày nghỉ", "phonetic": None, "meaning": "day off / holiday", "part_of_speech": "noun", "example_sentence": "Ngày nghỉ mình chỉ muốn ngủ nướng.", "example_meaning": "On my day off I just want to sleep in.", "level": "A1", "audio_url": None},
            {"word": "hẹn", "phonetic": None, "meaning": "appointment / date / to arrange", "part_of_speech": "verb", "example_sentence": "Tối nay mình có hẹn với bạn.", "example_meaning": "Tonight I have plans with a friend.", "level": "A1", "audio_url": None},
            {"word": "đúng giờ", "phonetic": None, "meaning": "on time / punctual", "part_of_speech": "adjective", "example_sentence": "Cô ấy luôn đi làm đúng giờ.", "example_meaning": "She always goes to work on time.", "level": "A1", "audio_url": None},
        ],
    },
    {
        "name": "Màu Sắc & Hình Dáng",
        "description": "Mô tả màu sắc và kích thước đồ vật xung quanh bạn.",
        "icon_url": "palette",
        "sort_order": 50,
        "words": [
            {"word": "màu sắc", "phonetic": None, "meaning": "color", "part_of_speech": "noun", "example_sentence": "Bức tranh có nhiều màu sắc rực rỡ.", "example_meaning": "The painting has many vibrant colors.", "level": "A1", "audio_url": None},
            {"word": "màu đỏ", "phonetic": None, "meaning": "red", "part_of_speech": "noun", "example_sentence": "Cờ Việt Nam có màu đỏ và sao vàng.", "example_meaning": "The Vietnamese flag is red with a yellow star.", "level": "A1", "audio_url": None},
            {"word": "màu xanh lá", "phonetic": None, "meaning": "green", "part_of_speech": "noun", "example_sentence": "Cây cối có màu xanh lá tươi mát.", "example_meaning": "Trees have a fresh green color.", "level": "A1", "audio_url": None},
            {"word": "màu xanh dương", "phonetic": None, "meaning": "blue", "part_of_speech": "noun", "example_sentence": "Bầu trời hôm nay màu xanh dương.", "example_meaning": "The sky today is blue.", "level": "A1", "audio_url": None},
            {"word": "màu vàng", "phonetic": None, "meaning": "yellow", "part_of_speech": "noun", "example_sentence": "Hoa mai nở màu vàng vào dịp Tết.", "example_meaning": "Apricot blossoms bloom yellow during Tet.", "level": "A1", "audio_url": None},
            {"word": "màu trắng", "phonetic": None, "meaning": "white", "part_of_speech": "noun", "example_sentence": "Học sinh mặc áo dài màu trắng.", "example_meaning": "Students wear white ao dai.", "level": "A1", "audio_url": None},
            {"word": "màu đen", "phonetic": None, "meaning": "black", "part_of_speech": "noun", "example_sentence": "Mình thích đi giày màu đen.", "example_meaning": "I like wearing black shoes.", "level": "A1", "audio_url": None},
            {"word": "màu hồng", "phonetic": None, "meaning": "pink", "part_of_speech": "noun", "example_sentence": "Hoa sen có màu hồng nhạt.", "example_meaning": "Lotus flowers are light pink.", "level": "A1", "audio_url": None},
            {"word": "màu cam", "phonetic": None, "meaning": "orange (color)", "part_of_speech": "noun", "example_sentence": "Hoàng hôn nhuộm bầu trời màu cam.", "example_meaning": "Sunset dyes the sky orange.", "level": "A1", "audio_url": None},
            {"word": "màu tím", "phonetic": None, "meaning": "purple", "part_of_speech": "noun", "example_sentence": "Áo dài tím là nét đẹp của Huế.", "example_meaning": "Purple ao dai is a signature beauty of Hue.", "level": "A1", "audio_url": None},
            {"word": "màu nâu", "phonetic": None, "meaning": "brown", "part_of_speech": "noun", "example_sentence": "Cà phê sữa có màu nâu nhạt.", "example_meaning": "Milk coffee has a light brown color.", "level": "A1", "audio_url": None},
            {"word": "màu xám", "phonetic": None, "meaning": "gray", "part_of_speech": "noun", "example_sentence": "Trời sắp mưa nên mây chuyển màu xám.", "example_meaning": "It's about to rain so the clouds turned gray.", "level": "A1", "audio_url": None},
            {"word": "hình tròn", "phonetic": None, "meaning": "circle / round", "part_of_speech": "noun", "example_sentence": "Cái bàn ăn nhà mình hình tròn.", "example_meaning": "Our dining table is round.", "level": "A1", "audio_url": None},
            {"word": "hình vuông", "phonetic": None, "meaning": "square", "part_of_speech": "noun", "example_sentence": "Bánh chưng truyền thống có hình vuông.", "example_meaning": "Traditional banh chung has a square shape.", "level": "A1", "audio_url": None},
            {"word": "to", "phonetic": None, "meaning": "big / large", "part_of_speech": "adjective", "example_sentence": "Quả dưa hấu này to quá!", "example_meaning": "This watermelon is so big!", "level": "A1", "audio_url": None},
            {"word": "nhỏ", "phonetic": None, "meaning": "small / little", "part_of_speech": "adjective", "example_sentence": "Quán cà phê nhỏ nhưng rất ấm cúng.", "example_meaning": "The cafe is small but very cozy.", "level": "A1", "audio_url": None},
            {"word": "dài", "phonetic": None, "meaning": "long", "part_of_speech": "adjective", "example_sentence": "Con đường này rất dài.", "example_meaning": "This road is very long.", "level": "A1", "audio_url": None},
            {"word": "ngắn", "phonetic": None, "meaning": "short (length)", "part_of_speech": "adjective", "example_sentence": "Mình mới cắt tóc ngắn.", "example_meaning": "I just got a short haircut.", "level": "A1", "audio_url": None},
            {"word": "nặng", "phonetic": None, "meaning": "heavy", "part_of_speech": "adjective", "example_sentence": "Cái ba lô này nặng quá.", "example_meaning": "This backpack is too heavy.", "level": "A1", "audio_url": None},
            {"word": "nhẹ", "phonetic": None, "meaning": "light (weight)", "part_of_speech": "adjective", "example_sentence": "Máy tính mới rất mỏng và nhẹ.", "example_meaning": "The new laptop is very thin and light.", "level": "A1", "audio_url": None},
        ],
    },
    {
        "name": "Đồ Ăn Sáng & Quán Vỉa Hè",
        "description": "Tên các món ăn quen thuộc của Việt Nam và cách gọi món ngoài quán.",
        "icon_url": "ramen_dining",
        "sort_order": 60,
        "words": [
            {"word": "phở", "phonetic": None, "meaning": "pho (beef or chicken noodle soup)", "part_of_speech": "noun", "example_sentence": "Sáng nay mình ăn một bát phở bò.", "example_meaning": "This morning I ate a bowl of beef pho.", "level": "A1", "audio_url": None},
            {"word": "bánh mì", "phonetic": None, "meaning": "Vietnamese baguette sandwich", "part_of_speech": "noun", "example_sentence": "Bánh mì Việt Nam giòn và nhiều nhân.", "example_meaning": "Vietnamese banh mi is crispy with generous fillings.", "level": "A1", "audio_url": None},
            {"word": "bún chả", "phonetic": None, "meaning": "grilled pork with vermicelli", "part_of_speech": "noun", "example_sentence": "Trưa nay chúng mình đi ăn bún chả nhé.", "example_meaning": "Let's go eat bun cha for lunch today.", "level": "A1", "audio_url": None},
            {"word": "cơm tấm", "phonetic": None, "meaning": "broken rice dish", "part_of_speech": "noun", "example_sentence": "Cơm tấm sườn bì chả rất nổi tiếng ở Sài Gòn.", "example_meaning": "Broken rice with grilled pork chop is famous in Saigon.", "level": "A1", "audio_url": None},
            {"word": "nem rán", "phonetic": None, "meaning": "fried spring rolls", "part_of_speech": "noun", "example_sentence": "Nem rán chấm nước mắm chua ngọt rất ngon.", "example_meaning": "Fried spring rolls dipped in sweet-sour fish sauce are delicious.", "level": "A1", "audio_url": None},
            {"word": "gỏi cuốn", "phonetic": None, "meaning": "fresh spring rolls", "part_of_speech": "noun", "example_sentence": "Gỏi cuốn tôm thịt ăn rất thanh mát.", "example_meaning": "Shrimp and pork fresh spring rolls taste very refreshing.", "level": "A1", "audio_url": None},
            {"word": "xôi", "phonetic": None, "meaning": "sticky rice", "part_of_speech": "noun", "example_sentence": "Sáng nào cô ấy cũng mua một gói xôi xéo.", "example_meaning": "Every morning she buys a packet of sticky rice.", "level": "A1", "audio_url": None},
            {"word": "cháo", "phonetic": None, "meaning": "porridge / congee", "part_of_speech": "noun", "example_sentence": "Trời lạnh ăn bát cháo nóng rất ấm bụng.", "example_meaning": "Eating a hot bowl of porridge on a cold day warms the stomach.", "level": "A1", "audio_url": None},
            {"word": "bánh cuốn", "phonetic": None, "meaning": "steamed rice rolls", "part_of_speech": "noun", "example_sentence": "Bánh cuốn nóng ăn kèm chả lụa.", "example_meaning": "Hot steamed rice rolls are served with Vietnamese pork sausage.", "level": "A1", "audio_url": None},
            {"word": "nước mắm", "phonetic": None, "meaning": "fish sauce", "part_of_speech": "noun", "example_sentence": "Nước mắm là gia vị không thể thiếu.", "example_meaning": "Fish sauce is an indispensable seasoning.", "level": "A1", "audio_url": None},
            {"word": "rau thơm", "phonetic": None, "meaning": "fresh herbs", "part_of_speech": "noun", "example_sentence": "Cho thêm nhiều rau thơm vào bát bún nhé.", "example_meaning": "Add plenty of fresh herbs to the noodle bowl.", "level": "A1", "audio_url": None},
            {"word": "ớt", "phonetic": None, "meaning": "chili pepper", "part_of_speech": "noun", "example_sentence": "Mình không ăn được ớt cay.", "example_meaning": "I cannot eat spicy chili.", "level": "A1", "audio_url": None},
            {"word": "chanh", "phonetic": None, "meaning": "lime / lemon", "part_of_speech": "noun", "example_sentence": "Vắt thêm một miếng chanh cho thơm.", "example_meaning": "Squeeze an extra slice of lime for aroma.", "level": "A1", "audio_url": None},
            {"word": "đũa", "phonetic": None, "meaning": "chopsticks", "part_of_speech": "noun", "example_sentence": "Bạn có biết dùng đũa không?", "example_meaning": "Do you know how to use chopsticks?", "level": "A1", "audio_url": None},
            {"word": "thìa", "phonetic": None, "meaning": "spoon", "part_of_speech": "noun", "example_sentence": "Cho mình xin thêm một cái thìa.", "example_meaning": "Please give me an extra spoon.", "level": "A1", "audio_url": None},
            {"word": "bát", "phonetic": None, "meaning": "bowl", "part_of_speech": "noun", "example_sentence": "Bát phở đầy ắp thịt bò.", "example_meaning": "The bowl of pho is full of beef.", "level": "A1", "audio_url": None},
            {"word": "ngon", "phonetic": None, "meaning": "delicious / tasty", "part_of_speech": "adjective", "example_sentence": "Món này ngon tuyệt vời!", "example_meaning": "This dish is wonderfully delicious!", "level": "A1", "audio_url": None},
            {"word": "no", "phonetic": None, "meaning": "full (after eating)", "part_of_speech": "adjective", "example_sentence": "Mình ăn no căng bụng rồi.", "example_meaning": "I am completely full now.", "level": "A1", "audio_url": None},
            {"word": "đói", "phonetic": None, "meaning": "hungry", "part_of_speech": "adjective", "example_sentence": "Trưa rồi, mình đói bụng quá.", "example_meaning": "It's noon, I'm so hungry.", "level": "A1", "audio_url": None},
            {"word": "mang về", "phonetic": None, "meaning": "takeaway / to go", "part_of_speech": "verb", "example_sentence": "Chị ơi gói cho em hai suất mang về.", "example_meaning": "Please pack two portions to go for me.", "level": "A1", "audio_url": None},
        ],
    },
    {
        "name": "Cà Phê, Trà Sữa & Đồ Uống",
        "description": "Gọi đồ uống tại quán cà phê, chọn mức đường đá và giải khát.",
        "icon_url": "local_cafe",
        "sort_order": 70,
        "words": [
            {"word": "cà phê", "phonetic": None, "meaning": "coffee", "part_of_speech": "noun", "example_sentence": "Việt Nam nổi tiếng với cà phê phin.", "example_meaning": "Vietnam is famous for drip filter coffee.", "level": "A1", "audio_url": None},
            {"word": "cà phê sữa đá", "phonetic": None, "meaning": "iced milk coffee", "part_of_speech": "noun", "example_sentence": "Cho mình một ly cà phê sữa đá.", "example_meaning": "Give me one iced milk coffee.", "level": "A1", "audio_url": None},
            {"word": "bạc xỉu", "phonetic": None, "meaning": "white coffee (lots of milk, light coffee)", "part_of_speech": "noun", "example_sentence": "Không uống được đắng thì gọi bạc xỉu nhé.", "example_meaning": "If you can't handle bitterness, order bac xiu.", "level": "A1", "audio_url": None},
            {"word": "trà sữa", "phonetic": None, "meaning": "milk tea / bubble tea", "part_of_speech": "noun", "example_sentence": "Chiều nay đặt trà sữa uống chung không?", "example_meaning": "Shall we order milk tea together this afternoon?", "level": "A1", "audio_url": None},
            {"word": "trà chanh", "phonetic": None, "meaning": "iced lemon tea", "part_of_speech": "noun", "example_sentence": "Tối nay đi ngồi trà chanh vỉa hè nhé.", "example_meaning": "Let's hang out for street-side lemon tea tonight.", "level": "A1", "audio_url": None},
            {"word": "trà đá", "phonetic": None, "meaning": "iced tea", "part_of_speech": "noun", "example_sentence": "Quán ăn nào cũng có trà đá mát lạnh.", "example_meaning": "Every eatery has cold iced tea.", "level": "A1", "audio_url": None},
            {"word": "nước lọc", "phonetic": None, "meaning": "plain water / filtered water", "part_of_speech": "noun", "example_sentence": "Mỗi ngày nên uống đủ hai lít nước lọc.", "example_meaning": "You should drink two liters of plain water every day.", "level": "A1", "audio_url": None},
            {"word": "nước ép", "phonetic": None, "meaning": "fruit juice", "part_of_speech": "noun", "example_sentence": "Mình thích uống nước ép dứa.", "example_meaning": "I like drinking pineapple juice.", "level": "A1", "audio_url": None},
            {"word": "sinh tố", "phonetic": None, "meaning": "smoothie", "part_of_speech": "noun", "example_sentence": "Sinh tố bơ béo ngậy và thơm ngon.", "example_meaning": "Avocado smoothie is creamy and delicious.", "level": "A1", "audio_url": None},
            {"word": "nước dừa", "phonetic": None, "meaning": "coconut water", "part_of_speech": "noun", "example_sentence": "Trời nóng uống một quả nước dừa rất đã.", "example_meaning": "Drinking coconut water on a hot day is refreshing.", "level": "A1", "audio_url": None},
            {"word": "nước mía", "phonetic": None, "meaning": "sugarcane juice", "part_of_speech": "noun", "example_sentence": "Nước mía vắt thêm quất rất thơm.", "example_meaning": "Sugarcane juice with kumquat smells great.", "level": "A1", "audio_url": None},
            {"word": "sữa tươi", "phonetic": None, "meaning": "fresh milk", "part_of_speech": "noun", "example_sentence": "Trẻ em nên uống sữa tươi mỗi ngày.", "example_meaning": "Children should drink fresh milk every day.", "level": "A1", "audio_url": None},
            {"word": "trân châu", "phonetic": None, "meaning": "tapioca pearls / boba", "part_of_speech": "noun", "example_sentence": "Trà sữa thêm trân châu đen dai giòn.", "example_meaning": "Milk tea with chewy black tapioca pearls.", "level": "A1", "audio_url": None},
            {"word": "ít đường", "phonetic": None, "meaning": "less sugar", "part_of_speech": "phrase", "example_sentence": "Cho em một ly trà đào ít đường.", "example_meaning": "Give me a peach tea with less sugar.", "level": "A1", "audio_url": None},
            {"word": "ít đá", "phonetic": None, "meaning": "less ice", "part_of_speech": "phrase", "example_sentence": "Mình hay gọi đồ uống ít đá.", "example_meaning": "I usually order drinks with less ice.", "level": "A1", "audio_url": None},
            {"word": "nóng", "phonetic": None, "meaning": "hot", "part_of_speech": "adjective", "example_sentence": "Mùa đông uống ca cao nóng rất thích.", "example_meaning": "Drinking hot cocoa in winter feels great.", "level": "A1", "audio_url": None},
            {"word": "lạnh", "phonetic": None, "meaning": "cold", "part_of_speech": "adjective", "example_sentence": "Lấy cho mình chai nước lạnh trong tủ.", "example_meaning": "Get me a cold bottle of water from the fridge.", "level": "A1", "audio_url": None},
            {"word": "ngọt", "phonetic": None, "meaning": "sweet", "part_of_speech": "adjective", "example_sentence": "Ly này hơi ngọt so với khẩu vị của mình.", "example_meaning": "This drink is a bit too sweet for my taste.", "level": "A1", "audio_url": None},
            {"word": "đắng", "phonetic": None, "meaning": "bitter", "part_of_speech": "adjective", "example_sentence": "Cà phê đen nguyên chất có vị đắng nhẹ.", "example_meaning": "Pure black coffee has a mild bitter taste.", "level": "A1", "audio_url": None},
            {"word": "khát nước", "phonetic": None, "meaning": "thirsty", "part_of_speech": "adjective", "example_sentence": "Đi bộ ngoài nắng làm mình khát nước.", "example_meaning": "Walking in the sun made me thirsty.", "level": "A1", "audio_url": None},
        ],
    },
    {
        "name": "Trái Cây Nhiệt Đới & Rau Củ",
        "description": "Các loại hoa quả đặc trưng miền nhiệt đới và rau củ trong bữa cơm.",
        "icon_url": "nutrition",
        "sort_order": 80,
        "words": [
            {"word": "trái cây", "phonetic": None, "meaning": "fruit", "part_of_speech": "noun", "example_sentence": "Việt Nam có rất nhiều trái cây ngon.", "example_meaning": "Vietnam has many delicious fruits.", "level": "A1", "audio_url": None},
            {"word": "xoài", "phonetic": None, "meaning": "mango", "part_of_speech": "noun", "example_sentence": "Xoài chín vàng ăn rất ngọt.", "example_meaning": "Ripe yellow mango tastes very sweet.", "level": "A1", "audio_url": None},
            {"word": "dưa hấu", "phonetic": None, "meaning": "watermelon", "part_of_speech": "noun", "example_sentence": "Dưa hấu đỏ mọng nước.", "example_meaning": "Red watermelon is juicy.", "level": "A1", "audio_url": None},
            {"word": "chuối", "phonetic": None, "meaning": "banana", "part_of_speech": "noun", "example_sentence": "Chuối rất tốt cho người tập thể thao.", "example_meaning": "Bananas are great for people who exercise.", "level": "A1", "audio_url": None},
            {"word": "cam", "phonetic": None, "meaning": "orange (fruit)", "part_of_speech": "noun", "example_sentence": "Cam chứa nhiều vitamin C.", "example_meaning": "Oranges contain a lot of vitamin C.", "level": "A1", "audio_url": None},
            {"word": "táo", "phonetic": None, "meaning": "apple", "part_of_speech": "noun", "example_sentence": "Quả táo này giòn và ngọt.", "example_meaning": "This apple is crisp and sweet.", "level": "A1", "audio_url": None},
            {"word": "nho", "phonetic": None, "meaning": "grape", "part_of_speech": "noun", "example_sentence": "Chùm nho tím nhìn rất tươi.", "example_meaning": "The bunch of purple grapes looks very fresh.", "level": "A1", "audio_url": None},
            {"word": "sầu riêng", "phonetic": None, "meaning": "durian", "part_of_speech": "noun", "example_sentence": "Sầu riêng có mùi thơm rất đặc trưng.", "example_meaning": "Durian has a very distinctive aroma.", "level": "A1", "audio_url": None},
            {"word": "thanh long", "phonetic": None, "meaning": "dragon fruit", "part_of_speech": "noun", "example_sentence": "Thanh long ruột đỏ rất đẹp mắt.", "example_meaning": "Red-fleshed dragon fruit looks very pretty.", "level": "A1", "audio_url": None},
            {"word": "dừa", "phonetic": None, "meaning": "coconut", "part_of_speech": "noun", "example_sentence": "Bến Tre nổi tiếng với những vườn dừa.", "example_meaning": "Ben Tre is famous for its coconut groves.", "level": "A1", "audio_url": None},
            {"word": "bơ", "phonetic": None, "meaning": "avocado", "part_of_speech": "noun", "example_sentence": "Quả bơ chín mềm và dẻo.", "example_meaning": "The ripe avocado is soft and creamy.", "level": "A1", "audio_url": None},
            {"word": "dứa", "phonetic": None, "meaning": "pineapple", "part_of_speech": "noun", "example_sentence": "Dứa có vị chua ngọt hài hòa.", "example_meaning": "Pineapple has a balanced sweet and sour taste.", "level": "A1", "audio_url": None},
            {"word": "rau muống", "phonetic": None, "meaning": "water spinach / morning glory", "part_of_speech": "noun", "example_sentence": "Rau muống xào tỏi là món ăn quốc dân.", "example_meaning": "Stir-fried water spinach with garlic is a classic dish.", "level": "A1", "audio_url": None},
            {"word": "cà chua", "phonetic": None, "meaning": "tomato", "part_of_speech": "noun", "example_sentence": "Cà chua chín đỏ dùng để nấu canh.", "example_meaning": "Ripe red tomatoes are used for cooking soup.", "level": "A1", "audio_url": None},
            {"word": "khoai tây", "phonetic": None, "meaning": "potato", "part_of_speech": "noun", "example_sentence": "Trẻ con rất thích khoai tây chiên.", "example_meaning": "Kids love french fries.", "level": "A1", "audio_url": None},
            {"word": "cà rốt", "phonetic": None, "meaning": "carrot", "part_of_speech": "noun", "example_sentence": "Cà rốt tốt cho mắt.", "example_meaning": "Carrots are good for the eyes.", "level": "A1", "audio_url": None},
            {"word": "dưa chuột", "phonetic": None, "meaning": "cucumber", "part_of_speech": "noun", "example_sentence": "Dưa chuột ăn sống rất giòn.", "example_meaning": "Raw cucumber is very crunchy.", "level": "A1", "audio_url": None},
            {"word": "hành tây", "phonetic": None, "meaning": "onion", "part_of_speech": "noun", "example_sentence": "Thái hành tây hay làm cay mắt.", "example_meaning": "Chopping onions often makes eyes water.", "level": "A1", "audio_url": None},
            {"word": "tỏi", "phonetic": None, "meaning": "garlic", "part_of_speech": "noun", "example_sentence": "Phi thơm tỏi trước khi xào rau.", "example_meaning": "Sauté garlic until fragrant before stir-frying vegetables.", "level": "A1", "audio_url": None},
            {"word": "tươi", "phonetic": None, "meaning": "fresh", "part_of_speech": "adjective", "example_sentence": "Rau quả buổi sáng ở chợ rất tươi.", "example_meaning": "Morning produce at the market is very fresh.", "level": "A1", "audio_url": None},
        ],
    },
    {
        "name": "Nhà Cửa & Đồ Dùng Hằng Ngày",
        "description": "Các phòng trong nhà và vật dụng sinh hoạt quen thuộc.",
        "icon_url": "home",
        "sort_order": 90,
        "words": [
            {"word": "ngôi nhà", "phonetic": None, "meaning": "house / home", "part_of_speech": "noun", "example_sentence": "Ngôi nhà có ban công trồng đầy hoa.", "example_meaning": "The house has a balcony full of flowers.", "level": "A1", "audio_url": None},
            {"word": "phòng khách", "phonetic": None, "meaning": "living room", "part_of_speech": "noun", "example_sentence": "Phòng khách rộng và nhiều ánh sáng.", "example_meaning": "The living room is spacious and bright.", "level": "A1", "audio_url": None},
            {"word": "phòng ngủ", "phonetic": None, "meaning": "bedroom", "part_of_speech": "noun", "example_sentence": "Phòng ngủ của mình rất yên tĩnh.", "example_meaning": "My bedroom is very quiet.", "level": "A1", "audio_url": None},
            {"word": "nhà bếp", "phonetic": None, "meaning": "kitchen", "part_of_speech": "noun", "example_sentence": "Mẹ đang nấu ăn trong nhà bếp.", "example_meaning": "Mom is cooking in the kitchen.", "level": "A1", "audio_url": None},
            {"word": "nhà vệ sinh", "phonetic": None, "meaning": "bathroom / restroom", "part_of_speech": "noun", "example_sentence": "Cho mình hỏi nhà vệ sinh ở đâu ạ?", "example_meaning": "Excuse me, where is the restroom?", "level": "A1", "audio_url": None},
            {"word": "cửa sổ", "phonetic": None, "meaning": "window", "part_of_speech": "noun", "example_sentence": "Mở cửa sổ ra cho thoáng phòng.", "example_meaning": "Open the window to air out the room.", "level": "A1", "audio_url": None},
            {"word": "cửa chính", "phonetic": None, "meaning": "front door / main door", "part_of_speech": "noun", "example_sentence": "Nhớ khóa cửa chính trước khi đi ngủ.", "example_meaning": "Remember to lock the front door before sleeping.", "level": "A1", "audio_url": None},
            {"word": "cái bàn", "phonetic": None, "meaning": "table / desk", "part_of_speech": "noun", "example_sentence": "Trên bàn có một bình hoa tươi.", "example_meaning": "There is a vase of fresh flowers on the table.", "level": "A1", "audio_url": None},
            {"word": "cái ghế", "phonetic": None, "meaning": "chair", "part_of_speech": "noun", "example_sentence": "Mời bạn ngồi vào ghế.", "example_meaning": "Please have a seat on the chair.", "level": "A1", "audio_url": None},
            {"word": "giường", "phonetic": None, "meaning": "bed", "part_of_speech": "noun", "example_sentence": "Cái giường này nằm rất êm.", "example_meaning": "This bed is very comfortable to lie on.", "level": "A1", "audio_url": None},
            {"word": "gối", "phonetic": None, "meaning": "pillow", "part_of_speech": "noun", "example_sentence": "Mình thích dùng gối mềm.", "example_meaning": "I like using a soft pillow.", "level": "A1", "audio_url": None},
            {"word": "chăn", "phonetic": None, "meaning": "blanket", "part_of_speech": "noun", "example_sentence": "Trời se lạnh rồi, đắp thêm chăn đi.", "example_meaning": "It's getting chilly, put on an extra blanket.", "level": "A1", "audio_url": None},
            {"word": "tủ lạnh", "phonetic": None, "meaning": "refrigerator", "part_of_speech": "noun", "example_sentence": "Trong tủ lạnh còn nhiều trái cây.", "example_meaning": "There is still plenty of fruit in the fridge.", "level": "A1", "audio_url": None},
            {"word": "máy giặt", "phonetic": None, "meaning": "washing machine", "part_of_speech": "noun", "example_sentence": "Cuối tuần mình cho quần áo vào máy giặt.", "example_meaning": "On weekends I put clothes into the washing machine.", "level": "A1", "audio_url": None},
            {"word": "điều hòa", "phonetic": None, "meaning": "air conditioner", "part_of_speech": "noun", "example_sentence": "Mùa hè bật điều hòa hai mươi sáu độ là vừa.", "example_meaning": "In summer, setting the AC to 26 degrees is just right.", "level": "A1", "audio_url": None},
            {"word": "quạt", "phonetic": None, "meaning": "fan", "part_of_speech": "noun", "example_sentence": "Bật quạt lên cho mát nhé.", "example_meaning": "Turn on the fan to cool down.", "level": "A1", "audio_url": None},
            {"word": "đèn", "phonetic": None, "meaning": "lamp / light", "part_of_speech": "noun", "example_sentence": "Tắt đèn khi ra khỏi phòng.", "example_meaning": "Turn off the light when leaving the room.", "level": "A1", "audio_url": None},
            {"word": "chìa khóa", "phonetic": None, "meaning": "key", "part_of_speech": "noun", "example_sentence": "Mình để chìa khóa trên kệ giày.", "example_meaning": "I left the keys on the shoe rack.", "level": "A1", "audio_url": None},
            {"word": "dọn dẹp", "phonetic": None, "meaning": "to clean up / tidy", "part_of_speech": "verb", "example_sentence": "Chủ nhật mình dành thời gian dọn dẹp nhà cửa.", "example_meaning": "On Sunday I spend time cleaning up the house.", "level": "A1", "audio_url": None},
            {"word": "sạch sẽ", "phonetic": None, "meaning": "clean / neat", "part_of_speech": "adjective", "example_sentence": "Căn phòng gọn gàng và sạch sẽ.", "example_meaning": "The room is tidy and clean.", "level": "A1", "audio_url": None},
        ],
    },
    {
        "name": "Quần Áo & Phụ Kiện",
        "description": "Trang phục mặc hằng ngày, thử đồ và chọn phong cách.",
        "icon_url": "checkroom",
        "sort_order": 100,
        "words": [
            {"word": "quần áo", "phonetic": None, "meaning": "clothes", "part_of_speech": "noun", "example_sentence": "Hôm nay nắng đẹp nên phơi quần áo rất nhanh khô.", "example_meaning": "Today is sunny so clothes dry very fast.", "level": "A2", "audio_url": None},
            {"word": "áo phông", "phonetic": None, "meaning": "T-shirt", "part_of_speech": "noun", "example_sentence": "Mình hay mặc áo phông và quần bò đi học.", "example_meaning": "I often wear a T-shirt and jeans to school.", "level": "A2", "audio_url": None},
            {"word": "áo sơ mi", "phonetic": None, "meaning": "button-up shirt", "part_of_speech": "noun", "example_sentence": "Anh ấy mặc áo sơ mi trắng đi họp.", "example_meaning": "He wears a white dress shirt to the meeting.", "level": "A2", "audio_url": None},
            {"word": "áo khoác", "phonetic": None, "meaning": "jacket / coat", "part_of_speech": "noun", "example_sentence": "Sáng sớm trời lạnh, nhớ mặc thêm áo khoác.", "example_meaning": "It's cold early in the morning, remember to wear a jacket.", "level": "A2", "audio_url": None},
            {"word": "quần dài", "phonetic": None, "meaning": "trousers / pants", "part_of_speech": "noun", "example_sentence": "Chiếc quần dài này mặc rất thoải mái.", "example_meaning": "These trousers are very comfortable to wear.", "level": "A2", "audio_url": None},
            {"word": "quần bò", "phonetic": None, "meaning": "jeans", "part_of_speech": "noun", "example_sentence": "Quần bò xanh dễ phối đồ.", "example_meaning": "Blue jeans are easy to match with outfits.", "level": "A2", "audio_url": None},
            {"word": "váy", "phonetic": None, "meaning": "dress / skirt", "part_of_speech": "noun", "example_sentence": "Chiếc váy hoa này rất hợp với bạn.", "example_meaning": "This floral dress suits you very well.", "level": "A2", "audio_url": None},
            {"word": "áo dài", "phonetic": None, "meaning": "Vietnamese traditional dress", "part_of_speech": "noun", "example_sentence": "Áo dài tôn lên nét duyên dáng của người Việt.", "example_meaning": "Ao dai highlights Vietnamese grace.", "level": "A2", "audio_url": None},
            {"word": "giày thể thao", "phonetic": None, "meaning": "sneakers", "part_of_speech": "noun", "example_sentence": "Đi bộ nhiều thì nên đi giày thể thao.", "example_meaning": "If you walk a lot, you should wear sneakers.", "level": "A2", "audio_url": None},
            {"word": "dép", "phonetic": None, "meaning": "sandals / slippers", "part_of_speech": "noun", "example_sentence": "Ở nhà mình hay đi dép bông.", "example_meaning": "At home I usually wear plush slippers.", "level": "A2", "audio_url": None},
            {"word": "tất", "phonetic": None, "meaning": "socks", "part_of_speech": "noun", "example_sentence": "Mình mới mua mấy đôi tất cổ ngắn.", "example_meaning": "I just bought a few pairs of ankle socks.", "level": "A2", "audio_url": None},
            {"word": "mũ", "phonetic": None, "meaning": "hat / cap", "part_of_speech": "noun", "example_sentence": "Đội mũ vào kẻo nắng nhé.", "example_meaning": "Put on a hat so you don't get sunburned.", "level": "A2", "audio_url": None},
            {"word": "kính râm", "phonetic": None, "meaning": "sunglasses", "part_of_speech": "noun", "example_sentence": "Đi biển nhớ mang theo kính râm.", "example_meaning": "Remember to bring sunglasses when going to the beach.", "level": "A2", "audio_url": None},
            {"word": "ba lô", "phonetic": None, "meaning": "backpack", "part_of_speech": "noun", "example_sentence": "Ba lô đựng vừa cả máy tính xách tay.", "example_meaning": "The backpack fits a laptop too.", "level": "A2", "audio_url": None},
            {"word": "túi xách", "phonetic": None, "meaning": "handbag / tote bag", "part_of_speech": "noun", "example_sentence": "Cô ấy đeo một chiếc túi xách nhỏ màu nâu.", "example_meaning": "She carries a small brown handbag.", "level": "A2", "audio_url": None},
            {"word": "ví", "phonetic": None, "meaning": "wallet", "part_of_speech": "noun", "example_sentence": "Thẻ căn cước để trong ví.", "example_meaning": "The ID card is kept in the wallet.", "level": "A2", "audio_url": None},
            {"word": "mặc", "phonetic": None, "meaning": "to wear (clothes)", "part_of_speech": "verb", "example_sentence": "Hôm nay bạn mặc bộ đồ đẹp thế.", "example_meaning": "You are wearing a nice outfit today.", "level": "A2", "audio_url": None},
            {"word": "thử đồ", "phonetic": None, "meaning": "to try on clothes", "part_of_speech": "verb", "example_sentence": "Phòng thử đồ ở phía cuối cửa hàng.", "example_meaning": "The fitting room is at the back of the store.", "level": "A2", "audio_url": None},
            {"word": "vừa vặn", "phonetic": None, "meaning": "fits well", "part_of_speech": "adjective", "example_sentence": "Cỡ M mặc lên rất vừa vặn.", "example_meaning": "Size M fits very well.", "level": "A2", "audio_url": None},
            {"word": "đẹp", "phonetic": None, "meaning": "beautiful / nice", "part_of_speech": "adjective", "example_sentence": "Màu này tôn da và trông rất đẹp.", "example_meaning": "This color flatters your skin and looks very nice.", "level": "A2", "audio_url": None},
        ],
    },
    {
        "name": "Đi Chợ & Siêu Thị",
        "description": "Mua sắm thực phẩm, mặc cả nhẹ nhàng và thanh toán ở quầy.",
        "icon_url": "shopping_bag",
        "sort_order": 110,
        "words": [
            {"word": "chợ", "phonetic": None, "meaning": "traditional market", "part_of_speech": "noun", "example_sentence": "Đi chợ truyền thống rất vui và nhộn nhịp.", "example_meaning": "Going to a traditional market is fun and lively.", "level": "A2", "audio_url": None},
            {"word": "siêu thị", "phonetic": None, "meaning": "supermarket", "part_of_speech": "noun", "example_sentence": "Cuối tuần mình đi siêu thị mua đồ ăn.", "example_meaning": "On weekends I go to the supermarket to buy groceries.", "level": "A2", "audio_url": None},
            {"word": "cửa hàng tiện lợi", "phonetic": None, "meaning": "convenience store", "part_of_speech": "noun", "example_sentence": "Cửa hàng tiện lợi mở cửa cả đêm.", "example_meaning": "The convenience store is open all night.", "level": "A2", "audio_url": None},
            {"word": "mua", "phonetic": None, "meaning": "to buy", "part_of_speech": "verb", "example_sentence": "Mình cần mua ít sữa và bánh mì.", "example_meaning": "I need to buy some milk and bread.", "level": "A2", "audio_url": None},
            {"word": "bán", "phonetic": None, "meaning": "to sell", "part_of_speech": "verb", "example_sentence": "Cô bán hàng rất niềm nở.", "example_meaning": "The shopkeeper is very welcoming.", "level": "A2", "audio_url": None},
            {"word": "giảm giá", "phonetic": None, "meaning": "discount / on sale", "part_of_speech": "noun", "example_sentence": "Hôm nay siêu thị đang giảm giá nhiều mặt hàng.", "example_meaning": "Today the supermarket is discounting many items.", "level": "A2", "audio_url": None},
            {"word": "mặc cả", "phonetic": None, "meaning": "to bargain / haggle", "part_of_speech": "verb", "example_sentence": "Ở chợ bạn có thể mặc cả một chút.", "example_meaning": "At the market you can bargain a little.", "level": "A2", "audio_url": None},
            {"word": "bớt", "phonetic": None, "meaning": "to reduce / lower (price)", "part_of_speech": "verb", "example_sentence": "Cô ơi bớt cho cháu mười nghìn nhé.", "example_meaning": "Auntie, could you take ten thousand off for me?", "level": "A2", "audio_url": None},
            {"word": "hóa đơn", "phonetic": None, "meaning": "receipt / bill", "part_of_speech": "noun", "example_sentence": "Bạn giữ hóa đơn để kiểm tra lại nhé.", "example_meaning": "Keep the receipt to double-check.", "level": "A2", "audio_url": None},
            {"word": "tiền mặt", "phonetic": None, "meaning": "cash", "part_of_speech": "noun", "example_sentence": "Quán nhỏ này chỉ nhận tiền mặt.", "example_meaning": "This small shop only accepts cash.", "level": "A2", "audio_url": None},
            {"word": "tiền thừa", "phonetic": None, "meaning": "change (money returned)", "part_of_speech": "noun", "example_sentence": "Gửi lại bạn hai mươi nghìn tiền thừa.", "example_meaning": "Here is your twenty thousand change.", "level": "A2", "audio_url": None},
            {"word": "giỏ hàng", "phonetic": None, "meaning": "shopping basket / cart", "part_of_speech": "noun", "example_sentence": "Giỏ hàng của mình đã đầy rau củ.", "example_meaning": "My shopping basket is full of vegetables.", "level": "A2", "audio_url": None},
            {"word": "quầy thu ngân", "phonetic": None, "meaning": "checkout counter", "part_of_speech": "noun", "example_sentence": "Xếp hàng thanh toán ở quầy thu ngân.", "example_meaning": "Line up to pay at the checkout counter.", "level": "A2", "audio_url": None},
            {"word": "cân", "phonetic": None, "meaning": "kilogram / to weigh", "part_of_speech": "noun", "example_sentence": "Cho cháu mua một cân cam.", "example_meaning": "Let me buy one kilogram of oranges.", "level": "A2", "audio_url": None},
            {"word": "lạng", "phonetic": None, "meaning": "100 grams (unit of weight)", "part_of_speech": "noun", "example_sentence": "Mua giúp mẹ ba lạng thịt bò.", "example_meaning": "Buy 300 grams of beef for mom.", "level": "A2", "audio_url": None},
            {"word": "túi vải", "phonetic": None, "meaning": "cloth tote bag", "part_of_speech": "noun", "example_sentence": "Mình hay mang túi vải đi siêu thị cho đỡ rác nhựa.", "example_meaning": "I often bring a cloth bag to the supermarket to reduce plastic waste.", "level": "A2", "audio_url": None},
            {"word": "hạn sử dụng", "phonetic": None, "meaning": "expiration date", "part_of_speech": "noun", "example_sentence": "Nhớ xem hạn sử dụng trên hộp sữa.", "example_meaning": "Remember to check the expiration date on the milk carton.", "level": "A2", "audio_url": None},
            {"word": "đổi trả", "phonetic": None, "meaning": "exchange and return", "part_of_speech": "verb", "example_sentence": "Sản phẩm lỗi được đổi trả trong bảy ngày.", "example_meaning": "Defective items can be exchanged or returned within seven days.", "level": "A2", "audio_url": None},
            {"word": "chọn", "phonetic": None, "meaning": "to choose / pick", "part_of_speech": "verb", "example_sentence": "Cô ấy chọn những quả xoài chín vàng.", "example_meaning": "She picked the ripe yellow mangoes.", "level": "A2", "audio_url": None},
            {"word": "thanh toán", "phonetic": None, "meaning": "to pay / checkout", "part_of_speech": "verb", "example_sentence": "Bạn có thể thanh toán bằng mã QR.", "example_meaning": "You can pay by QR code.", "level": "A2", "audio_url": None},
        ],
    },
    {
        "name": "Xe Máy, Grab & Hỏi Đường",
        "description": "Di chuyển trong thành phố, đặt xe công nghệ và hỏi chỉ đường.",
        "icon_url": "two_wheeler",
        "sort_order": 120,
        "words": [
            {"word": "xe máy", "phonetic": None, "meaning": "motorbike", "part_of_speech": "noun", "example_sentence": "Xe máy là phương tiện phổ biến nhất ở Việt Nam.", "example_meaning": "Motorbikes are the most common transport in Vietnam.", "level": "A2", "audio_url": None},
            {"word": "mũ bảo hiểm", "phonetic": None, "meaning": "helmet", "part_of_speech": "noun", "example_sentence": "Đi xe máy nhớ đội mũ bảo hiểm cài quai.", "example_meaning": "When riding a motorbike, wear a helmet and fasten the strap.", "level": "A2", "audio_url": None},
            {"word": "ô tô", "phonetic": None, "meaning": "car", "part_of_speech": "noun", "example_sentence": "Trời mưa đi ô tô cho đỡ ướt.", "example_meaning": "Take a car in the rain so you don't get wet.", "level": "A2", "audio_url": None},
            {"word": "xe buýt", "phonetic": None, "meaning": "bus", "part_of_speech": "noun", "example_sentence": "Đi xe buýt vừa rẻ vừa mát.", "example_meaning": "Taking the bus is both cheap and cool.", "level": "A2", "audio_url": None},
            {"word": "xe đạp", "phonetic": None, "meaning": "bicycle", "part_of_speech": "noun", "example_sentence": "Chiều mát mình thích đạp xe quanh hồ Tây.", "example_meaning": "In the cool afternoon I like cycling around West Lake.", "level": "A2", "audio_url": None},
            {"word": "tài xế", "phonetic": None, "meaning": "driver", "part_of_speech": "noun", "example_sentence": "Anh tài xế chạy xe rất cẩn thận.", "example_meaning": "The driver drives very carefully.", "level": "A2", "audio_url": None},
            {"word": "đặt xe", "phonetic": None, "meaning": "to book a ride", "part_of_speech": "verb", "example_sentence": "Đợi mình đặt xe qua ứng dụng nhé.", "example_meaning": "Wait while I book a ride on the app.", "level": "A2", "audio_url": None},
            {"word": "tắc đường", "phonetic": None, "meaning": "traffic jam", "part_of_speech": "noun", "example_sentence": "Giờ tan tầm hay bị tắc đường.", "example_meaning": "There are often traffic jams during rush hour.", "level": "A2", "audio_url": None},
            {"word": "ngã tư", "phonetic": None, "meaning": "intersection / crossroads", "part_of_speech": "noun", "example_sentence": "Đến ngã tư phía trước thì rẽ trái.", "example_meaning": "Turn left at the intersection ahead.", "level": "A2", "audio_url": None},
            {"word": "đèn đỏ", "phonetic": None, "meaning": "red traffic light", "part_of_speech": "noun", "example_sentence": "Gặp đèn đỏ phải dừng lại đúng vạch.", "example_meaning": "At a red light, stop behind the line.", "level": "A2", "audio_url": None},
            {"word": "đi thẳng", "phonetic": None, "meaning": "go straight", "part_of_speech": "verb", "example_sentence": "Bạn cứ đi thẳng khoảng hai trăm mét.", "example_meaning": "Just go straight for about two hundred meters.", "level": "A2", "audio_url": None},
            {"word": "rẽ trái", "phonetic": None, "meaning": "turn left", "part_of_speech": "verb", "example_sentence": "Qua cầu rồi rẽ trái là tới.", "example_meaning": "Cross the bridge and turn left to get there.", "level": "A2", "audio_url": None},
            {"word": "rẽ phải", "phonetic": None, "meaning": "turn right", "part_of_speech": "verb", "example_sentence": "Rẽ phải vào con ngõ nhỏ bên cạnh.", "example_meaning": "Turn right into the small alley next door.", "level": "A2", "audio_url": None},
            {"word": "quay đầu", "phonetic": None, "meaning": "to make a U-turn", "part_of_speech": "verb", "example_sentence": "Đi quá mất rồi, tìm chỗ quay đầu xe thôi.", "example_meaning": "We passed it, let's find a spot to make a U-turn.", "level": "A2", "audio_url": None},
            {"word": "con ngõ", "phonetic": None, "meaning": "alley / lane", "part_of_speech": "noun", "example_sentence": "Quán bún ngon nằm sâu trong con ngõ.", "example_meaning": "The delicious noodle shop is tucked inside an alley.", "level": "A2", "audio_url": None},
            {"word": "vỉa hè", "phonetic": None, "meaning": "sidewalk / pavement", "part_of_speech": "noun", "example_sentence": "Người đi bộ đi trên vỉa hè.", "example_meaning": "Pedestrians walk on the sidewalk.", "level": "A2", "audio_url": None},
            {"word": "gần", "phonetic": None, "meaning": "near / close", "part_of_speech": "adjective", "example_sentence": "Nhà mình ở rất gần bến xe buýt.", "example_meaning": "My house is very close to the bus stop.", "level": "A2", "audio_url": None},
            {"word": "xa", "phonetic": None, "meaning": "far", "part_of_speech": "adjective", "example_sentence": "Từ đây ra sân bay mất khoảng bốn mươi phút.", "example_meaning": "From here to the airport takes about forty minutes.", "level": "A2", "audio_url": None},
            {"word": "bản đồ", "phonetic": None, "meaning": "map", "part_of_speech": "noun", "example_sentence": "Mở bản đồ trên điện thoại ra xem đường nào nhanh nhất.", "example_meaning": "Open the map on your phone to see which route is fastest.", "level": "A2", "audio_url": None},
            {"word": "lạc đường", "phonetic": None, "meaning": "to get lost", "part_of_speech": "verb", "example_sentence": "Lần đầu đến phố cổ mình suýt bị lạc đường.", "example_meaning": "The first time I visited the Old Quarter, I almost got lost.", "level": "A2", "audio_url": None},
        ],
    },
    {
        "name": "Thời Tiết & Bốn Mùa",
        "description": "Nói chuyện về nắng mưa, nóng lạnh và thời tiết đặc trưng các mùa.",
        "icon_url": "wb_sunny",
        "sort_order": 130,
        "words": [
            {"word": "thời tiết", "phonetic": None, "meaning": "weather", "part_of_speech": "noun", "example_sentence": "Thời tiết hôm nay rất đẹp để đi dạo.", "example_meaning": "The weather today is great for a walk.", "level": "A2", "audio_url": None},
            {"word": "nắng", "phonetic": None, "meaning": "sunny / sunshine", "part_of_speech": "adjective", "example_sentence": "Trời nắng to nhưng có gió nên dễ chịu.", "example_meaning": "It's bright and sunny, but breezy so it feels pleasant.", "level": "A2", "audio_url": None},
            {"word": "mưa", "phonetic": None, "meaning": "rain / rainy", "part_of_speech": "verb", "example_sentence": "Ngoài trời đang mưa rào.", "example_meaning": "It is pouring rain outside.", "level": "A2", "audio_url": None},
            {"word": "gió", "phonetic": None, "meaning": "wind / windy", "part_of_speech": "noun", "example_sentence": "Chiều nay gió thổi mát rượi.", "example_meaning": "This afternoon a cool breeze is blowing.", "level": "A2", "audio_url": None},
            {"word": "mây", "phonetic": None, "meaning": "cloud", "part_of_speech": "noun", "example_sentence": "Những đám mây trắng trôi nhẹ trên trời.", "example_meaning": "White clouds drift gently across the sky.", "level": "A2", "audio_url": None},
            {"word": "mùa xuân", "phonetic": None, "meaning": "spring", "part_of_speech": "noun", "example_sentence": "Mùa xuân cây cối đâm chồi nảy lộc.", "example_meaning": "In spring, trees bud and sprout.", "level": "A2", "audio_url": None},
            {"word": "mùa hè", "phonetic": None, "meaning": "summer", "part_of_speech": "noun", "example_sentence": "Mùa hè học sinh được nghỉ học.", "example_meaning": "In summer, students have summer break.", "level": "A2", "audio_url": None},
            {"word": "mùa thu", "phonetic": None, "meaning": "autumn / fall", "part_of_speech": "noun", "example_sentence": "Mùa thu Hà Nội có hương hoa sữa.", "example_meaning": "Autumn in Hanoi carries the scent of milk flowers.", "level": "A2", "audio_url": None},
            {"word": "mùa đông", "phonetic": None, "meaning": "winter", "part_of_speech": "noun", "example_sentence": "Mùa đông miền Bắc khá lạnh.", "example_meaning": "Winter in Northern Vietnam is quite cold.", "level": "A2", "audio_url": None},
            {"word": "mát mẻ", "phonetic": None, "meaning": "cool and pleasant", "part_of_speech": "adjective", "example_sentence": "Sáng sớm không khí rất mát mẻ.", "example_meaning": "Early in the morning the air is very cool and pleasant.", "level": "A2", "audio_url": None},
            {"word": "ấm áp", "phonetic": None, "meaning": "warm", "part_of_speech": "adjective", "example_sentence": "Nắng mùa xuân rất ấm áp.", "example_meaning": "Spring sunshine is very warm.", "level": "A2", "audio_url": None},
            {"word": "oi bức", "phonetic": None, "meaning": "hot and humid / muggy", "part_of_speech": "adjective", "example_sentence": "Trưa hè thời tiết hơi oi bức.", "example_meaning": "Summer afternoons are a bit muggy.", "level": "A2", "audio_url": None},
            {"word": "se lạnh", "phonetic": None, "meaning": "chilly / slightly cold", "part_of_speech": "adjective", "example_sentence": "Trời se lạnh mặc áo len mỏng là hợp nhất.", "example_meaning": "When it's chilly, wearing a light sweater is best.", "level": "A2", "audio_url": None},
            {"word": "áo mưa", "phonetic": None, "meaning": "raincoat", "part_of_speech": "noun", "example_sentence": "Trong cốp xe lúc nào cũng có sẵn áo mưa.", "example_meaning": "There is always a raincoat ready in the motorbike trunk.", "level": "A2", "audio_url": None},
            {"word": "cái ô", "phonetic": None, "meaning": "umbrella", "part_of_speech": "noun", "example_sentence": "Trời âm u rồi, mang theo cái ô nhé.", "example_meaning": "The sky is overcast, bring an umbrella.", "level": "A2", "audio_url": None},
            {"word": "bão", "phonetic": None, "meaning": "storm / typhoon", "part_of_speech": "noun", "example_sentence": "Dự báo nói cuối tuần có bão lớn.", "example_meaning": "The forecast says there will be a big storm this weekend.", "level": "A2", "audio_url": None},
            {"word": "sương mù", "phonetic": None, "meaning": "fog / mist", "part_of_speech": "noun", "example_sentence": "Sáng sớm trên núi có nhiều sương mù.", "example_meaning": "Early in the morning there is thick fog in the mountains.", "level": "A2", "audio_url": None},
            {"word": "cầu vồng", "phonetic": None, "meaning": "rainbow", "part_of_speech": "noun", "example_sentence": "Sau cơn mưa xuất hiện cầu vồng bảy sắc.", "example_meaning": "After the rain, a seven-color rainbow appeared.", "level": "A2", "audio_url": None},
            {"word": "nhiệt độ", "phonetic": None, "meaning": "temperature", "part_of_speech": "noun", "example_sentence": "Nhiệt độ ngoài trời đang là hai mươi lăm độ.", "example_meaning": "The outdoor temperature is twenty-five degrees.", "level": "A2", "audio_url": None},
            {"word": "khô ráo", "phonetic": None, "meaning": "dry (weather/ground)", "part_of_speech": "adjective", "example_sentence": "Hôm nay trời khô ráo, đi chơi rất tiện.", "example_meaning": "Today is dry, very convenient for going out.", "level": "A2", "audio_url": None},
        ],
    },
    {
        "name": "Cảm Xúc & Tính Cách",
        "description": "Diễn đạt tâm trạng vui buồn và khen ngợi tính cách của mọi người.",
        "icon_url": "sentiment_satisfied",
        "sort_order": 140,
        "words": [
            {"word": "vui vẻ", "phonetic": None, "meaning": "happy / cheerful", "part_of_speech": "adjective", "example_sentence": "Cô ấy lúc nào cũng cười nói vui vẻ.", "example_meaning": "She always smiles and talks cheerfully.", "level": "A2", "audio_url": None},
            {"word": "buồn", "phonetic": None, "meaning": "sad", "part_of_speech": "adjective", "example_sentence": "Đừng buồn nữa, mọi chuyện sẽ ổn thôi.", "example_meaning": "Don't be sad anymore, everything will be fine.", "level": "A2", "audio_url": None},
            {"word": "tức giận", "phonetic": None, "meaning": "angry", "part_of_speech": "adjective", "example_sentence": "Khi tức giận bạn nên hít thở sâu.", "example_meaning": "When angry, you should take a deep breath.", "level": "A2", "audio_url": None},
            {"word": "hào hứng", "phonetic": None, "meaning": "excited / enthusiastic", "part_of_speech": "adjective", "example_sentence": "Cả lớp đều hào hứng với chuyến dã ngoại.", "example_meaning": "The whole class is excited about the picnic.", "level": "A2", "audio_url": None},
            {"word": "lo lắng", "phonetic": None, "meaning": "worried / anxious", "part_of_speech": "adjective", "example_sentence": "Trước ngày thi ai cũng hơi lo lắng.", "example_meaning": "Before exam day, everyone feels a bit anxious.", "level": "A2", "audio_url": None},
            {"word": "hồi hộp", "phonetic": None, "meaning": "nervous / thrilled", "part_of_speech": "adjective", "example_sentence": "Mình rất hồi hộp chờ kết quả.", "example_meaning": "I am nervously waiting for the results.", "level": "A2", "audio_url": None},
            {"word": "ngạc nhiên", "phonetic": None, "meaning": "surprised", "part_of_speech": "adjective", "example_sentence": "Mình rất ngạc nhiên khi nhận được quà.", "example_meaning": "I was very surprised to receive the gift.", "level": "A2", "audio_url": None},
            {"word": "mệt mỏi", "phonetic": None, "meaning": "tired / exhausted", "part_of_speech": "adjective", "example_sentence": "Làm việc cả ngày nên mình thấy hơi mệt mỏi.", "example_meaning": "Working all day made me feel a bit tired.", "level": "A2", "audio_url": None},
            {"word": "thoải mái", "phonetic": None, "meaning": "comfortable / relaxed", "part_of_speech": "adjective", "example_sentence": "Cứ tự nhiên như ở nhà cho thoải mái nhé.", "example_meaning": "Make yourself at home so you feel comfortable.", "level": "A2", "audio_url": None},
            {"word": "tự hào", "phonetic": None, "meaning": "proud", "part_of_speech": "adjective", "example_sentence": "Bố mẹ rất tự hào về kết quả học tập của bạn.", "example_meaning": "Your parents are very proud of your study results.", "level": "A2", "audio_url": None},
            {"word": "thân thiện", "phonetic": None, "meaning": "friendly", "part_of_speech": "adjective", "example_sentence": "Người dân ở đây rất thân thiện và mến khách.", "example_meaning": "The locals here are very friendly and hospitable.", "level": "A2", "audio_url": None},
            {"word": "hài hước", "phonetic": None, "meaning": "humorous / funny", "part_of_speech": "adjective", "example_sentence": "Anh ấy nói chuyện rất hài hước.", "example_meaning": "He talks in a very humorous way.", "level": "A2", "audio_url": None},
            {"word": "tốt bụng", "phonetic": None, "meaning": "kind-hearted", "part_of_speech": "adjective", "example_sentence": "Chị ấy là người tốt bụng, hay giúp đỡ mọi người.", "example_meaning": "She is a kind person who often helps others.", "level": "A2", "audio_url": None},
            {"word": "chăm chỉ", "phonetic": None, "meaning": "hardworking / diligent", "part_of_speech": "adjective", "example_sentence": "Bạn ấy học hành rất chăm chỉ.", "example_meaning": "They study very diligently.", "level": "A2", "audio_url": None},
            {"word": "thông minh", "phonetic": None, "meaning": "smart / intelligent", "part_of_speech": "adjective", "example_sentence": "Cậu bé rất thông minh và nhanh nhẹn.", "example_meaning": "The boy is very smart and quick-witted.", "level": "A2", "audio_url": None},
            {"word": "nhút nhát", "phonetic": None, "meaning": "shy / timid", "part_of_speech": "adjective", "example_sentence": "Lúc mới quen bạn ấy hơi nhút nhát.", "example_meaning": "When we first met, they were a bit shy.", "level": "A2", "audio_url": None},
            {"word": "cởi mở", "phonetic": None, "meaning": "open-minded / outgoing", "part_of_speech": "adjective", "example_sentence": "Tính cách cởi mở giúp dễ kết bạn hơn.", "example_meaning": "An outgoing personality makes it easier to make friends.", "level": "A2", "audio_url": None},
            {"word": "kiên nhẫn", "phonetic": None, "meaning": "patient", "part_of_speech": "adjective", "example_sentence": "Học ngoại ngữ cần sự kiên nhẫn mỗi ngày.", "example_meaning": "Learning a foreign language requires daily patience.", "level": "A2", "audio_url": None},
            {"word": "tự tin", "phonetic": None, "meaning": "confident", "part_of_speech": "adjective", "example_sentence": "Bạn cứ tự tin nói tiếng Việt đi!", "example_meaning": "Just speak Vietnamese with confidence!", "level": "A2", "audio_url": None},
            {"word": "dễ thương", "phonetic": None, "meaning": "cute / lovely", "part_of_speech": "adjective", "example_sentence": "Chú mèo con nhìn dễ thương quá.", "example_meaning": "The kitten looks so cute.", "level": "A2", "audio_url": None},
        ],
    },
    {
        "name": "Cơ Thể & Sức Khỏe Cơ Bản",
        "description": "Các bộ phận cơ thể, triệu chứng thường gặp và giữ gìn sức khỏe.",
        "icon_url": "favorite",
        "sort_order": 150,
        "words": [
            {"word": "sức khỏe", "phonetic": None, "meaning": "health", "part_of_speech": "noun", "example_sentence": "Có sức khỏe là có tất cả.", "example_meaning": "Having health is having everything.", "level": "A2", "audio_url": None},
            {"word": "đầu", "phonetic": None, "meaning": "head", "part_of_speech": "noun", "example_sentence": "Hôm nay mình hơi đau đầu.", "example_meaning": "Today I have a slight headache.", "level": "A2", "audio_url": None},
            {"word": "mắt", "phonetic": None, "meaning": "eye", "part_of_speech": "noun", "example_sentence": "Nhìn màn hình lâu dễ bị mỏi mắt.", "example_meaning": "Looking at screens for long causes eye strain.", "level": "A2", "audio_url": None},
            {"word": "tai", "phonetic": None, "meaning": "ear", "part_of_speech": "noun", "example_sentence": "Đeo tai nghe nhỏ tiếng để bảo vệ tai.", "example_meaning": "Keep headphone volume low to protect your ears.", "level": "A2", "audio_url": None},
            {"word": "mũi", "phonetic": None, "meaning": "nose", "part_of_speech": "noun", "example_sentence": "Trời lạnh làm mình hay bị nghẹt mũi.", "example_meaning": "Cold weather often gives me a stuffy nose.", "level": "A2", "audio_url": None},
            {"word": "miệng", "phonetic": None, "meaning": "mouth", "part_of_speech": "noun", "example_sentence": "Đánh răng sạch sẽ giữ thơm miệng.", "example_meaning": "Brushing teeth keeps your mouth fresh.", "level": "A2", "audio_url": None},
            {"word": "răng", "phonetic": None, "meaning": "tooth / teeth", "part_of_speech": "noun", "example_sentence": "Nên đi khám răng sáu tháng một lần.", "example_meaning": "You should visit the dentist every six months.", "level": "A2", "audio_url": None},
            {"word": "bàn tay", "phonetic": None, "meaning": "hand", "part_of_speech": "noun", "example_sentence": "Rửa sạch bàn tay trước khi ăn cơm.", "example_meaning": "Wash your hands cleanly before eating.", "level": "A2", "audio_url": None},
            {"word": "bàn chân", "phonetic": None, "meaning": "foot", "part_of_speech": "noun", "example_sentence": "Đi bộ cả ngày làm mỏi bàn chân.", "example_meaning": "Walking all day makes my feet tired.", "level": "A2", "audio_url": None},
            {"word": "bụng", "phonetic": None, "meaning": "stomach / belly", "part_of_speech": "noun", "example_sentence": "Ăn đồ lạ dễ bị đau bụng.", "example_meaning": "Eating unfamiliar food can easily cause a stomachache.", "level": "A2", "audio_url": None},
            {"word": "lưng", "phonetic": None, "meaning": "back", "part_of_speech": "noun", "example_sentence": "Ngồi làm việc lâu hay bị đau lưng.", "example_meaning": "Sitting at work for long often causes back pain.", "level": "A2", "audio_url": None},
            {"word": "bác sĩ", "phonetic": None, "meaning": "doctor", "part_of_speech": "noun", "example_sentence": "Nếu sốt cao bạn nên đi gặp bác sĩ.", "example_meaning": "If you have a high fever, you should see a doctor.", "level": "A2", "audio_url": None},
            {"word": "bệnh viện", "phonetic": None, "meaning": "hospital", "part_of_speech": "noun", "example_sentence": "Bệnh viện nằm ngay đầu đường lớn.", "example_meaning": "The hospital is right at the start of the main street.", "level": "A2", "audio_url": None},
            {"word": "hiệu thuốc", "phonetic": None, "meaning": "pharmacy", "part_of_speech": "noun", "example_sentence": "Mình ghé hiệu thuốc mua hộp khẩu trang.", "example_meaning": "I stopped by the pharmacy to buy a box of masks.", "level": "A2", "audio_url": None},
            {"word": "uống thuốc", "phonetic": None, "meaning": "to take medicine", "part_of_speech": "verb", "example_sentence": "Nhớ uống thuốc sau khi ăn no nhé.", "example_meaning": "Remember to take your medicine after eating.", "level": "A2", "audio_url": None},
            {"word": "cảm cúm", "phonetic": None, "meaning": "cold / flu", "part_of_speech": "noun", "example_sentence": "Giao mùa rất dễ bị cảm cúm.", "example_meaning": "Changing seasons make it easy to catch a cold.", "level": "A2", "audio_url": None},
            {"word": "sốt", "phonetic": None, "meaning": "fever", "part_of_speech": "noun", "example_sentence": "Em bé bị sốt nhẹ từ tối qua.", "example_meaning": "The baby has had a mild fever since last night.", "level": "A2", "audio_url": None},
            {"word": "ho", "phonetic": None, "meaning": "cough / to cough", "part_of_speech": "verb", "example_sentence": "Uống nước ấm mật ong giúp giảm ho.", "example_meaning": "Drinking warm honey water helps soothe a cough.", "level": "A2", "audio_url": None},
            {"word": "tập thể dục", "phonetic": None, "meaning": "to exercise / work out", "part_of_speech": "verb", "example_sentence": "Mỗi ngày tập thể dục ba mươi phút rất tốt.", "example_meaning": "Exercising thirty minutes every day is very good.", "level": "A2", "audio_url": None},
            {"word": "nghỉ ngơi", "phonetic": None, "meaning": "to rest / take a break", "part_of_speech": "verb", "example_sentence": "Bạn làm việc nhiều rồi, nghỉ ngơi một chút đi.", "example_meaning": "You've worked a lot, take a short rest.", "level": "A2", "audio_url": None},
        ],
    },
    {
        "name": "Trường Học & Lớp Học",
        "description": "Học tập, thầy cô, sách vở và hoạt động trên lớp.",
        "icon_url": "school",
        "sort_order": 160,
        "words": [
            {"word": "trường học", "phonetic": None, "meaning": "school", "part_of_speech": "noun", "example_sentence": "Trường học của mình có sân bóng rất rộng.", "example_meaning": "My school has a very large soccer field.", "level": "B1", "audio_url": None},
            {"word": "đại học", "phonetic": None, "meaning": "university", "part_of_speech": "noun", "example_sentence": "Mình đang là sinh viên đại học năm hai.", "example_meaning": "I am a second-year university student.", "level": "B1", "audio_url": None},
            {"word": "lớp học", "phonetic": None, "meaning": "classroom / class", "part_of_speech": "noun", "example_sentence": "Lớp học hôm nay rất sôi nổi.", "example_meaning": "Today's class is very lively.", "level": "B1", "audio_url": None},
            {"word": "thầy giáo", "phonetic": None, "meaning": "male teacher", "part_of_speech": "noun", "example_sentence": "Thầy giáo giảng bài rất dễ hiểu.", "example_meaning": "The teacher explains the lesson very clearly.", "level": "B1", "audio_url": None},
            {"word": "cô giáo", "phonetic": None, "meaning": "female teacher", "part_of_speech": "noun", "example_sentence": "Cô giáo luôn động viên học sinh phát biểu.", "example_meaning": "The teacher always encourages students to speak up.", "level": "B1", "audio_url": None},
            {"word": "sinh viên", "phonetic": None, "meaning": "college student", "part_of_speech": "noun", "example_sentence": "Sinh viên thường đi làm thêm để tích lũy kinh nghiệm.", "example_meaning": "Students often work part-time to gain experience.", "level": "B1", "audio_url": None},
            {"word": "quyển sách", "phonetic": None, "meaning": "book", "part_of_speech": "noun", "example_sentence": "Quyển sách này viết rất cuốn hút.", "example_meaning": "This book is written in a very engaging way.", "level": "B1", "audio_url": None},
            {"word": "quyển vở", "phonetic": None, "meaning": "notebook", "part_of_speech": "noun", "example_sentence": "Mình ghi chép từ mới vào quyển vở nhỏ.", "example_meaning": "I write down new words in a small notebook.", "level": "B1", "audio_url": None},
            {"word": "cây bút", "phonetic": None, "meaning": "pen", "part_of_speech": "noun", "example_sentence": "Cho mình mượn cây bút xanh một lát nhé.", "example_meaning": "Lend me the blue pen for a moment.", "level": "B1", "audio_url": None},
            {"word": "thư viện", "phonetic": None, "meaning": "library", "part_of_speech": "noun", "example_sentence": "Chiều nay mình lên thư viện ôn bài.", "example_meaning": "This afternoon I'm going to the library to review lessons.", "level": "B1", "audio_url": None},
            {"word": "bài tập", "phonetic": None, "meaning": "homework / exercise", "part_of_speech": "noun", "example_sentence": "Tối qua mình làm xong hết bài tập rồi.", "example_meaning": "Last night I finished all my homework.", "level": "B1", "audio_url": None},
            {"word": "bài kiểm tra", "phonetic": None, "meaning": "test / quiz", "part_of_speech": "noun", "example_sentence": "Bài kiểm tra hôm nay không quá khó.", "example_meaning": "Today's test wasn't too hard.", "level": "B1", "audio_url": None},
            {"word": "điểm số", "phonetic": None, "meaning": "score / grade", "part_of_speech": "noun", "example_sentence": "Điểm số quan trọng nhưng hiểu bài còn quan trọng hơn.", "example_meaning": "Grades matter, but understanding the lesson matters more.", "level": "B1", "audio_url": None},
            {"word": "từ vựng", "phonetic": None, "meaning": "vocabulary", "part_of_speech": "noun", "example_sentence": "Mỗi ngày học mười từ vựng mới là rất tốt.", "example_meaning": "Learning ten new vocabulary words each day is great.", "level": "B1", "audio_url": None},
            {"word": "ngữ pháp", "phonetic": None, "meaning": "grammar", "part_of_speech": "noun", "example_sentence": "Ngữ pháp tiếng Việt không chia động từ theo thì.", "example_meaning": "Vietnamese grammar does not conjugate verbs by tense.", "level": "B1", "audio_url": None},
            {"word": "phát âm", "phonetic": None, "meaning": "pronunciation", "part_of_speech": "noun", "example_sentence": "Bạn phát âm chuẩn lắm rồi!", "example_meaning": "Your pronunciation is already very accurate!", "level": "B1", "audio_url": None},
            {"word": "ghi chép", "phonetic": None, "meaning": "to take notes", "part_of_speech": "verb", "example_sentence": "Vừa nghe giảng vừa ghi chép giúp nhớ lâu hơn.", "example_meaning": "Taking notes while listening helps you remember longer.", "level": "B1", "audio_url": None},
            {"word": "ôn tập", "phonetic": None, "meaning": "to review / revise", "part_of_speech": "verb", "example_sentence": "Cuối tuần mình dành thời gian ôn tập bài cũ.", "example_meaning": "On weekends I spend time reviewing past lessons.", "level": "B1", "audio_url": None},
            {"word": "tốt nghiệp", "phonetic": None, "meaning": "to graduate", "part_of_speech": "verb", "example_sentence": "Sang năm anh ấy sẽ tốt nghiệp đại học.", "example_meaning": "Next year he will graduate from university.", "level": "B1", "audio_url": None},
            {"word": "học bổng", "phonetic": None, "meaning": "scholarship", "part_of_speech": "noun", "example_sentence": "Cô ấy nỗ lực học để giành học bổng.", "example_meaning": "She studies hard to win a scholarship.", "level": "B1", "audio_url": None},
        ],
    },
    {
        "name": "Công Việc & Văn Phòng",
        "description": "Giao tiếp nơi làm việc, họp nhóm, tiến độ và lương thưởng.",
        "icon_url": "work",
        "sort_order": 170,
        "words": [
            {"word": "công việc", "phonetic": None, "meaning": "work / job", "part_of_speech": "noun", "example_sentence": "Dạo này công việc của bạn thế nào?", "example_meaning": "How has your work been lately?", "level": "B1", "audio_url": None},
            {"word": "công ty", "phonetic": None, "meaning": "company", "part_of_speech": "noun", "example_sentence": "Công ty mình có môi trường làm việc rất trẻ trung.", "example_meaning": "My company has a very youthful work environment.", "level": "B1", "audio_url": None},
            {"word": "văn phòng", "phonetic": None, "meaning": "office", "part_of_speech": "noun", "example_sentence": "Văn phòng nằm trên tầng mười.", "example_meaning": "The office is on the tenth floor.", "level": "B1", "audio_url": None},
            {"word": "đồng nghiệp", "phonetic": None, "meaning": "colleague / coworker", "part_of_speech": "noun", "example_sentence": "Trưa nay mình đi ăn cùng đồng nghiệp.", "example_meaning": "Today at noon I'm having lunch with colleagues.", "level": "B1", "audio_url": None},
            {"word": "sếp", "phonetic": None, "meaning": "boss", "part_of_speech": "noun", "example_sentence": "Sếp mình rất tâm lý và hỗ trợ nhân viên.", "example_meaning": "My boss is very understanding and supportive.", "level": "B1", "audio_url": None},
            {"word": "khách hàng", "phonetic": None, "meaning": "customer / client", "part_of_speech": "noun", "example_sentence": "Khách hàng rất hài lòng với sản phẩm mới.", "example_meaning": "The client is very satisfied with the new product.", "level": "B1", "audio_url": None},
            {"word": "cuộc họp", "phonetic": None, "meaning": "meeting", "part_of_speech": "noun", "example_sentence": "Chiều nay mình có cuộc họp lúc hai giờ.", "example_meaning": "This afternoon I have a meeting at two.", "level": "B1", "audio_url": None},
            {"word": "dự án", "phonetic": None, "meaning": "project", "part_of_speech": "noun", "example_sentence": "Cả nhóm đang tập trung hoàn thành dự án.", "example_meaning": "The whole team is focused on finishing the project.", "level": "B1", "audio_url": None},
            {"word": "hạn chót", "phonetic": None, "meaning": "deadline", "part_of_speech": "noun", "example_sentence": "Hạn chót nộp báo cáo là thứ Sáu tuần này.", "example_meaning": "The deadline to submit the report is this Friday.", "level": "B1", "audio_url": None},
            {"word": "báo cáo", "phonetic": None, "meaning": "report", "part_of_speech": "noun", "example_sentence": "Mình đã gửi báo cáo qua email cho quản lý.", "example_meaning": "I sent the report via email to the manager.", "level": "B1", "audio_url": None},
            {"word": "tiền lương", "phonetic": None, "meaning": "salary / pay", "part_of_speech": "noun", "example_sentence": "Ngày mùng năm hằng tháng là ngày nhận tiền lương.", "example_meaning": "The fifth of every month is payday.", "level": "B1", "audio_url": None},
            {"word": "tiền thưởng", "phonetic": None, "meaning": "bonus", "part_of_speech": "noun", "example_sentence": "Cuối năm nhân viên được nhận tiền thưởng.", "example_meaning": "At year-end, employees receive a bonus.", "level": "B1", "audio_url": None},
            {"word": "phỏng vấn", "phonetic": None, "meaning": "interview", "part_of_speech": "verb", "example_sentence": "Ngày mai mình đi phỏng vấn xin việc.", "example_meaning": "Tomorrow I am going for a job interview.", "level": "B1", "audio_url": None},
            {"word": "hồ sơ", "phonetic": None, "meaning": "resume / profile / file", "part_of_speech": "noun", "example_sentence": "Bạn nhớ chuẩn bị hồ sơ thật chỉn chu.", "example_meaning": "Remember to prepare your resume neatly.", "level": "B1", "audio_url": None},
            {"word": "kinh nghiệm", "phonetic": None, "meaning": "experience", "part_of_speech": "noun", "example_sentence": "Anh ấy có ba năm kinh nghiệm lập trình.", "example_meaning": "He has three years of programming experience.", "level": "B1", "audio_url": None},
            {"word": "kỹ năng", "phonetic": None, "meaning": "skill", "part_of_speech": "noun", "example_sentence": "Kỹ năng giao tiếp rất cần thiết trong công việc.", "example_meaning": "Communication skills are essential at work.", "level": "B1", "audio_url": None},
            {"word": "tăng ca", "phonetic": None, "meaning": "to work overtime", "part_of_speech": "verb", "example_sentence": "Tuần này nhiều việc nên thỉnh thoảng phải tăng ca.", "example_meaning": "There is a lot of work this week so we occasionally work overtime.", "level": "B1", "audio_url": None},
            {"word": "nghỉ phép", "phonetic": None, "meaning": "to take leave / day off", "part_of_speech": "verb", "example_sentence": "Tháng sau mình xin nghỉ phép ba ngày đi du lịch.", "example_meaning": "Next month I'm taking three days of leave to travel.", "level": "B1", "audio_url": None},
            {"word": "bận rộn", "phonetic": None, "meaning": "busy", "part_of_speech": "adjective", "example_sentence": "Thứ Hai đầu tuần lúc nào cũng bận rộn.", "example_meaning": "Monday mornings are always busy.", "level": "B1", "audio_url": None},
            {"word": "hoàn thành", "phonetic": None, "meaning": "to complete / finish", "part_of_speech": "verb", "example_sentence": "Chúc mừng nhóm đã hoàn thành mục tiêu!", "example_meaning": "Congratulations to the team for completing the goal!", "level": "B1", "audio_url": None},
        ],
    },
    {
        "name": "Du Lịch & Khách Sạn",
        "description": "Đặt phòng, ra sân bay, khám phá cảnh đẹp và chụp ảnh kỷ niệm.",
        "icon_url": "flight",
        "sort_order": 180,
        "words": [
            {"word": "du lịch", "phonetic": None, "meaning": "to travel / tourism", "part_of_speech": "verb", "example_sentence": "Mùa hè mình thích đi du lịch biển.", "example_meaning": "In summer I like traveling to the beach.", "level": "B1", "audio_url": None},
            {"word": "chuyến đi", "phonetic": None, "meaning": "trip / journey", "part_of_speech": "noun", "example_sentence": "Chuyến đi Đà Lạt lần này thật đáng nhớ.", "example_meaning": "This trip to Da Lat was truly memorable.", "level": "B1", "audio_url": None},
            {"word": "sân bay", "phonetic": None, "meaning": "airport", "part_of_speech": "noun", "example_sentence": "Nên ra sân bay trước hai tiếng để làm thủ tục.", "example_meaning": "You should arrive at the airport two hours early for check-in.", "level": "B1", "audio_url": None},
            {"word": "máy bay", "phonetic": None, "meaning": "airplane", "part_of_speech": "noun", "example_sentence": "Ngồi cạnh cửa sổ máy bay ngắm mây rất đẹp.", "example_meaning": "Sitting by the airplane window to watch clouds is lovely.", "level": "B1", "audio_url": None},
            {"word": "vé máy bay", "phonetic": None, "meaning": "flight ticket", "part_of_speech": "noun", "example_sentence": "Đặt vé máy bay sớm sẽ tiết kiệm được nhiều tiền.", "example_meaning": "Booking flight tickets early saves a lot of money.", "level": "B1", "audio_url": None},
            {"word": "hộ chiếu", "phonetic": None, "meaning": "passport", "part_of_speech": "noun", "example_sentence": "Đi nước ngoài nhất định phải mang theo hộ chiếu.", "example_meaning": "When traveling abroad, you must bring your passport.", "level": "B1", "audio_url": None},
            {"word": "hành lý", "phonetic": None, "meaning": "luggage / baggage", "part_of_speech": "noun", "example_sentence": "Hành lý xách tay không được quá bảy cân.", "example_meaning": "Carry-on luggage must not exceed seven kilograms.", "level": "B1", "audio_url": None},
            {"word": "va li", "phonetic": None, "meaning": "suitcase", "part_of_speech": "noun", "example_sentence": "Tối nay mình bắt đầu xếp đồ vào va li.", "example_meaning": "Tonight I'll start packing clothes into the suitcase.", "level": "B1", "audio_url": None},
            {"word": "khách sạn", "phonetic": None, "meaning": "hotel", "part_of_speech": "noun", "example_sentence": "Khách sạn này ngay gần bãi biển.", "example_meaning": "This hotel is right near the beach.", "level": "B1", "audio_url": None},
            {"word": "đặt phòng", "phonetic": None, "meaning": "to book a room", "part_of_speech": "verb", "example_sentence": "Mình đã đặt phòng hai đêm ở Hội An.", "example_meaning": "I booked a room for two nights in Hoi An.", "level": "B1", "audio_url": None},
            {"word": "nhận phòng", "phonetic": None, "meaning": "check-in", "part_of_speech": "verb", "example_sentence": "Giờ nhận phòng tiêu chuẩn là hai giờ chiều.", "example_meaning": "Standard check-in time is two in the afternoon.", "level": "B1", "audio_url": None},
            {"word": "trả phòng", "phonetic": None, "meaning": "check-out", "part_of_speech": "verb", "example_sentence": "Sáng mai mười hai giờ chúng mình trả phòng.", "example_meaning": "Tomorrow at noon we check out.", "level": "B1", "audio_url": None},
            {"word": "bãi biển", "phonetic": None, "meaning": "beach", "part_of_speech": "noun", "example_sentence": "Bãi biển Nha Trang nước xanh trong vắt.", "example_meaning": "Nha Trang beach has crystal-clear blue water.", "level": "B1", "audio_url": None},
            {"word": "ngọn núi", "phonetic": None, "meaning": "mountain", "part_of_speech": "noun", "example_sentence": "Đứng trên đỉnh núi nhìn xuống phong cảnh hùng vĩ.", "example_meaning": "Standing on the mountaintop, the scenery looks majestic.", "level": "B1", "audio_url": None},
            {"word": "phố cổ", "phonetic": None, "meaning": "old town / ancient quarter", "part_of_speech": "noun", "example_sentence": "Buổi tối đi dạo phố cổ đèn lồng rất lung linh.", "example_meaning": "Walking in the lantern-lit old town at night is magical.", "level": "B1", "audio_url": None},
            {"word": "đặc sản", "phonetic": None, "meaning": "local specialty", "part_of_speech": "noun", "example_sentence": "Đi tới vùng nào cũng nên thử đặc sản địa phương.", "example_meaning": "Wherever you visit, you should try the local specialties.", "level": "B1", "audio_url": None},
            {"word": "quà lưu niệm", "phonetic": None, "meaning": "souvenir", "part_of_speech": "noun", "example_sentence": "Mình mua ít quà lưu niệm về tặng bạn bè.", "example_meaning": "I bought some souvenirs to give to friends.", "level": "B1", "audio_url": None},
            {"word": "chụp ảnh", "phonetic": None, "meaning": "to take photos", "part_of_speech": "verb", "example_sentence": "Nhờ bạn chụp ảnh giúp mình một tấm nhé!", "example_meaning": "Could you take a photo for me?", "level": "B1", "audio_url": None},
            {"word": "cảnh đẹp", "phonetic": None, "meaning": "scenic view / beautiful scenery", "part_of_speech": "noun", "example_sentence": "Việt Nam có rất nhiều cảnh đẹp thiên nhiên.", "example_meaning": "Vietnam has many beautiful natural landscapes.", "level": "B1", "audio_url": None},
            {"word": "khám phá", "phonetic": None, "meaning": "to explore / discover", "part_of_speech": "verb", "example_sentence": "Tự đi xe máy khám phá vùng đất mới rất thú vị.", "example_meaning": "Riding a motorbike to explore new places is exciting.", "level": "B1", "audio_url": None},
        ],
    },
    {
        "name": "Điện Thoại & Mạng Xã Hội",
        "description": "Sử dụng điện thoại, kết nối wifi, nhắn tin và đăng bài.",
        "icon_url": "smartphone",
        "sort_order": 190,
        "words": [
            {"word": "điện thoại", "phonetic": None, "meaning": "phone / smartphone", "part_of_speech": "noun", "example_sentence": "Điện thoại của mình sắp hết pin rồi.", "example_meaning": "My phone battery is almost dead.", "level": "B1", "audio_url": None},
            {"word": "máy tính", "phonetic": None, "meaning": "computer", "part_of_speech": "noun", "example_sentence": "Mình dùng máy tính để học và làm việc.", "example_meaning": "I use a computer to study and work.", "level": "B1", "audio_url": None},
            {"word": "sạc pin", "phonetic": None, "meaning": "to charge the battery", "part_of_speech": "verb", "example_sentence": "Cho mình mượn ổ cắm để sạc pin một chút.", "example_meaning": "Let me use the outlet to charge my phone for a bit.", "level": "B1", "audio_url": None},
            {"word": "tai nghe", "phonetic": None, "meaning": "headphones / earphones", "part_of_speech": "noun", "example_sentence": "Đeo tai nghe nghe nhạc giúp tập trung hơn.", "example_meaning": "Wearing earphones to listen to music helps me focus.", "level": "B1", "audio_url": None},
            {"word": "màn hình", "phonetic": None, "meaning": "screen", "part_of_speech": "noun", "example_sentence": "Màn hình điện thoại bị nứt nhẹ.", "example_meaning": "The phone screen has a slight crack.", "level": "B1", "audio_url": None},
            {"word": "mật khẩu", "phonetic": None, "meaning": "password", "part_of_speech": "noun", "example_sentence": "Anh ơi cho em xin mật khẩu wifi của quán.", "example_meaning": "Excuse me, what is the cafe's Wi-Fi password?", "level": "B1", "audio_url": None},
            {"word": "mạng", "phonetic": None, "meaning": "internet / network", "part_of_speech": "noun", "example_sentence": "Hôm nay mạng hơi chậm.", "example_meaning": "The internet is a bit slow today.", "level": "B1", "audio_url": None},
            {"word": "tin nhắn", "phonetic": None, "meaning": "text message", "part_of_speech": "noun", "example_sentence": "Mình vừa nhận được tin nhắn của bạn.", "example_meaning": "I just received your message.", "level": "B1", "audio_url": None},
            {"word": "gọi điện", "phonetic": None, "meaning": "to make a phone call", "part_of_speech": "verb", "example_sentence": "Tối về tới nhà nhớ gọi điện cho mẹ nhé.", "example_meaning": "Remember to call mom when you get home tonight.", "level": "B1", "audio_url": None},
            {"word": "gọi video", "phonetic": None, "meaning": "video call", "part_of_speech": "verb", "example_sentence": "Cuối tuần mình hay gọi video về cho gia đình.", "example_meaning": "On weekends I often video call my family.", "level": "B1", "audio_url": None},
            {"word": "ứng dụng", "phonetic": None, "meaning": "mobile app", "part_of_speech": "noun", "example_sentence": "Ứng dụng học tiếng Việt này giao diện rất đẹp.", "example_meaning": "This Vietnamese learning app has a very nice interface.", "level": "B1", "audio_url": None},
            {"word": "tài khoản", "phonetic": None, "meaning": "account", "part_of_speech": "noun", "example_sentence": "Đăng nhập tài khoản để lưu tiến độ học.", "example_meaning": "Log in to your account to save study progress.", "level": "B1", "audio_url": None},
            {"word": "đăng nhập", "phonetic": None, "meaning": "to log in", "part_of_speech": "verb", "example_sentence": "Bạn có thể đăng nhập nhanh bằng Google.", "example_meaning": "You can log in quickly with Google.", "level": "B1", "audio_url": None},
            {"word": "tìm kiếm", "phonetic": None, "meaning": "to search", "part_of_speech": "verb", "example_sentence": "Không biết quán nào ngon thì lên mạng tìm kiếm.", "example_meaning": "If you don't know which place is good, search online.", "level": "B1", "audio_url": None},
            {"word": "chia sẻ", "phonetic": None, "meaning": "to share", "part_of_speech": "verb", "example_sentence": "Cảm ơn bạn đã chia sẻ kinh nghiệm hay.", "example_meaning": "Thank you for sharing great experiences.", "level": "B1", "audio_url": None},
            {"word": "bình luận", "phonetic": None, "meaning": "comment / to comment", "part_of_speech": "noun", "example_sentence": "Bài viết nhận được rất nhiều bình luận tích cực.", "example_meaning": "The post received many positive comments.", "level": "B1", "audio_url": None},
            {"word": "đăng bài", "phonetic": None, "meaning": "to post (online)", "part_of_speech": "verb", "example_sentence": "Đi chơi về cô ấy đăng bài khoe ảnh đẹp.", "example_meaning": "After the trip, she posted nice photos online.", "level": "B1", "audio_url": None},
            {"word": "theo dõi", "phonetic": None, "meaning": "to follow / keep track", "part_of_speech": "verb", "example_sentence": "Mình theo dõi kênh này để luyện nghe tiếng Việt.", "example_meaning": "I follow this channel to practice Vietnamese listening.", "level": "B1", "audio_url": None},
            {"word": "kết nối", "phonetic": None, "meaning": "to connect", "part_of_speech": "verb", "example_sentence": "Mạng xã hội giúp kết nối bạn bè ở xa.", "example_meaning": "Social media helps connect friends who live far away.", "level": "B1", "audio_url": None},
            {"word": "tiện lợi", "phonetic": None, "meaning": "convenient", "part_of_speech": "adjective", "example_sentence": "Thanh toán không tiền mặt bây giờ rất tiện lợi.", "example_meaning": "Cashless payment is very convenient nowadays.", "level": "B1", "audio_url": None},
        ],
    },
    {
        "name": "Giao Tiếp Tự Nhiên Hằng Ngày",
        "description": "Các từ đệm, câu cửa miệng và cách nói tự nhiên như người bản xứ.",
        "icon_url": "chat",
        "sort_order": 200,
        "words": [
            {"word": "thật ra", "phonetic": None, "meaning": "actually / in fact", "part_of_speech": "adverb", "example_sentence": "Thật ra tiếng Việt không khó như bạn nghĩ đâu.", "example_meaning": "Actually, Vietnamese isn't as hard as you think.", "level": "B2", "audio_url": None},
            {"word": "hình như", "phonetic": None, "meaning": "it seems / apparently", "part_of_speech": "adverb", "example_sentence": "Hình như ngoài trời sắp mưa rồi.", "example_meaning": "It seems like it's about to rain outside.", "level": "B2", "audio_url": None},
            {"word": "chắc chắn", "phonetic": None, "meaning": "definitely / for sure", "part_of_speech": "adverb", "example_sentence": "Lần tới mình chắc chắn sẽ ghé thăm bạn.", "example_meaning": "Next time I will definitely visit you.", "level": "B2", "audio_url": None},
            {"word": "tự nhiên", "phonetic": None, "meaning": "naturally / suddenly / feel free", "part_of_speech": "adjective", "example_sentence": "Bạn nói chuyện nghe rất tự nhiên.", "example_meaning": "You sound very natural when speaking.", "level": "B2", "audio_url": None},
            {"word": "thoải mái đi", "phonetic": None, "meaning": "take it easy / don't hesitate", "part_of_speech": "phrase", "example_sentence": "Cứ thoải mái đi, không phải khách sáo đâu.", "example_meaning": "Take it easy, no need to be overly polite.", "level": "B2", "audio_url": None},
            {"word": "tùy bạn", "phonetic": None, "meaning": "up to you", "part_of_speech": "phrase", "example_sentence": "Ăn phở hay bún chả đều được, tùy bạn chọn nhé.", "example_meaning": "Pho or bun cha are both fine, it's up to you.", "level": "B2", "audio_url": None},
            {"word": "hợp lý", "phonetic": None, "meaning": "reasonable / makes sense", "part_of_speech": "adjective", "example_sentence": "Kế hoạch này nghe rất hợp lý đấy.", "example_meaning": "This plan sounds very reasonable.", "level": "B2", "audio_url": None},
            {"word": "tuyệt vời", "phonetic": None, "meaning": "wonderful / awesome", "part_of_speech": "adjective", "example_sentence": "Ý tưởng của bạn thật tuyệt vời!", "example_meaning": "Your idea is wonderful!", "level": "B2", "audio_url": None},
            {"word": "thú vị", "phonetic": None, "meaning": "interesting / fun", "part_of_speech": "adjective", "example_sentence": "Câu chuyện bạn kể rất thú vị.", "example_meaning": "The story you told is very interesting.", "level": "B2", "audio_url": None},
            {"word": "quen thuộc", "phonetic": None, "meaning": "familiar", "part_of_speech": "adjective", "example_sentence": "Giai điệu bài hát này nghe rất quen thuộc.", "example_meaning": "The melody of this song sounds very familiar.", "level": "B2", "audio_url": None},
            {"word": "dễ hiểu", "phonetic": None, "meaning": "easy to understand", "part_of_speech": "adjective", "example_sentence": "Ví dụ minh họa ngắn gọn nên rất dễ hiểu.", "example_meaning": "The examples are concise so they are easy to understand.", "level": "B2", "audio_url": None},
            {"word": "tranh thủ", "phonetic": None, "meaning": "to make the most of time / take the opportunity", "part_of_speech": "verb", "example_sentence": "Tranh thủ trời chưa mưa mình chạy về nhà nhé.", "example_meaning": "Let's hurry home while it hasn't rained yet.", "level": "B2", "audio_url": None},
            {"word": "rủ", "phonetic": None, "meaning": "to invite / ask someone to join", "part_of_speech": "verb", "example_sentence": "Tối nay rủ thêm mấy người bạn đi ăn cho vui.", "example_meaning": "Invite a few more friends to eat tonight for fun.", "level": "B2", "audio_url": None},
            {"word": "khen", "phonetic": None, "meaning": "to praise / compliment", "part_of_speech": "verb", "example_sentence": "Ai cũng khen món ăn hôm nay nấu khéo.", "example_meaning": "Everyone praised how well today's food was cooked.", "level": "B2", "audio_url": None},
            {"word": "góp ý", "phonetic": None, "meaning": "to give feedback / suggest", "part_of_speech": "verb", "example_sentence": "Có gì chưa ổn bạn cứ thẳng thắn góp ý nhé.", "example_meaning": "If anything isn't right, feel free to give honest feedback.", "level": "B2", "audio_url": None},
            {"word": "đồng ý", "phonetic": None, "meaning": "to agree", "part_of_speech": "verb", "example_sentence": "Mình hoàn toàn đồng ý với ý kiến của bạn.", "example_meaning": "I completely agree with your opinion.", "level": "B2", "audio_url": None},
            {"word": "thông cảm", "phonetic": None, "meaning": "to sympathize / understand", "part_of_speech": "verb", "example_sentence": "Hôm nay đường tắc quá, mong bạn thông cảm.", "example_meaning": "Traffic was terrible today, hope you understand.", "level": "B2", "audio_url": None},
            {"word": "nhiệt tình", "phonetic": None, "meaning": "enthusiastic / helpful", "part_of_speech": "adjective", "example_sentence": "Anh ấy hướng dẫn rất nhiệt tình.", "example_meaning": "He guided us very enthusiastically.", "level": "B2", "audio_url": None},
            {"word": "chu đáo", "phonetic": None, "meaning": "thoughtful / attentive", "part_of_speech": "adjective", "example_sentence": "Bạn chuẩn bị mọi thứ thật chu đáo.", "example_meaning": "You prepared everything so thoughtfully.", "level": "B2", "audio_url": None},
            {"word": "hẹn gặp lại", "phonetic": None, "meaning": "see you again", "part_of_speech": "phrase", "example_sentence": "Chúc bạn thượng lộ bình an, hẹn gặp lại!", "example_meaning": "Have a safe trip, see you again!", "level": "B2", "audio_url": None},
        ],
    },
]


def _normalize_vi(text: str) -> str:
    """Chuẩn hóa chuỗi tiếng Việt về dạng Unicode NFC và không phân biệt hoa thường."""
    return unicodedata.normalize("NFC", text).strip().casefold()


def _chunks(items: List[dict], size: int) -> Iterable[List[dict]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _topic_id(topic: Dict[str, Any]) -> int:
    topic_name = unicodedata.normalize("NFC", topic["name"]).strip()
    rows = (
        supabase_admin.table("topics")
        .select("id")
        .eq("language_code", LANGUAGE_CODE)
        .eq("name", topic_name)
        .order("id")
        .limit(2)
        .execute()
        .data
        or []
    )
    if len(rows) > 1:
        raise RuntimeError(f"Có nhiều chủ đề trùng tên {topic_name!r}.")
    if rows:
        return int(rows[0]["id"])

    inserted = (
        supabase_admin.table("topics")
        .insert(
            {
                "language_code": LANGUAGE_CODE,
                "name": topic_name,
                "description": unicodedata.normalize("NFC", topic["description"]).strip(),
                "icon_url": topic["icon_url"],
                "sort_order": topic["sort_order"],
            }
        )
        .execute()
    )
    if not inserted.data:
        raise RuntimeError(f"Không tạo được chủ đề {topic_name!r}.")
    return int(inserted.data[0]["id"])


def _existing_words() -> Dict[str, int]:
    first_page = (
        supabase_admin.table("words")
        .select("id,word", count="exact")
        .eq("language_code", LANGUAGE_CODE)
        .order("id")
        .range(0, 499)
        .execute()
    )
    rows = list(first_page.data or [])
    total = int(first_page.count or 0)
    for start in range(500, total, 500):
        page = (
            supabase_admin.table("words")
            .select("id,word")
            .eq("language_code", LANGUAGE_CODE)
            .order("id")
            .range(start, min(start + 499, total - 1))
            .execute()
        )
        rows.extend(page.data or [])

    words: Dict[str, int] = {}
    for row in rows:
        normalized = _normalize_vi(str(row["word"]))
        if normalized in words:
            raise RuntimeError(f"Database có từ trùng lặp: {row['word']!r}.")
        words[normalized] = int(row["id"])
    return words


def main() -> None:
    expected_word_count = 400
    entries = [
        (topic, word)
        for topic in TOPICS
        for word in topic["words"]
    ]
    if len(entries) != expected_word_count:
        raise RuntimeError(
            f"Seed phải có đúng {expected_word_count} từ, hiện có {len(entries)}."
        )

    topic_ids = {topic["name"]: _topic_id(topic) for topic in TOPICS}
    existing_words = _existing_words()
    pending_words: Dict[str, dict] = {}
    for _, word in entries:
        normalized = _normalize_vi(word["word"])
        if normalized not in existing_words:
            pending_words.setdefault(
                normalized,
                {
                    "language_code": LANGUAGE_CODE,
                    "word": unicodedata.normalize("NFC", word["word"]).strip(),
                    "phonetic": word["phonetic"],
                    "meaning": word["meaning"],
                    "part_of_speech": word["part_of_speech"],
                    "example_sentence": unicodedata.normalize("NFC", word["example_sentence"]).strip(),
                    "example_meaning": word["example_meaning"],
                    "level": word["level"],
                    "audio_url": word["audio_url"],
                },
            )

    inserted_count = 0
    for batch in _chunks(list(pending_words.values()), WORDS_PER_BATCH):
        created = supabase_admin.table("words").insert(batch).execute()
        if len(created.data or []) != len(batch):
            raise RuntimeError("Không ghi được đầy đủ từ vựng trong lô hiện tại.")
        for row in created.data:
            existing_words[_normalize_vi(str(row["word"]))] = int(row["id"])
        inserted_count += len(created.data)

    links = [
        {
            "word_id": existing_words[_normalize_vi(word["word"])],
            "topic_id": topic_ids[topic["name"]],
        }
        for topic, word in entries
    ]
    for batch in _chunks(links, WORDS_PER_BATCH):
        supabase_admin.table("word_topics").upsert(
            batch,
            on_conflict="word_id,topic_id",
            ignore_duplicates=True,
        ).execute()

    print(
        f"Seed hoàn tất: {len(entries)} từ trong {len(TOPICS)} chủ đề; "
        f"đã thêm {inserted_count} từ mới và xử lý {len(links)} liên kết chủ đề."
    )


if __name__ == "__main__":
    main()