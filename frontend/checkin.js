const scanPage = document.getElementById("scanPage");
const locationPage = document.getElementById("locationPage");
const classInfoPage = document.getElementById("classInfoPage");

const scanBtn = document.getElementById("scanBtn");
const confirmBtn = document.getElementById("confirmBtn");
const saveBtn = document.getElementById("saveBtn");
const rescanBtn = document.getElementById("rescanBtn");
const refreshLocationBtn = document.getElementById("refreshLocationBtn");

const scannerVideo = document.getElementById("scannerVideo");
const scanStatus = document.getElementById("scanStatus");
const sessionBadge = document.getElementById("sessionBadge");

const locationInput = document.getElementById("locationInput");
const locationTag = document.getElementById("locationTag");
const locationStatusText = document.getElementById("locationStatusText");
const mapImage = document.getElementById("mapImage");

const subjectName = document.getElementById("subjectName");
const sectionText = document.getElementById("sectionText");
const roomText = document.getElementById("roomText");
const timeText = document.getElementById("timeText");
const dateText = document.getElementById("dateText");
const sessionText = document.getElementById("sessionText");
const coordsText = document.getElementById("coordsText");

const API_BASE_URL = "https://9y8xshv9ek.execute-api.us-east-1.amazonaws.com";
const UPLOAD_API_URL = "https://mxys2eeapf.execute-api.us-east-1.amazonaws.com/default/generate-upload-url";

let currentLatitude = null;
let currentLongitude = null;
let currentSessionId = "";
let scannerStream = null;
let scanIntervalId = null;
let barcodeDetector = null;

const studentData = {
  studentId: "6700000000",
  lineUserId: localStorage.getItem("line_user_id") || "mock-line-user-id"
};

const classData = {
  subjectId: "CS232",
  subjectName: "CS232 INTRODUCTION TO CLOUD COMPUTING TECHNOLOGY",
  section: "650001",
  room: "us2 - 309",
  time: "09:30-12:30",
  date: "DD/MM/YYYY"
};

function showPage(targetPage) {
  [scanPage, locationPage, classInfoPage].forEach((page) => {
    page.classList.remove("active");
  });

  targetPage.classList.add("active");
}

function setConfirmEnabled(enabled) {
  confirmBtn.disabled = !enabled;
}

function updateSessionBadge(text, isVisible = true) {
  sessionBadge.textContent = text;
  sessionBadge.classList.toggle("hidden", !isVisible);
}

function renderClassInfo() {
  subjectName.textContent = classData.subjectName;
  sectionText.textContent = classData.section;
  roomText.textContent = classData.room;
  timeText.textContent = classData.time;
  dateText.textContent = classData.date;
  sessionText.textContent = currentSessionId || "-";
  coordsText.textContent =
    currentLatitude != null && currentLongitude != null
      ? `${currentLatitude.toFixed(6)}, ${currentLongitude.toFixed(6)}`
      : "-";
}

function updateMapPreview(latitude, longitude) {
  mapImage.src =
    `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}` +
    `&zoom=16&size=800x1200&markers=${latitude},${longitude},red-pushpin`;

  locationTag.textContent = `ตำแหน่งปัจจุบัน ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function parseSessionIdFromText(rawValue) {
  if (!rawValue) return "";

  const trimmed = rawValue.trim();

  try {
    const parsedUrl = new URL(trimmed);
    return parsedUrl.searchParams.get("session_id") || parsedUrl.pathname.split("/").pop() || trimmed;
  } catch (error) {
    return trimmed;
  }
}

function stopScanner() {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }

  if (scannerStream) {
    scannerStream.getTracks().forEach((track) => track.stop());
    scannerStream = null;
  }

  scannerVideo.srcObject = null;
}

async function handleDetectedQr(rawValue) {
  const sessionId = parseSessionIdFromText(rawValue);
  if (!sessionId) return;

  currentSessionId = sessionId;
  stopScanner();
  scanStatus.textContent = "สแกน QR สำเร็จแล้ว";
  updateSessionBadge(`Session ID: ${currentSessionId}`);
  showPage(locationPage);
  loadCurrentLocation();
}

async function beginQrScanning() {
  if (!navigator.mediaDevices?.getUserMedia) {
    scanStatus.textContent = "อุปกรณ์นี้ไม่รองรับการเปิดกล้อง";
    return;
  }

  if (!("BarcodeDetector" in window)) {
    scanStatus.textContent = "เบราว์เซอร์นี้ยังไม่รองรับการสแกน QR";
    return;
  }

  try {
    barcodeDetector = new BarcodeDetector({ formats: ["qr_code"] });
    scanStatus.textContent = "กำลังเปิดกล้อง...";

    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }
      },
      audio: false
    });

    scannerVideo.srcObject = scannerStream;
    await scannerVideo.play();

    scanStatus.textContent = "หันกล้องไปที่ QR ของอาจารย์";

    scanIntervalId = window.setInterval(async () => {
      if (!barcodeDetector || scannerVideo.readyState < 2) return;

      try {
        const barcodes = await barcodeDetector.detect(scannerVideo);
        if (!barcodes.length) return;

        const [barcode] = barcodes;
        await handleDetectedQr(barcode.rawValue);
      } catch (error) {
        console.error("QR detect error:", error);
      }
    }, 450);
  } catch (error) {
    console.error("Camera error:", error);
    scanStatus.textContent = "ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตสิทธิ์กล้อง";
    stopScanner();
  }
}

function loadCurrentLocation() {
  setConfirmEnabled(false);

  if (!navigator.geolocation) {
    locationInput.value = "ไม่รองรับการใช้งานตำแหน่ง";
    locationStatusText.textContent = "อุปกรณ์นี้ไม่รองรับการดึงตำแหน่ง";
    currentLatitude = null;
    currentLongitude = null;
    return;
  }

  locationInput.value = "กำลังดึงตำแหน่ง...";
  locationTag.textContent = "กำลังดึงพิกัด...";
  locationStatusText.textContent = "ระบบกำลังดึงตำแหน่งของคุณ";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      currentLatitude = position.coords.latitude;
      currentLongitude = position.coords.longitude;

      locationInput.value =
        `พิกัดของคุณ ${currentLatitude.toFixed(6)}, ${currentLongitude.toFixed(6)}`;
      locationStatusText.textContent = "พบตำแหน่งแล้ว กดยืนยันเพื่อไปต่อ";
      updateMapPreview(currentLatitude, currentLongitude);
      setConfirmEnabled(Boolean(currentSessionId));
    },
    (error) => {
      currentLatitude = null;
      currentLongitude = null;

      switch (error.code) {
        case error.PERMISSION_DENIED:
          locationInput.value = "คุณไม่ได้อนุญาตให้เข้าถึงตำแหน่ง";
          break;
        case error.POSITION_UNAVAILABLE:
          locationInput.value = "ไม่สามารถดึงตำแหน่งปัจจุบันได้";
          break;
        case error.TIMEOUT:
          locationInput.value = "การดึงตำแหน่งใช้เวลานานเกินไป";
          break;
        default:
          locationInput.value = "เกิดข้อผิดพลาดในการดึงตำแหน่ง";
      }

      locationTag.textContent = "ยังไม่พบพิกัดปัจจุบัน";
      locationStatusText.textContent = "กรุณาลองดึงตำแหน่งอีกครั้ง";
      setConfirmEnabled(false);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

function buildCheckinPayload() {
  if (!currentSessionId) {
    alert("ยังไม่ได้สแกน QR");
    return null;
  }

  if (currentLatitude === null || currentLongitude === null) {
    alert("ยังไม่พบตำแหน่งปัจจุบัน");
    return null;
  }

  return {
    line_user_id: studentData.lineUserId,
    session_id: currentSessionId,
    student_id: studentData.studentId,
    latitude: currentLatitude,
    longitude: currentLongitude
  };
}

async function submitCheckin() {
  const payload = buildCheckinPayload();
  if (!payload) return;

  if (!API_BASE_URL) {
    alert("หน้าเช็คชื่อพร้อมแล้ว แต่ยังไม่ได้ใส่ API_BASE_URL");
    console.log("Check-in payload:", payload);
    return;
  }

  try {
    saveBtn.disabled = true;
    saveBtn.textContent = "กำลังบันทึก...";

    const response = await fetch(`${API_BASE_URL}/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์");
    }

    alert(result.message || "เช็คชื่อสำเร็จ");
  } catch (error) {
    console.error("submitCheckin error:", error);
    alert(error.message || "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "บันทึก";
  }
}

scanBtn.addEventListener("click", beginQrScanning);

refreshLocationBtn.addEventListener("click", loadCurrentLocation);

rescanBtn.addEventListener("click", () => {
  currentSessionId = "";
  updateSessionBadge("ยังไม่ได้สแกน QR", false);
  scanStatus.textContent = "กดปุ่มด้านล่างเพื่อเปิดกล้องและสแกน QR ของอาจารย์";
  showPage(scanPage);
  beginQrScanning();
});

confirmBtn.addEventListener("click", () => {
  if (!currentSessionId || currentLatitude == null || currentLongitude == null) {
    return;
  }

  renderClassInfo();
  showPage(classInfoPage);
});

saveBtn.addEventListener("click", submitCheckin);

const closeBtn = document.querySelector(".close-btn");

closeBtn.addEventListener("click", () => {
  stopScanner();
  window.history.back();
});

window.addEventListener("beforeunload", stopScanner);

updateSessionBadge("ยังไม่ได้สแกน QR", false);
renderClassInfo();
