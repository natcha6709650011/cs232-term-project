let myLat = null;
let myLon = null;
let retryCount = 0;

window.onload = function () {
  requestGPS();
};

function requestGPS() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        myLat = pos.coords.latitude;
        myLon = pos.coords.longitude;

        document.getElementById("display-coords").innerText =
          `${myLat.toFixed(5)}, ${myLon.toFixed(5)}`;

        document.getElementById("geo-text").innerText =
          "พิกัดระบุเรียบร้อยแล้ว";

        const btn = document.getElementById("btn-confirm-gps");
        btn.disabled = false;
        btn.classList.remove("opacity-50", "cursor-not-allowed");
      },
      (err) => {
        console.error("GPS error:", err);
        document.getElementById("view-step-3-error").classList.remove("hidden");
      },
      {
        enableHighAccuracy: false,
        timeout: 7000,
        maximumAge: 60000
      }
    );
  }
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
    if (el) el.classList.add("hidden");
  });
}

async function submitStep2() {
  const lat = Number(myLat);
  const lng = Number(myLon);

  if (!lat || !lng || Number.isNaN(lat) || Number.isNaN(lng)) {
    alert("ไม่พบพิกัดอาจารย์ กรุณากดดึงตำแหน่งใหม่");
    requestGPS();
    return;
  }

  try {
    const payload = {
      line_user_id: localStorage.getItem("line_user_id"),
      type: "onsite",

      latitude: lat,
      longitude: lng,
      teacher_latitude: lat,
      teacher_longitude: lng,

      class_id: "CS232_SEC01",
      course_id: "CS232",
      course_name: "CS232 INTRODUCTION TO CLOUD COMPUTING TECHNOLOGY",
      section: "650001",
      start_time: "09.30",
      end_time: "12.30",
      student_count: 0
    };

    const response = await fetch(
      "https://26vfnfp8b5.execute-api.us-east-1.amazonaws.com/start-session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "สร้าง session ไม่สำเร็จ");
    }

    const sessionId = result.data?.session_id || result.session_id;

    const checkinLink =
      result.data?.checkin_link ||
      `https://main.d1d25usb5e0o4s.amplifyapp.com/frontend/checkin.html?session_id=${encodeURIComponent(sessionId)}`;

    hideAllViews();
    document.getElementById("view-step-4").classList.remove("hidden");

    document.getElementById("res-course-id").innerText = "CS232";
    document.getElementById("res-section").innerText = "650001";
    document.getElementById("res-time").innerText = "เวลา 09.30-12.30";

    document.getElementById("final-qr").src =
      `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(checkinLink)}`;

    localStorage.setItem("session_id", sessionId);

    console.log("START ONSITE SESSION SUCCESS:", result);
  } catch (error) {
    console.error("start onsite session error:", error);
    alert(error.message || "สร้าง session ไม่สำเร็จ");
    showErrorPage();
  }
}

function showErrorPage(forceCount = null) {
  hideAllViews();
  document.getElementById("view-failed").classList.remove("hidden");

  document.getElementById("error-course-id").innerText = "CS232";
  document.getElementById("error-section").innerText = "Section 650001";
  document.getElementById("error-time-display").innerText = "เวลา 09.30-12.30";

  if (forceCount !== null) {
    retryCount = forceCount;
  } else {
    retryCount++;
  }

  const errorMsg = document.getElementById("error-msg");
  const btnRetry = document.getElementById("btn-retry");

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
    document.getElementById("view-step-4").classList.remove("hidden");
    document.getElementById("final-qr").src =
      "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=TEST";
  }
}

function handleRetry() {
  hideAllViews();
  document.getElementById("view-step-2").classList.remove("hidden");
  requestGPS();
}

function closeError() {
  document.getElementById("view-step-3-error").classList.add("hidden");
}

function finishProcess() {
  if (typeof liff !== "undefined" && liff.isInClient()) {
    liff.closeWindow();
  } else {
    alert("ปิดหน้าต่างสำเร็จ");
  }
}

async function downloadQRCode() {
  const qrImage = document.getElementById("final-qr");

  if (!qrImage.src) return;

  try {
    const response = await fetch(qrImage.src);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "QRCode.png";
    a.click();
  } catch (e) {
    alert("ดาวน์โหลดล้มเหลว");
  }
}

