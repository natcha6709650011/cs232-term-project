const API_BASE_URL = "https://9y8xshv9ek.execute-api.us-east-1.amazonaws.com";
// ADDED: LIFF ID ตัวจริงจาก LINE Developers
const LIFF_ID = "2009731150-FBugBxC4";

// ถ้า test นอก LINE/LIFF จะใช้ mock คงที่
// อย่าใช้ Date.now() เพราะ backend ผูก 1 account : 1 LINE ID
const MOCK_LINE_USER_ID = "mock-line-student-001";

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

/**
 * ดึง line_user_id
 * 1. ถ้ามี LIFF SDK → ใช้ LINE userId จริง
 * 2. ถ้ามี line_user_id ใน URL → ใช้จาก URL
 * 3. ถ้ามีใน localStorage → ใช้ค่าเดิม
 * 4. ถ้าไม่มีอะไรเลย → ใช้ mock คงที่สำหรับ test
 */
async function getLineUserId() {
  // ADDED: ถ้าเปิดผ่าน LIFF และมี SDK ให้ใช้ LINE userId จริงก่อน
  if (typeof liff !== "undefined") {
    try {
      await liff.init({ liffId: LIFF_ID });

      if (!liff.isLoggedIn()) {
        liff.login();
        return null;
      }

      const profile = await liff.getProfile();

      if (profile && profile.userId) {
        localStorage.setItem("line_user_id", profile.userId);
        return profile.userId;
      }
    } catch (error) {
      console.warn("LIFF init/getProfile failed, fallback to mock/query/localStorage:", error);
    }
  }

  // เผื่อ test โดยส่ง line_user_id ผ่าน query string
  const params = new URLSearchParams(window.location.search);
  const queryLineUserId = params.get("line_user_id");

  if (queryLineUserId) {
    localStorage.setItem("line_user_id", queryLineUserId);
    return queryLineUserId;
  }

  // ใช้ line_user_id เดิมที่เคยเก็บไว้
  const savedLineUserId = localStorage.getItem("line_user_id");

  if (savedLineUserId) {
    return savedLineUserId;
  }

  // mock สำหรับ test นอก LIFF
  localStorage.setItem("line_user_id", MOCK_LINE_USER_ID);
  return MOCK_LINE_USER_ID;
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

  // ADDED: เก็บ profile LINE เบื้องต้นไว้ เผื่อหน้าอื่นต้องใช้ต่อ
  if (typeof liff !== "undefined" && liff.isLoggedIn()) {
    liff.getProfile()
      .then((lineProfile) => {
        localStorage.setItem("line_profile", JSON.stringify(lineProfile));
      })
      .catch((error) => {
        console.warn("save line profile failed:", error);
      });
  }
}

function goToNextPage() {
  if (pendingRole === "teacher") {
    window.location.href = "teacher-dashboard.html";
    return;
  }

  if (pendingRole === "student") {
    window.location.href = "checkin.html";
    return;
  }

  failMessage.textContent = "ไม่พบสิทธิ์ผู้ใช้งาน";
  openOverlay(failOverlay);
}

function getFriendlyErrorMessage(result, fallbackMessage) {
  const message = result?.message || result?.detail || fallbackMessage;

  if (message === "this LINE account is already linked to another university account") {
    return "LINE นี้ถูกผูกกับบัญชีมหาวิทยาลัยอื่นแล้ว";
  }

  if (message === "this university account is already linked to another LINE account") {
    return "บัญชีนี้ถูกผูกกับ LINE อื่นแล้ว";
  }

  if (message === "login failed") {
    return "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
  }

  if (message === "missing line_user_id, username or password") {
    return "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน";
  }

  if (message === "internal server error") {
    return "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง";
  }

  return message || "เข้าสู่ระบบไม่สำเร็จ";
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

  try {
    setSubmitting(true);

    const line_user_id = await getLineUserId();

    // กรณี liff.login() redirect ออกไปแล้ว
    if (!line_user_id) {
      return;
    }

    const payload = {
      line_user_id,
      username,
      password
    };

    const response = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    let result = null;

    try {
      result = await response.json();
    } catch (jsonError) {
      throw new Error("ไม่สามารถอ่าน response จาก server ได้");
    }

    console.log("LOGIN RESPONSE:", result);

    if (!response.ok || !result.success) {
      const errorMessage = getFriendlyErrorMessage(
        result,
        "เข้าสู่ระบบไม่สำเร็จ"
      );

      throw new Error(errorMessage);
    }

    if (!result.data || !result.data.role || !result.data.profile) {
      throw new Error("รูปแบบข้อมูลจาก backend ไม่ถูกต้อง");
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
  failMessage.textContent = "โปรดตรวจสอบชื่อผู้ใช้และรหัสผ่าน";
});
