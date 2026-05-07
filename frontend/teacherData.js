// ==================== CONFIG ====================
const API_BASE_URL = "https://26vfnfp8b5.execute-api.us-east-1.amazonaws.com";
const LIFF_ID = "2009731150-FBugBxC4";
const FRONTEND_BASE_URL = "https://main.d1d25usb5e0o4s.amplifyapp.com/frontend";
const ONLINE_SESSION_ID = "ONLINE650001";


// DEV_MODE = true  → ข้าม LIFF login (ใช้ตอน dev/test ใน browser)
// DEV_MODE = false → ใช้ LIFF จริง (ใช้ตอน deploy บน LINE)
const DEV_MODE = false;
const DEV_MOCK_USER_ID = "U_dev_test_teacher"; // mock user id ตอน dev

let currentClassId = "";
let activeLineUserId = "";
let onlineRetryCount = 0;

// ==================== LIFF ====================
async function initializeTeacherLiff() {
    // ถ้าเป็น dev mode ให้ใช้ mock user id เลย ไม่ต้อง login
    if (DEV_MODE) {
        activeLineUserId = DEV_MOCK_USER_ID;
        return DEV_MOCK_USER_ID;
    }

    if (typeof liff !== "undefined") {
        try {
            await liff.init({ liffId: LIFF_ID });
            if (!liff.isLoggedIn()) { liff.login(); return ""; }
            const profile = await liff.getProfile();
            if (profile?.userId) {
                activeLineUserId = profile.userId;
                localStorage.setItem("line_user_id", profile.userId);
                localStorage.setItem("line_profile", JSON.stringify(profile));
                return profile.userId;
            }
        } catch (error) {
            console.warn("teacher LIFF init failed:", error);
        }
    }
    const saved = localStorage.getItem("line_user_id");
    if (saved) { activeLineUserId = saved; return saved; }
    return "";
}

// ==================== FETCH CLASS DATA ====================
async function fetchClassData() {
    try {
        const lineUserId = await initializeTeacherLiff();
        if (!lineUserId) { console.warn("ยังไม่พบ line_user_id"); return; }

        const response = await fetch(`${API_BASE_URL}/class/${lineUserId}`);
        const result = await response.json();

        if (result.success) {
            const data = result.data;
            document.getElementById('course-id').innerText = data.course_id;
            document.getElementById('course-name').innerText = data.course_name;
            document.getElementById('section').innerText = data.section;
            document.getElementById('time-range').innerText = `${data.start_time} - ${data.end_time}`;
            document.getElementById('student-count').innerText = `${data.student_count} คน`;
            currentClassId = data.class_id;
        }
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

// ==================== VIEW HELPERS ====================
function showView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(viewId);
    target.classList.add('active', 'slide-in');
    // ลบ animation class หลังเสร็จ เพื่อให้ใช้ซ้ำได้
    target.addEventListener('animationend', () => target.classList.remove('slide-in'), { once: true });
}

// ==================== NAVIGATION ====================

// ปุ่มยืนยัน → ไปหน้าเลือกโหมด
function showModeSelect() {
    showView('view-mode-select');
}

// ปุ่มออนไซต์ → ส่งไป teacher-GPS.html
function startOnsite() {
    // ส่ง class_id และ line_user_id ผ่าน URL params ให้ teacher-GPS.html ใช้ต่อ
    const params = new URLSearchParams({
        class_id: currentClassId,
        line_user_id: activeLineUserId
    });
    window.location.href = `teacher-GPS.html?${params.toString()}`;
}

// ปุ่มออนไลน์ → ใช้ session เดิมเท่านั้น ไม่ยิง /start-session
function startOnline() {
    onlineRetryCount = 0;
    showOnlineQR();
}

// ==================== QR CODE (ออนไลน์) ====================
function showOnlineQR() {
    const courseId = document.getElementById('course-id').innerText || "CS232";
    const section  = document.getElementById('section').innerText || "650001";
    const time     = document.getElementById('time-range').innerText || "09.30 - 12.30";

    document.getElementById('qr-course-id').innerText = courseId;
    document.getElementById('qr-section').innerText   = section;
    document.getElementById('qr-time').innerText      = `เวลา ${time}`;

    // Online ใช้ session_id เดิมตลอด ห้ามสร้างใหม่
    const checkinUrl =
        `${FRONTEND_BASE_URL}/checkin.html?session_id=${encodeURIComponent(ONLINE_SESSION_ID)}&type=online`;

    document.getElementById('qr-online').src =
        `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(checkinUrl)}`;

    localStorage.setItem("session_id", ONLINE_SESSION_ID);
    localStorage.setItem("session_type", "online");

    console.log("ONLINE CHECKIN LINK:", checkinUrl);
    showView('view-qr');
}

// ==================== ERROR (ออนไลน์) ====================
function showOnlineError(message) {
    onlineRetryCount++;

    const courseId = document.getElementById('course-id').innerText;
    const section  = document.getElementById('section').innerText;
    const time     = document.getElementById('time-range').innerText;

    document.getElementById('online-error-course-id').innerText = courseId;
    document.getElementById('online-error-section').innerText   = section;
    document.getElementById('online-error-time').innerText      = `เวลา ${time}`;

    const errorMsg = document.getElementById('online-error-msg');
    const btnRetry = document.getElementById('btn-online-retry');

    if (onlineRetryCount >= 3) {
        errorMsg.innerText = "กรุณาติดต่อเจ้าหน้าที่";
        btnRetry.innerText = "ติดต่อเจ้าหน้าที่";
        btnRetry.classList.remove('bg-orange-400');
        btnRetry.classList.add('bg-red-500');
        btnRetry.onclick = () => { window.location.href = "https://line.me/ti/p/@894uryda"; };
    } else {
        errorMsg.innerText = message || "กรุณาลองใหม่อีกครั้ง";
        btnRetry.innerText = "ลองอีกครั้ง";
        btnRetry.classList.remove('bg-red-500');
        btnRetry.classList.add('bg-orange-400');
        btnRetry.onclick = retryOnline;
    }

    showView('view-online-error');
}

function retryOnline() {
    showView('view-mode-select');
}

// ==================== DOWNLOAD QR ====================
async function downloadQRCode() {
    const qrImage = document.getElementById('final-qr') || document.getElementById('qr-online');
    if (!qrImage || !qrImage.src) return;

    if (liff.isInClient()) {
        // แจ้งเตือนสั้นๆ แล้วเปิด Browser นอกเพื่อให้กดเซฟได้ชัวร์ๆ
        alert("ระบบจะเปิดรูปภาพใน Browser กรุณากดค้างที่รูปเพื่อบันทึก");
        liff.openWindow({
            url: qrImage.src,
            external: true
        });
    } else {
        // บนคอมพิวเตอร์ให้ดาวน์โหลดปกติ
        const a = document.createElement('a');
        a.href = qrImage.src;
        a.download = 'QR_Attendance.png';
        a.click();
    }
}

// ==================== UTILS ====================
function finishProcess() {
    if (typeof liff !== 'undefined' && liff.isInClient()) {
        liff.closeWindow();
    } else {
        alert("ปิดหน้าต่างสำเร็จ");
    }
}

function closeLiff() {
    if (typeof liff !== 'undefined') {
        liff.closeWindow();
    } else {
        alert("ปิดหน้าต่างนี้ (ใน LINE จะปิด LIFF ทันที)");
    }
}

// ==================== INIT ====================
initializeTeacherLiff().then(fetchClassData);