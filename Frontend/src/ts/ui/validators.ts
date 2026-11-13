/**
 * Slanguage Form Field Validators
 * Kiểm tra tính hợp lệ và trả về thông báo lỗi thân thiện.
 */

export interface ValidationResult {
  isValid: boolean;
  message: string;
}

/**
 * Tên đăng nhập: 3-30 ký tự, chỉ gồm chữ thường, số và gạch dưới [a-z0-9_]
 */
export function validateUsername(username: string): ValidationResult {
  const trimmed = username.trim();
  if (!trimmed) {
    return { isValid: false, message: "Tên đăng nhập không được để trống." };
  }
  if (trimmed.length < 3 || trimmed.length > 30) {
    return { isValid: false, message: "Tên đăng nhập phải từ 3 đến 30 ký tự." };
  }
  const pattern = /^[a-z0-9_]+$/;
  if (!pattern.test(trimmed)) {
    return { isValid: false, message: "Chỉ cho phép dùng chữ thường (không dấu), số và dấu gạch dưới (_)." };
  }
  return { isValid: true, message: "" };
}

/**
 * Họ và tên: 1-50 ký tự
 */
export function validateDisplayName(name: string): ValidationResult {
  const trimmed = name.trim();
  if (!trimmed) {
    return { isValid: false, message: "Họ và tên không được để trống." };
  }
  if (trimmed.length > 50) {
    return { isValid: false, message: "Họ và tên không vượt quá 50 ký tự." };
  }
  return { isValid: true, message: "" };
}

/**
 * Năm sinh: hợp lệ trong khoảng 1900 đến năm hiện tại
 */
export function validateBirthYear(yearStr: string): ValidationResult {
  if (!yearStr.trim()) {
    return { isValid: true, message: "" }; // Tùy chọn
  }
  const year = Number(yearStr);
  const currentYear = new Date().getFullYear();
  if (isNaN(year) || !Number.isInteger(year) || year < 1900 || year > currentYear) {
    return { isValid: false, message: `Năm sinh phải từ 1900 đến ${currentYear}.` };
  }
  return { isValid: true, message: "" };
}

/**
 * Mã quốc gia: 2 ký tự chữ cái (ISO 3166-1 alpha-2)
 */
export function validateCountryCode(code: string): ValidationResult {
  const trimmed = code.trim();
  if (!trimmed) {
    return { isValid: true, message: "" }; // Tùy chọn
  }
  const pattern = /^[A-Za-z]{2}$/;
  if (!pattern.test(trimmed)) {
    return { isValid: false, message: "Mã quốc gia gồm 2 chữ cái (VD: VN, JP, US)." };
  }
  return { isValid: true, message: "" };
}

/**
 * Trình độ CEFR: Mục tiêu không được thấp hơn trình độ hiện tại
 */
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function validateCefrProgression(currentLevel: string, targetLevel: string): ValidationResult {
  if (!currentLevel || !targetLevel) return { isValid: true, message: "" };
  const currentIdx = CEFR_LEVELS.indexOf(currentLevel);
  const targetIdx = CEFR_LEVELS.indexOf(targetLevel);
  if (currentIdx !== -1 && targetIdx !== -1 && targetIdx < currentIdx) {
    return { isValid: false, message: "Trình độ mục tiêu không được thấp hơn trình độ hiện tại." };
  }
  return { isValid: true, message: "" };
}

/**
 * Ngôn ngữ: Ngôn ngữ mẹ đẻ và ngôn ngữ đang học phải khác nhau
 */
export function validateLanguages(nativeLang: string, targetLang: string): ValidationResult {
  if (nativeLang && targetLang && nativeLang === targetLang) {
    return { isValid: false, message: "Ngôn ngữ mẹ đẻ và ngôn ngữ đang học phải khác nhau." };
  }
  return { isValid: true, message: "" };
}

/**
 * Đánh giá độ mạnh mật khẩu (Score: 0 - 4)
 */
export interface PasswordStrength {
  score: number; // 0: rất yếu, 1: yếu, 2: trung bình, 3: mạnh, 4: rất mạnh
  label: string;
  color: string;
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: "Trống", color: "var(--line, #e2dccb)" };
  }
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;

  // Giới hạn 1 - 4
  const normalized = Math.min(4, Math.max(1, score - (password.length < 6 ? 2 : 0)));

  switch (normalized) {
    case 1:
      return { score: 1, label: "Yếu", color: "var(--danger, #d64545)" };
    case 2:
      return { score: 2, label: "Trung bình", color: "var(--streak, #f0803c)" };
    case 3:
      return { score: 3, label: "Khá mạnh", color: "var(--teal, #0f7c86)" };
    case 4:
    default:
      return { score: 4, label: "Rất an toàn", color: "var(--success, #2e9e6b)" };
  }
}

