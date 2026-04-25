const API_BASE_URL = "https://9y8xshv9ek.execute-api.us-east-1.amazonaws.com";

const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("studentId");
const passwordInput = document.getElementById("password");
const loginButton = loginForm.querySelector(".login-btn");

const successOverlay = document.getElementById("successOverlay");
const failOverlay = document.getElementById("failOverlay");
const failMessage = document.getElementById("failMessage");
const continueBtn = document.getElementById("continueBtn");
const closeFailBtn = document.getElementById("closeFailBtn");

let pendingRole = null;

function getLineUserId() {
  const savedLineUserId = localStorage.getItem("line_user_id");
  if (savedLineUserId) return savedLineUserId;

  const params = new URLSearchParams(window.location.search);
  const queryLineUserId = params.get("line_user_id");
  if (queryLineUserId) {
    localStorage.setItem("line_user_id", queryLineUserId);
    return queryLineUserId;
  }

  const mockLineUserId = `mock-line-${Date.now()}`;
  localStorage.setItem("line_user_id", mockLineUserId);
  return mockLineUserId;
}

function setSubmitting(isSubmitting) {
  loginButton.disabled = isSubmitting;
  loginButton.textContent = isSubmitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ";
}

function openOverlay(target) {
  target.classList.remove("hidden");
}

function closeOverlay(target) {
  target.classList.add("hidden");
}

function saveLoginResult(profile, role) {
  localStorage.setItem("line_user_id", profile.line_user_id);
  localStorage.setItem("user_role", role);
  localStorage.setItem("user_profile", JSON.stringify(profile));
}

function goToNextPage() {
  if (pendingRole === "teacher") {
    window.location.href = "teacher-dashboard.html";
    return;
  }

  window.location.href = "checkin.html";
}

async function submitLogin(event) {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    failMessage.textContent = "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน";
    openOverlay(failOverlay);
    return;
  }

  const payload = {
    line_user_id: getLineUserId(),
    username,
    password
  };

  try {
    setSubmitting(true);

    const response = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "เข้าสู่ระบบไม่สำเร็จ");
    }

    pendingRole = result.data.role;
    saveLoginResult(result.data.profile, result.data.role);
    openOverlay(successOverlay);
  } catch (error) {
    console.error("login error:", error);
    failMessage.textContent = error.message || "เข้าสู่ระบบไม่สำเร็จ";
    openOverlay(failOverlay);
  } finally {
    setSubmitting(false);
  }
}

loginForm.addEventListener("submit", submitLogin);

continueBtn.addEventListener("click", goToNextPage);
closeFailBtn.addEventListener("click", () => {
  closeOverlay(failOverlay);
  failMessage.textContent = "โปรดตรวจสอบผู้ใช้และรหัสผ่าน";
});
