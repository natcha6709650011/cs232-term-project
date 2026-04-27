const scanPage = document.getElementById("scanPage");
const locationPage = document.getElementById("locationPage");
const classInfoPage = document.getElementById("classInfoPage");
const cameraPage = document.getElementById("cameraPage");
const reviewPage = document.getElementById("reviewPage");

const scanBtn = document.getElementById("scanBtn");
const qrReader = document.getElementById("qrReader");
const scanImageBtn = document.getElementById("scanImageBtn");
const qrImageInput = document.getElementById("qrImageInput");

const confirmBtn = document.getElementById("confirmBtn");
const saveBtn = document.getElementById("saveBtn");
const rescanBtn = document.getElementById("rescanBtn");
const refreshLocationBtn = document.getElementById("refreshLocationBtn");
const openCameraStepBtn = document.getElementById("openCameraStepBtn");
const reviewRetakeBtn = document.getElementById("reviewRetakeBtn");

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

const capturePhotoBtn = document.getElementById("capturePhotoBtn");
const retakePhotoBtn = document.getElementById("retakePhotoBtn");
const usePhotoBtn = document.getElementById("usePhotoBtn");
const photoVideo = document.getElementById("photoVideo");
const capturedImage = document.getElementById("capturedImage");
const photoPlaceholder = document.getElementById("photoPlaceholder");
const photoCanvas = document.getElementById("photoCanvas");
const photoStatusText = document.getElementById("photoStatusText");
const identityStatusText = document.getElementById("identityStatusText");

const reviewSubjectName = document.getElementById("reviewSubjectName");
const reviewSessionText = document.getElementById("reviewSessionText");
const reviewSectionText = document.getElementById("reviewSectionText");
const reviewRoomText = document.getElementById("reviewRoomText");
const reviewTimeText = document.getElementById("reviewTimeText");
const reviewCoordsText = document.getElementById("reviewCoordsText");
const reviewDateText = document.getElementById("reviewDateText");

const API_BASE_URL = "https://26vfnfp8b5.execute-api.us-east-1.amazonaws.com";
const UPLOAD_API_URL = "https://26vfnfp8b5.execute-api.us-east-1.amazonaws.com/generate-upload-url";
const LIFF_ID = "2009731150-xGXS0XX2";

let currentLatitude = null;
let currentLongitude = null;
let currentSessionId = "";

let scannerStream = null;
let scanIntervalId = null;
let html5QrCode = null;

let photoStream = null;
let currentPhotoBlob = null;
let currentPhotoPreviewUrl = "";

const storedProfile = (() => {
try {
return JSON.parse(localStorage.getItem("user_profile") || "{}");
} catch (error) {
return {};
}
})();

const studentData = {
studentId: storedProfile.username || "6700000000",
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

async function getActiveLineUserId() {
if (typeof liff !== "undefined") {
try {
await liff.init({ liffId: LIFF_ID });

if (!liff.isLoggedIn()) {
liff.login();
return null;
}

const profile = await liff.getProfile();

if (profile?.userId) {
localStorage.setItem("line_user_id", profile.userId);
localStorage.setItem("line_profile", JSON.stringify(profile));
return profile.userId;
}
} catch (error) {
console.warn("checkin LIFF init failed:", error);
}
}

const savedLineUserId = localStorage.getItem("line_user_id");

if (savedLineUserId) {
return savedLineUserId;
}

return studentData.lineUserId;
}

function showPage(targetPage) {
[scanPage, locationPage, classInfoPage, cameraPage, reviewPage].forEach((page) => {
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

function renderReviewInfo() {
reviewSubjectName.textContent = classData.subjectName;
reviewSessionText.textContent = currentSessionId || "-";
reviewSectionText.textContent = classData.section;
reviewRoomText.textContent = classData.room;
reviewTimeText.textContent = classData.time;
reviewDateText.textContent = classData.date;
reviewCoordsText.textContent =
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

if (scannerVideo) {
scannerVideo.srcObject = null;
}
}

async function stopHtml5QrScanner() {
try {
if (html5QrCode) {
await html5QrCode.stop().catch(() => {});
await html5QrCode.clear().catch(() => {});
html5QrCode = null;
}
} catch (error) {
console.warn("stop qr scanner failed:", error);
html5QrCode = null;
}
}

async function handleDetectedQr(rawValue) {
const sessionId = parseSessionIdFromText(rawValue);

if (!sessionId) {
scanStatus.textContent = "ไม่พบ session_id ใน QR Code";
return;
}

currentSessionId = sessionId;
localStorage.setItem("session_id", currentSessionId);

await stopHtml5QrScanner();
stopScanner();

scanStatus.textContent = "สแกน QR สำเร็จแล้ว";
updateSessionBadge(`Session ID: ${currentSessionId}`);

showPage(locationPage);
loadCurrentLocation();
}

async function beginQrScanning() {
if (typeof Html5Qrcode === "undefined") {
scanStatus.textContent = "ไม่สามารถโหลดระบบสแกน QR ได้";
return;
}

try {
scanStatus.textContent = "กำลังเปิดกล้องสแกน QR...";

await stopHtml5QrScanner();
stopScanner();

html5QrCode = new Html5Qrcode("qrReader");

const cameras = await Html5Qrcode.getCameras();

if (!cameras || cameras.length === 0) {
scanStatus.textContent = "ไม่พบกล้องในอุปกรณ์นี้ กรุณาเลือกรูป QR จากแกลอรี่แทน";
return;
}

const backCamera =
cameras.find((camera) => camera.label.toLowerCase().includes("back")) ||
cameras[cameras.length - 1] ||
cameras[0];

await html5QrCode.start(
backCamera.id,
{
fps: 10,
qrbox: {
width: 250,
height: 250
}
},
(decodedText) => {
handleDetectedQr(decodedText);
},
() => {}
);

scanStatus.textContent = "กรุณาสแกน QR Code ห้องเรียน";
} catch (error) {
console.error("QR camera error:", error);
scanStatus.textContent =
"ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้อง หรือเลือกรูป QR จากแกลอรี่แทน";
}
}

async function decodeQrFromImageWithBarcodeDetector(file) {
if (typeof BarcodeDetector === "undefined") {
throw new Error("BarcodeDetector is not available");
}

const detector = new BarcodeDetector({ formats: ["qr_code"] });
const imageUrl = URL.createObjectURL(file);

try {
const image = await new Promise((resolve, reject) => {
const img = new Image();
img.onload = () => resolve(img);
img.onerror = () => reject(new Error("ไม่สามารถโหลดรูปจากแกลอรี่ได้"));
img.src = imageUrl;
});

const canvas = document.createElement("canvas");
const context = canvas.getContext("2d");

if (!context) {
throw new Error("ไม่สามารถเตรียม canvas สำหรับอ่าน QR ได้");
}

canvas.width = image.naturalWidth || image.width;
canvas.height = image.naturalHeight || image.height;
context.drawImage(image, 0, 0, canvas.width, canvas.height);

const barcodes = await detector.detect(canvas);

if (!barcodes.length || !barcodes[0].rawValue) {
throw new Error("ไม่พบข้อมูล QR ในรูปนี้");
}

return barcodes[0].rawValue;
} finally {
URL.revokeObjectURL(imageUrl);
}
}

async function scanQrFromImage(file) {
if (!file) return;

if (typeof Html5Qrcode === "undefined" && typeof BarcodeDetector === "undefined") {
scanStatus.textContent = "ไม่สามารถโหลดระบบอ่าน QR จากรูปได้";
return;
}

try {
scanStatus.textContent = "กำลังอ่าน QR จากรูปภาพ...";

await stopHtml5QrScanner();
stopScanner();

let decodedText = "";

if (typeof Html5Qrcode !== "undefined") {
try {
const imageQrCode = new Html5Qrcode("qrReader");
decodedText = await imageQrCode.scanFile(file, true);
await imageQrCode.clear().catch(() => {});
} catch (html5Error) {
console.warn("html5-qrcode image scan failed, trying fallback:", html5Error);
}
}

// ADDED: fallback สำหรับบางเครื่อง/บาง browser ที่อ่าน QR จากแกลอรี่ผ่าน html5-qrcode ไม่เสถียร
if (!decodedText) {
decodedText = await decodeQrFromImageWithBarcodeDetector(file);
}

handleDetectedQr(decodedText);
} catch (error) {
console.error("scan image qr error:", error);
scanStatus.textContent = "อ่าน QR จากรูปไม่สำเร็จ กรุณาเลือกรูป QR ที่ชัดเจน";
}
}

function stopPhotoCamera() {
if (photoStream) {
photoStream.getTracks().forEach((track) => track.stop());
photoStream = null;
}

photoVideo.srcObject = null;
capturePhotoBtn.disabled = true;
}

function resetCapturedPhoto() {
currentPhotoBlob = null;

if (currentPhotoPreviewUrl) {
URL.revokeObjectURL(currentPhotoPreviewUrl);
currentPhotoPreviewUrl = "";
}

capturedImage.src = "";
capturedImage.classList.add("hidden");
// ADDED: ตอน reset ต้องกลับมาโชว์ video stream เพื่อให้ผู้ใช้ถ่ายใหม่ได้
photoVideo.classList.remove("hidden");
photoPlaceholder.classList.remove("hidden");
retakePhotoBtn.disabled = true;
usePhotoBtn.disabled = true;
identityStatusText.textContent = "ยังไม่ได้ถ่ายภาพยืนยันตัวตน";
}

async function openPhotoCamera() {
if (!navigator.mediaDevices?.getUserMedia) {
photoStatusText.textContent = "อุปกรณ์นี้ไม่รองรับการเปิดกล้อง";
return;
}

try {
stopPhotoCamera();

photoStream = await navigator.mediaDevices.getUserMedia({
video: {
facingMode: "user"
},
audio: false
});

photoVideo.srcObject = photoStream;
// ADDED: เปิดกล้องใหม่ทุกครั้งต้องแน่ใจว่า preview video ถูกแสดงอยู่
photoVideo.classList.remove("hidden");
await photoVideo.play();
capturePhotoBtn.disabled = false;
photoStatusText.textContent = "กล้องพร้อมแล้ว กดถ่ายภาพเพื่อยืนยันตัวตน";
} catch (error) {
console.error("Photo camera error:", error);
photoStatusText.textContent = "ไม่สามารถเปิดกล้องถ่ายภาพได้";
stopPhotoCamera();
}
}

function capturePhoto() {
if (!photoVideo.videoWidth || !photoVideo.videoHeight) {
photoStatusText.textContent = "กล้องยังไม่พร้อมสำหรับการถ่ายภาพ";
return;
}

photoCanvas.width = photoVideo.videoWidth;
photoCanvas.height = photoVideo.videoHeight;

const context = photoCanvas.getContext("2d");
context.drawImage(photoVideo, 0, 0, photoCanvas.width, photoCanvas.height);

photoCanvas.toBlob((blob) => {
if (!blob) {
photoStatusText.textContent = "ถ่ายภาพไม่สำเร็จ กรุณาลองใหม่";
return;
}

currentPhotoBlob = blob;

if (currentPhotoPreviewUrl) {
URL.revokeObjectURL(currentPhotoPreviewUrl);
}

currentPhotoPreviewUrl = URL.createObjectURL(blob);
capturedImage.src = currentPhotoPreviewUrl;
capturedImage.classList.remove("hidden");
// ADDED: เมื่อถ่ายเสร็จให้ซ่อน video แล้วโชว์รูป preview แทน
photoVideo.classList.add("hidden");
photoPlaceholder.classList.add("hidden");
retakePhotoBtn.disabled = false;
usePhotoBtn.disabled = false;
photoStatusText.textContent = "ถ่ายภาพเรียบร้อยแล้ว พร้อมอัปโหลดก่อนเช็คชื่อ";
identityStatusText.textContent = "ถ่ายภาพยืนยันตัวตนเรียบร้อยแล้ว";
stopPhotoCamera();
}, "image/jpeg", 0.92);
}

async function requestUploadTarget() {
const response = await fetch(UPLOAD_API_URL, {
method: "GET"
});

const result = await response.json();
const data = result.data || result;

if (!response.ok) {
throw new Error(result.message || "ไม่สามารถขอลิงก์อัปโหลดรูปได้");
}

if (!data.upload_url || !data.file_path) {
throw new Error("upload api ไม่ได้ส่ง upload_url หรือ file_path กลับมา");
}

return data;
}

async function uploadCapturedImage() {
if (!currentPhotoBlob) {
throw new Error("กรุณาถ่ายภาพก่อนเช็คชื่อ");
}

const { upload_url, file_path } = await requestUploadTarget();

const uploadResponse = await fetch(upload_url, {
method: "PUT",
headers: {
"Content-Type": "image/jpeg"
},
body: currentPhotoBlob
});

if (!uploadResponse.ok) {
const errorText = await uploadResponse.text().catch(() => "");
throw new Error(`อัปโหลดรูปไป S3 ไม่สำเร็จ: ${uploadResponse.status} ${errorText}`);
}

return file_path;
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

function buildCheckinPayload(imageUrl) {
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
longitude: currentLongitude,
image_url: imageUrl
};
}

function resetCheckinToScanPage() {
  currentSessionId = "";
  currentLatitude = null;
  currentLongitude = null;

  localStorage.removeItem("session_id");

  stopHtml5QrScanner();
  stopScanner();
  stopPhotoCamera();
  resetCapturedPhoto();

  setConfirmEnabled(false);
  updateSessionBadge("ยังไม่ได้สแกน QR", false);

  scanStatus.textContent = "กดปุ่มด้านล่างเพื่อเปิดกล้องและสแกน QR ของอาจารย์";
  locationInput.value = "กำลังดึงตำแหน่ง...";
  locationTag.textContent = "กำลังดึงพิกัด...";
  locationStatusText.textContent = "ระบบกำลังดึงตำแหน่งของคุณ";

  showPage(scanPage);
}

function goBackToLineMenu() {
  stopHtml5QrScanner();
  stopScanner();
  stopPhotoCamera();

  localStorage.removeItem("session_id");

  if (typeof liff !== "undefined" && liff.isInClient && liff.isInClient()) {
    liff.closeWindow();
    return;
  }

  window.location.href = "login.html";
}
async function submitCheckin() {
try {
const activeLineUserId = await getActiveLineUserId();

if (!activeLineUserId) {
return;
}

studentData.lineUserId = activeLineUserId;

saveBtn.disabled = true;
saveBtn.textContent = "กำลังอัปโหลดรูป...";

const imageUrl = await uploadCapturedImage();
const payload = buildCheckinPayload(imageUrl);

if (!payload) {
return;
}

saveBtn.textContent = "กำลังบันทึก...";

const response = await fetch(`${API_BASE_URL}/check-in`, {
method: "POST",
headers: {
"Content-Type": "application/json"
},
body: JSON.stringify(payload)
});

const result = await response.json();

if (!response.ok || result.success === false) {
throw new Error(result.message || "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์");
}

alert(result.message || "เช็คชื่อสำเร็จ");
goBackToLineMenu();

// สำคัญ: ปิดหน้าต่าง LIFF ทันทีหลังเช็คชื่อสำเร็จ
if (typeof liff !== "undefined") {
    liff.closeWindow();
}

} catch (error) {
  console.error("submitCheckin error:", error);

  const errorMessage = error.message || "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้";

  const isAlreadyCheckedIn =
    errorMessage.includes("already checked in") ||
    errorMessage.includes("เช็คชื่อแล้ว") ||
    errorMessage.includes("เช็คอินแล้ว") ||
    errorMessage.includes("duplicate");

  if (isAlreadyCheckedIn) {
    alert("คุณเช็คอินแล้ว");
    goBackToLineMenu();
    return;
  }

  alert("Check-in error: " + errorMessage);

  resetCheckinToScanPage();
} finally {
saveBtn.disabled = false;
saveBtn.textContent = "บันทึก";
}
}

scanBtn.addEventListener("click", beginQrScanning);

if (scanImageBtn && qrImageInput) {
scanImageBtn.addEventListener("click", () => {
qrImageInput.click();
});

qrImageInput.addEventListener("change", (event) => {
const [file] = event.target.files;

if (file) {
scanQrFromImage(file);
}

qrImageInput.value = "";
});
}

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

openCameraStepBtn.addEventListener("click", () => {
showPage(cameraPage);
resetCapturedPhoto();
openPhotoCamera();
});

saveBtn.addEventListener("click", submitCheckin);
capturePhotoBtn.addEventListener("click", capturePhoto);

retakePhotoBtn.addEventListener("click", () => {
resetCapturedPhoto();
openPhotoCamera();
});

usePhotoBtn.addEventListener("click", () => {
if (!currentPhotoBlob) {
alert("กรุณาถ่ายภาพก่อน");
return;
}

renderReviewInfo();
showPage(reviewPage);
});

reviewRetakeBtn.addEventListener("click", () => {
showPage(cameraPage);
resetCapturedPhoto();
openPhotoCamera();
});

const closeBtn = document.querySelector(".close-btn");

if (closeBtn) {
closeBtn.addEventListener("click", () => {
stopHtml5QrScanner();
stopScanner();
stopPhotoCamera();
window.history.back();
});
}

window.addEventListener("beforeunload", () => {
stopHtml5QrScanner();
stopScanner();
stopPhotoCamera();
});

updateSessionBadge("ยังไม่ได้สแกน QR", false);
renderClassInfo();
resetCapturedPhoto();

getActiveLineUserId().then((lineUserId) => {
if (lineUserId) {
studentData.lineUserId = lineUserId;
}
});

document.addEventListener("DOMContentLoaded", () => {
const params = new URLSearchParams(window.location.search);
const urlSessionId = params.get("session_id");

if (urlSessionId) {
currentSessionId = urlSessionId;

updateSessionBadge(`Session ID: ${currentSessionId}`);

showPage(locationPage);

loadCurrentLocation();
}
});
