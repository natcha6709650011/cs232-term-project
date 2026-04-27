const leaveForm = document.getElementById("leaveForm");
const leaveDateInput = document.getElementById("leaveDate");
const leaveNoteInput = document.getElementById("leaveNote");
const attachmentInput = document.getElementById("attachmentInput");
const uploadDropzone = document.getElementById("uploadDropzone");
const filePreview = document.getElementById("filePreview");
const filePreviewName = document.getElementById("filePreviewName");
const filePreviewMeta = document.getElementById("filePreviewMeta");

const clearBtn = document.getElementById("clearBtn");
const previewAttachmentBtn = document.getElementById("previewAttachmentBtn");

const successDialog = document.getElementById("successDialog");
const closeSuccessBtn = document.getElementById("closeSuccessBtn");
const openAttachmentBtn = document.getElementById("openAttachmentBtn");
const resultDate = document.getElementById("resultDate");
const resultReason = document.getElementById("resultReason");

const viewerDialog = document.getElementById("viewerDialog");
const closeViewerBtn = document.getElementById("closeViewerBtn");
const viewerFileName = document.getElementById("viewerFileName");
const viewerContent = document.getElementById("viewerContent");

const reasonButtons = Array.from(document.querySelectorAll(".reason-option"));
// ADDED: LIFF ID ตัวจริงจาก LINE Developers
const LIFF_ID = "2009731150-FBugBxC4";
const API_BASE_URL = "https://26vfnfp8b5.execute-api.us-east-1.amazonaws.com";
const UPLOAD_API_URL = "https://26vfnfp8b5.execute-api.us-east-1.amazonaws.com/generate-upload-url?folder=leave";
let selectedReason = "ลากิจ";
let selectedFile = null;
let currentObjectUrl = null;
let activeLineUserId = localStorage.getItem("line_user_id") || "";

// ADDED: ดึง line_user_id จริงไว้ใช้กับหน้า leave เมื่อ backend พร้อมเชื่อม
async function initializeLeaveLiff() {
  if (activeLineUserId) return;

  if (typeof liff === "undefined") {
    return;
  }

  try {
    await liff.init({ liffId: LIFF_ID });

    if (!liff.isLoggedIn()) {
      return;
    }

    const profile = await liff.getProfile();
    if (profile?.userId) {
      activeLineUserId = profile.userId;
      localStorage.setItem("line_user_id", profile.userId);
      localStorage.setItem("line_profile", JSON.stringify(profile));
    }
  } catch (error) {
    console.warn("leave LIFF init failed:", error);
  }
}

function formatDate(dateValue) {
  if (!dateValue) return "-";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;

  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function setDefaultDate() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  leaveDateInput.value = localDate.toISOString().split("T")[0];
}

function setReason(nextReason) {
  selectedReason = nextReason;

  reasonButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.reason === nextReason);
  });
}

function revokePreviewUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

function updateFilePreview(file) {
  selectedFile = file;

  if (!file) {
    filePreview.classList.add("empty");
    filePreviewName.textContent = "ยังไม่ได้เลือกไฟล์";
    filePreviewMeta.textContent = "เมื่อเลือกไฟล์แล้วจะแสดงรายละเอียดที่นี่";
    return;
  }

  filePreview.classList.remove("empty");
  filePreviewName.textContent = file.name;
  filePreviewMeta.textContent = `${file.type || "ไม่ทราบประเภทไฟล์"} • ${Math.max(1, Math.round(file.size / 1024))} KB`;
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "open");
  }
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function renderAttachmentViewer() {
  revokePreviewUrl();
  viewerContent.innerHTML = "";
  viewerContent.classList.remove("empty");

  if (!selectedFile) {
    viewerFileName.textContent = "ยังไม่มีไฟล์แนบ";
    viewerContent.classList.add("empty");
    viewerContent.innerHTML = "<p>ยังไม่มีไฟล์ให้แสดงตัวอย่าง</p>";
    return;
  }

  viewerFileName.textContent = selectedFile.name;
  currentObjectUrl = URL.createObjectURL(selectedFile);

  if (selectedFile.type.startsWith("image/")) {
    const image = document.createElement("img");
    image.src = currentObjectUrl;
    image.alt = selectedFile.name;
    viewerContent.appendChild(image);
    return;
  }

  const frame = document.createElement("iframe");
  frame.src = currentObjectUrl;
  frame.title = selectedFile.name;
  viewerContent.appendChild(frame);
}

function resetForm() {
  leaveForm.reset();
  setDefaultDate();
  setReason("ลากิจ");
  updateFilePreview(null);
}

function handleFileSelection(file) {
  if (!file) {
    updateFilePreview(null);
    return;
  }

  const isAcceptedType = [
    "image/jpeg",
    "image/png",
    "application/pdf"
  ].includes(file.type) || /\.(jpe?g|png|pdf)$/i.test(file.name);

  if (!isAcceptedType) {
    alert("กรุณาแนบไฟล์ JPG, PNG หรือ PDF เท่านั้น");
    attachmentInput.value = "";
    updateFilePreview(null);
    return;
  }

  updateFilePreview(file);
}

reasonButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setReason(button.dataset.reason);
  });
});

attachmentInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  handleFileSelection(file || null);
});

uploadDropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  uploadDropzone.classList.add("dragover");
});

uploadDropzone.addEventListener("dragleave", () => {
  uploadDropzone.classList.remove("dragover");
});

uploadDropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  uploadDropzone.classList.remove("dragover");
  const [file] = event.dataTransfer.files;
  handleFileSelection(file || null);
});
async function requestLeaveUploadTarget(file) {
  const contentType = file?.type || "application/octet-stream";
  const separator = UPLOAD_API_URL.includes("?") ? "&" : "?";
  const url = `${UPLOAD_API_URL}${separator}content_type=${encodeURIComponent(contentType)}`;

  const response = await fetch(url, { method: "GET" });
  const result = await response.json();
  const data = result.data || result;

  if (!response.ok) {
    throw new Error(result.message || "ไม่สามารถขอลิงก์อัปโหลดไฟล์แนบได้");
  }

  if (!data.upload_url || !data.file_path) {
    throw new Error("upload api ไม่ได้ส่ง upload_url หรือ file_path กลับมา");
  }

  return data;
}

async function uploadLeaveAttachment(file) {
  if (!file) return null;

  try {
    const contentType = file.type || "application/octet-stream";
    const { upload_url, file_path } = await requestLeaveUploadTarget(file);

    const uploadResponse = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file
    });

    if (!uploadResponse.ok) {
      console.warn("leave attachment upload failed:", uploadResponse.status);
      alert("อัปโหลดไฟล์แนบไม่สำเร็จ ระบบจะส่งคำขอลาโดยไม่มีไฟล์แนบ");
      return null;
    }

    return file_path;
  } catch (error) {
    console.warn("leave attachment upload error:", error);
    alert("อัปโหลดไฟล์แนบไม่สำเร็จ ระบบจะส่งคำขอลาโดยไม่มีไฟล์แนบ");
    return null;
  }
}

leaveForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await initializeLeaveLiff();

    const lineUserId = activeLineUserId || localStorage.getItem("line_user_id");

    if (!lineUserId) {
      throw new Error("ไม่พบ LINE user id กรุณาเข้าสู่ระบบใหม่");
    }

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id") || localStorage.getItem("session_id");

    if (!sessionId) {
      throw new Error("ไม่พบ session_id สำหรับการลา");
    }

    resultDate.textContent = formatDate(leaveDateInput.value);
    resultReason.textContent = selectedReason;

    const attachmentPath = await uploadLeaveAttachment(selectedFile);

    const payload = {
      line_user_id: lineUserId,
      session_id: sessionId,
      leave_date: leaveDateInput.value,
      type: selectedReason,
      reason: leaveNoteInput.value.trim() || selectedReason,
      note: leaveNoteInput.value.trim(),
      attachment_url: attachmentPath,
      attachment_name: selectedFile ? selectedFile.name : null
    };

    const response = await fetch(`${API_BASE_URL}/leave`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "ส่งคำขอลาไม่สำเร็จ");
    }

    openDialog(successDialog);
  } catch (error) {
    console.error("leave request error:", error);
    alert(error.message || "ส่งคำขอลาไม่สำเร็จ");
  }
});

clearBtn.addEventListener("click", resetForm);

previewAttachmentBtn.addEventListener("click", () => {
  renderAttachmentViewer();
  openDialog(viewerDialog);
});

openAttachmentBtn.addEventListener("click", () => {
  closeDialog(successDialog);
  renderAttachmentViewer();
  openDialog(viewerDialog);
});

closeViewerBtn.addEventListener("click", () => {
  closeDialog(viewerDialog);
});

closeSuccessBtn.addEventListener("click", () => {
  closeDialog(successDialog);
});

viewerDialog.addEventListener("close", revokePreviewUrl);
window.addEventListener("beforeunload", revokePreviewUrl);

setDefaultDate();
setReason(selectedReason);
updateFilePreview(null);
initializeLeaveLiff();
