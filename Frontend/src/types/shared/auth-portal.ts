import {
  saveAuthTokens,
  saveLearnerIdentity,
  slanguageApi,
} from "./api-client";

interface LoginResult {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    display_name: string | null;
  };
  needs_onboarding: boolean;
}

interface RegisterDraft {
  display_name: string;
  email: string;
  password: string;
  accept_terms: boolean;
}

function showError(id: string, message: string): void {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.style.display = "block";
  element.previousElementSibling?.querySelector("input")?.classList.add("error");
}

function clearError(id: string): void {
  const element = document.getElementById(id);
  if (!element) return;
  element.style.display = "none";
  element.previousElementSibling?.querySelector("input")?.classList.remove("error");
}

function showToast(message: string): void {
  const toast = document.getElementById("loginToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 4000);
}

function setButtonBusy(button: HTMLButtonElement, busy: boolean, text: string): void {
  button.disabled = busy;
  button.innerHTML = busy
    ? `<i class="fa-solid fa-spinner fa-spin"></i> ${text}`
    : `<span>${text}</span><i class="fa-solid fa-arrow-right"></i>`;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function initLogin(): void {
  const form = document.getElementById("loginForm") as HTMLFormElement | null;
  const email = document.getElementById("emailOrUser") as HTMLInputElement | null;
  const password = document.getElementById("password") as HTMLInputElement | null;
  const remember = document.getElementById("rememberMe") as HTMLInputElement | null;
  const submit = document.getElementById("btnSubmitLogin") as HTMLButtonElement | null;
  const toggle = document.getElementById("togglePassword");

  const rememberedEmail = localStorage.getItem("slanguage_remembered_email");
  if (rememberedEmail && email && remember) {
    email.value = rememberedEmail;
    remember.checked = true;
  }

  email?.addEventListener("input", () => clearError("emailError"));
  password?.addEventListener("input", () => clearError("passwordError"));
  toggle?.addEventListener("click", () => {
    if (!password) return;
    password.type = password.type === "password" ? "text" : "password";
    const icon = toggle.querySelector("i");
    if (icon) icon.className = password.type === "password" ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const emailValue = email?.value.trim().toLowerCase() ?? "";
    const passwordValue = password?.value ?? "";
    let valid = true;

    if (!isEmail(emailValue)) {
      showError("emailError", "Vui lòng nhập địa chỉ email hợp lệ.");
      valid = false;
    }
    if (!passwordValue) {
      showError("passwordError", "Vui lòng nhập mật khẩu.");
      valid = false;
    }
    if (!valid || !submit) return;

    setButtonBusy(submit, true, "Đang đăng nhập...");
    try {
      const response = await slanguageApi<LoginResult>("/api/v1/auth/login", {
        method: "POST",
        body: { email: emailValue, password: passwordValue },
        anonymous: true,
      });
      saveAuthTokens(response.data);
      saveLearnerIdentity(response.data.user);
      if (remember?.checked) {
        localStorage.setItem("slanguage_remembered_email", emailValue);
      } else {
        localStorage.removeItem("slanguage_remembered_email");
      }
      sessionStorage.removeItem("slanguage_reg_pass");
      window.location.assign("../home/index.html");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể đăng nhập. Vui lòng thử lại.";
      showToast(message);
      setButtonBusy(submit, false, "Đăng nhập");
    }
  });
}

function initRegister(): void {
  const form = document.getElementById("registerForm") as HTMLFormElement | null;
  const name = document.getElementById("regFullName") as HTMLInputElement | null;
  const email = document.getElementById("regEmail") as HTMLInputElement | null;
  const password = document.getElementById("regPassword") as HTMLInputElement | null;
  const confirmPassword = document.getElementById("regConfirmPassword") as HTMLInputElement | null;
  const terms = document.getElementById("regTerms") as HTMLInputElement | null;
  const submit = document.getElementById("btnSubmitRegister") as HTMLButtonElement | null;

  name?.addEventListener("input", () => clearError("nameError"));
  email?.addEventListener("input", () => clearError("regEmailError"));
  password?.addEventListener("input", () => clearError("passError"));
  confirmPassword?.addEventListener("input", () => clearError("confirmPassError"));

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const displayName = name?.value.trim() ?? "";
    const emailValue = email?.value.trim().toLowerCase() ?? "";
    const passwordValue = password?.value ?? "";
    const confirmation = confirmPassword?.value ?? "";
    let valid = true;

    if (!displayName) {
      showError("nameError", "Vui lòng nhập họ và tên.");
      valid = false;
    }
    if (!isEmail(emailValue)) {
      showError("regEmailError", "Vui lòng nhập địa chỉ email hợp lệ.");
      valid = false;
    }
    if (passwordValue.length < 8) {
      showError("passError", "Mật khẩu phải có ít nhất 8 ký tự.");
      valid = false;
    }
    if (passwordValue !== confirmation) {
      showError("confirmPassError", "Xác nhận mật khẩu không khớp.");
      valid = false;
    }
    if (!terms?.checked) {
      showToast("Vui lòng đồng ý với Điều khoản của Slanguage.");
      valid = false;
    }
    if (!valid || !submit) return;

    const draft: RegisterDraft = {
      display_name: displayName,
      email: emailValue,
      password: passwordValue,
      accept_terms: true,
    };
    sessionStorage.setItem("slanguage_reg_name", draft.display_name);
    sessionStorage.setItem("slanguage_reg_email", draft.email);
    sessionStorage.setItem("slanguage_reg_pass", draft.password);
    sessionStorage.setItem("slanguage_reg_terms", String(draft.accept_terms));
    setButtonBusy(submit, true, "Tiếp tục...");
    window.location.assign("../select-language/index.html");
  });
}

export function initializeAuthPortal(defaultMode: "login" | "register"): void {
  localStorage.removeItem("slanguage_users_db");
  localStorage.removeItem("slanguage_user_password");
  const query = new URLSearchParams(window.location.search);
  const requestedMode = query.get("mode") || window.location.hash.slice(1);
  const signUp = document.getElementById("showSignUp") as HTMLInputElement | null;
  const signIn = document.getElementById("showSignIn") as HTMLInputElement | null;
  const mode = requestedMode === "register" || requestedMode === "signup"
    ? "register"
    : defaultMode;

  if (signUp && signIn) {
    signUp.checked = mode === "register";
    signIn.checked = mode === "login";
  }
  initLogin();
  initRegister();
}
