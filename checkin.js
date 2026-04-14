const scanPage = document.getElementById("scanPage");
const locationPage = document.getElementById("locationPage");
const classInfoPage = document.getElementById("classInfoPage");

const scanBtn = document.getElementById("scanBtn");
const confirmBtn = document.getElementById("confirmBtn");
const saveBtn = document.getElementById("saveBtn");
const locationInput = document.getElementById("locationInput");

const subjectName = document.getElementById("subjectName");
const sectionText = document.getElementById("sectionText");
const roomText = document.getElementById("roomText");
const timeText = document.getElementById("timeText");
const dateText = document.getElementById("dateText");

/* =========================
   CONFIG
========================= */

/*
  เปลี่ยน URL นี้เป็นของ backend จริง
  ตัวอย่าง:
  const API_BASE_URL = "http://localhost:3000";
  const API_BASE_URL = "https://your-backend-domain.com";
*/
const API_BASE_URL = "";

/* =========================
   DATA
========================= */

let currentLatitude = null;
let currentLongitude = null;

const studentData = {
  studentId: "6700000000"
};

const classData = {
  subjectId: "CS232",
  subjectName: "CS232 INTRODUCTION TO CLOUD COMPUTING TECHNOLOGY",
  section: "650001",
  room: "us2 - 309",
  time: "09:30-12:30",
  date: "DD/MM/YYYY"
};

/* =========================
   UI
========================= */

function showPage(targetPage) {
  [scanPage, locationPage, classInfoPage].forEach((page) => {
    page.classList.remove("active");
  });

  targetPage.classList.add("active");
}

function renderClassInfo() {
  subjectName.textContent = classData.subjectName;
  sectionText.textContent = classData.section;
  roomText.textContent = classData.room;
  timeText.textContent = classData.time;
  dateText.textContent = classData.date;
}

/* =========================
   LOCATION
========================= */

function loadCurrentLocation() {
  if (!navigator.geolocation) {
    locationInput.value = "ไม่รองรับการใช้งานตำแหน่ง";
    currentLatitude = null;
    currentLongitude = null;
    return;
  }

  locationInput.value = "กำลังดึงตำแหน่ง...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      currentLatitude = position.coords.latitude;
      currentLongitude = position.coords.longitude;

      locationInput.value =
        `พิกัดของคุณ ${currentLatitude.toFixed(6)}, ${currentLongitude.toFixed(6)}`;
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
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

/* =========================
   PAYLOAD
========================= */

function buildCheckinPayload() {
  if (currentLatitude === null || currentLongitude === null) {
    alert("ยังไม่พบตำแหน่งปัจจุบัน");
    return null;
  }

  return {
    studentId: studentData.studentId,
    subjectId: classData.subjectId,
    subjectName: classData.subjectName,
    section: classData.section,
    room: classData.room,
    classTime: classData.time,
    classDate: classData.date,
    checkinTime: new Date().toISOString(),
    latitude: currentLatitude,
    longitude: currentLongitude
  };
}

/* =========================
   API
========================= */

async function submitCheckin() {
  const payload = buildCheckinPayload();
  if (!payload) return;

  try {
    saveBtn.disabled = true;
    saveBtn.textContent = "กำลังบันทึก...";

    console.log("Sending payload:", payload);

    const response = await fetch(`${API_BASE_URL}/api/checkin`, {
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

    if (result.success) {
      alert(result.message || "เช็คชื่อสำเร็จ");
    } else {
      alert(result.message || "เช็คชื่อไม่สำเร็จ");
    }
  } catch (error) {
    console.error("submitCheckin error:", error);
    alert(error.message || "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "บันทึก";
  }
}

/* =========================
   EVENTS
========================= */

scanBtn.addEventListener("click", () => {
  showPage(locationPage);
  loadCurrentLocation();
});

confirmBtn.addEventListener("click", () => {
  showPage(classInfoPage);
});

saveBtn.addEventListener("click", submitCheckin);

/* =========================
   INIT
========================= */

renderClassInfo();

const closeBtn = document.querySelector(".close-btn");

closeBtn.addEventListener("click", () => {
  window.history.back();
});