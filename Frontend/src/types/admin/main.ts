import { ApiError, loginAdmin } from "./auth";

type ToastType = "info" | "success" | "error";
type AuthMode = "login" | "register";

function showToast(message: string, type: ToastType = "info"): void {
    let toast = document.getElementById("appToast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "appToast";
        toast.className = "fixed top-5 right-5 z-[100] max-w-sm rounded-xl px-4 py-3 text-sm text-white shadow-xl";
        document.body.appendChild(toast);
    }

    const colors: Record<ToastType, string> = {
        info: "bg-slate-800",
        success: "bg-emerald-600",
        error: "bg-red-600",
    };

    toast.className = `fixed top-5 right-5 z-[100] max-w-sm rounded-xl px-4 py-3 text-sm text-white shadow-xl ${colors[type]}`;
    toast.textContent = message;
    toast.classList.remove("hidden");
    window.setTimeout(() => toast?.classList.add("hidden"), 3000);
}

function toggleAuthMode(mode: AuthMode): void {
    document.getElementById("loginFormContainer")?.classList.toggle("hidden", mode !== "login");
    document.getElementById("registerFormContainer")?.classList.toggle("hidden", mode !== "register");

    const title = document.getElementById("authTitle");
    if (title) title.textContent = mode === "login" ? "LingoAdmin Portal" : "Tạo tài khoản Admin";
}

async function handleLogin(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const emailElement = document.getElementById("loginEmail");
    const passwordElement = document.getElementById("loginPassword");

    const email = emailElement instanceof HTMLInputElement
        ? emailElement.value.trim()
        : "";

    const password = passwordElement instanceof HTMLInputElement
        ? passwordElement.value
        : "";

    if (!email || !password) {
        showToast("Vui lòng nhập email và mật khẩu.", "error");
        return;
    }

    const submitButton = document.querySelector<HTMLButtonElement>('#loginForm button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
        await loginAdmin(email, password);
        window.location.assign(new URL("../dasboardAdmin/", window.location.href).toString());
    } catch (error) {
        if (error instanceof ApiError) {
            showToast(error.message, "error");
        } else if (error instanceof TypeError) {
            showToast("Không kết nối được backend. Hãy kiểm tra API và cấu hình VITE_API_BASE_URL.", "error");
        } else if (error instanceof Error) {
            showToast(error.message, "error");
        } else {
            showToast("Đăng nhập thất bại. Vui lòng thử lại.", "error");
        }
        if (submitButton) submitButton.disabled = false;
    }
}

function handleRegister(event: SubmitEvent): void {
    event.preventDefault();
    showToast("Giao diện đăng ký đã được gửi (chế độ demo).", "success");
}

function handleSocialLogin(provider: string): void {
    showToast(`Đăng nhập bằng ${provider} cần được tích hợp OAuth.`, "info");
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("loginForm")?.addEventListener("submit", handleLogin);
    document.getElementById("registerForm")?.addEventListener("submit", handleRegister);

    document.querySelectorAll<HTMLButtonElement>("[data-auth-mode]").forEach((button) => {
        button.addEventListener("click", () => {
            const mode = button.dataset.authMode;
            if (mode === "login" || mode === "register") toggleAuthMode(mode);
        });
    });

    document.querySelectorAll<HTMLButtonElement>("[data-social-provider]").forEach((button) => {
        button.addEventListener("click", () => {
            const provider = button.dataset.socialProvider;
            if (provider) handleSocialLogin(provider);
        });
    });
});
