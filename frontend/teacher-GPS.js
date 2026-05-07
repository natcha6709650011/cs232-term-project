let myLat = null;
let myLon = null;
let retryCount = 0;

const FRONTEND_BASE_URL = "https://main.d1d25usb5e0o4s.amplifyapp.com/frontend";

// Onsite ใช้ session เดิมใน DB
const ONSITE_SESSION_ID = "YSqk16";

// Online ใช้ session ใหม่ใน DB
const ONLINE_SESSION_ID = "ONLINE650001";

window.onload = function () {
  requestGPS();
};

function requestGPS() {
  if (!navigator.geolocation) {
    alert("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      myLat = pos.coords.latitude;
      myLon = pos.coords.longitude;

      const displayCoords = document.getElementById("display-coords");
      if (displayCoords) {
        displayCoords.innerText = `${myLat.toFixed(5)}, ${myLon.toFixed(5)}`;
      }

      const geoText = document.getElementById("geo-text");
      if (geoText) {
        geoText.innerText = "พิกัดระบุเรียบร้อยแล้ว";
      }

      const btn = document.getElementById("btn-confirm-gps");
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("opacity-50", "cursor-not-allowed");
      }
    },
    (err) => {
      console.error("GPS error:", err);
      const errorView = document.getElementById("view-step-3-error");
      if (errorView) {
        errorView.classList.remove("hidden");
      }
    },
    {
      enableHighAccuracy: false,
      timeout: 7000,
      maximumAge: 60000
    }
  );
}

function hideAllViews() {
  const views = [
    "view-step-2",
    "view-step-4",
    "view-failed",
    "view-step-3-error"
  ];

  views.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add("hidden");
    }
  });
}

function showSessionQR(sessionId, sessionType) {
  const checkinLink =
    `${FRONTEND_BASE_URL}/checkin.html?session_id=${encodeURIComponent(sessionId)}&type=${encodeURIComponent(sessionType)}`;

  const qrUrl =
    `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(checkinLink)}`;

  hideAllViews();

  const qrView = document.getElementById("view-step-4");
  if (qrView) {
    qrView.classList.remove("hidden");
  }

  const courseId = document.getElementById("res-course-id");
  if (courseId) {
    courseId.innerText = "CS232";
  }

  const section = document.getElementById("res-section");
  if (section) {
    section.innerText = "650001";
  }

  const time = document.getElementById("res-time");
  if (time) {
    time.innerText = "เวลา 09.30-12.30";
  }

  const finalQr = document.getElementById("final-qr");
  if (finalQr) {
    finalQr.src = qrUrl;
  }

  localStorage.setItem("session_id", sessionId);
  localStorage.setItem("session_type", sessionType);

  console.log("SESSION TYPE:", sessionType);
  console.log("SESSION ID:", sessionId);
  console.log("CHECKIN LINK:", checkinLink);
}

/*
  ปุ่ม Onsite / ยืนยันตำแหน่งอาจารย์
  QR ปลายทาง: checkin.html?session_id=YSqk16&type=onsite
  นักศึกษาสแกนแล้วต้องยืนยัน GPS ก่อนถ่ายรูป
*/
async function submitStep2() {
  const lat = Number(myLat);
  const lng = Number(myLon);

  if (!lat || !lng || Number.isNaN(lat) || Number.isNaN(lng)) {
    alert("ไม่พบพิกัดอาจารย์ กรุณากดดึงตำแหน่งใหม่");
    requestGPS();
    return;
  }

  showSessionQR(ONSITE_SESSION_ID, "onsite");
}

/*
  ปุ่ม Online
  QR ปลายทาง: checkin.html?session_id=ONLINE650001&type=online
  นักศึกษาสแกนแล้วข้าม GPS ไปถ่ายรูปได้เลย
*/
function startOnlineSession() {
  showSessionQR(ONLINE_SESSION_ID, "online");
}

// เผื่อ teacher-GPS.html เรียกชื่อ function เดิม
function submitOnline() {
  startOnlineSession();
}

function startOnline() {
  startOnlineSession();
}

// กันกรณี HTML เดิมเรียกชื่อ function เก่า: ห้ามยิง /start-session ให้ใช้ session เดิมเท่านั้น
function startSession(type) {
  if (type === "online") {
    startOnlineSession();
    return;
  }

  submitStep2();
}

function createSession(type) {
  startSession(type);
}

function startClass(type) {
  startSession(type);
}

function showErrorPage(forceCount = null) {
  hideAllViews();

  const failedView = document.getElementById("view-failed");
  if (failedView) {
    failedView.classList.remove("hidden");
  }

  const errorCourseId = document.getElementById("error-course-id");
  if (errorCourseId) {
    errorCourseId.innerText = "CS232";
  }

  const errorSection = document.getElementById("error-section");
  if (errorSection) {
    errorSection.innerText = "Section 650001";
  }

  const errorTime = document.getElementById("error-time-display");
  if (errorTime) {
    errorTime.innerText = "เวลา 09.30-12.30";
  }

  if (forceCount !== null) {
    retryCount = forceCount;
  } else {
    retryCount++;
  }

  const errorMsg = document.getElementById("error-msg");
  const btnRetry = document.getElementById("btn-retry");

  if (!errorMsg || !btnRetry) return;

  if (retryCount >= 3) {
    errorMsg.innerText = "กรุณาติดต่อเจ้าหน้าที่";
    btnRetry.innerText = "ติดต่อเจ้าหน้าที่";
    btnRetry.classList.remove("bg-orange-400");
    btnRetry.classList.add("bg-red-500");
    btnRetry.onclick = () => {
      window.location.href = "https://line.me/ti/p/@894uryda";
    };
  } else {
    errorMsg.innerText = "กรุณาลองใหม่อีกครั้ง";
    btnRetry.innerText = "ลองอีกครั้ง";
    btnRetry.classList.remove("bg-red-500");
    btnRetry.classList.add("bg-orange-400");
    btnRetry.onclick = handleRetry;
  }
}

function showStep(stepNum) {
  hideAllViews();

  if (stepNum === 4) {
    showSessionQR(ONSITE_SESSION_ID, "onsite");
  }
}

function handleRetry() {
  hideAllViews();

  const step2 = document.getElementById("view-step-2");
  if (step2) {
    step2.classList.remove("hidden");
  }

  requestGPS();
}

function closeError() {
  const errorView = document.getElementById("view-step-3-error");
  if (errorView) {
    errorView.classList.add("hidden");
  }
}

function finishProcess() {
  if (typeof liff !== "undefined" && liff.isInClient()) {
    liff.closeWindow();
  } else {
    alert("ปิดหน้าต่างสำเร็จ");
  }
}

async function downloadQRCode() {
    // 1. หา Element รูปภาพ (ตรวจสอบทั้ง 2 ID เพื่อความชัวร์)
    const qrImage = document.getElementById('final-qr') || document.getElementById('qr-online');
    
    if (!qrImage || !qrImage.src) {
        alert("ไม่พบรูปภาพ QR Code");
        return;
    }

    // 2. ตรวจสอบว่าเปิดในแอป LINE หรือไม่
    // ใช้ window.liff เพื่อป้องกัน Error หากไม่ได้ init
    if (window.liff && liff.isInClient()) {
        // แจ้งเตือน และเปิด URL ของรูปภาพใน Browser นอก (External Browser)
        // เพื่อให้ระบบ iOS/Android สามารถกดค้างเพื่อบันทึกรูปได้
        liff.openWindow({
            url: qrImage.src,
            external: true
        });
    } else {
        // กรณีเปิดบนคอมพิวเตอร์ หรือ Browser ทั่วไป
        const a = document.createElement('a');
        a.href = qrImage.src;
        a.download = 'QR_Attendance.png';
        document.body.appendChild(a); // เพิ่มเข้า body ชั่วคราวเพื่อให้ click ทำงานในบาง browser
        a.click();
        document.body.removeChild(a);
    }
}