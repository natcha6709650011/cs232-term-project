const API_BASE_URL = "https://26vfnfp8b5.execute-api.us-east-1.amazonaws.com";

function closePage() {
  if (window.liff && typeof liff.closeWindow === "function") {
    liff.closeWindow();
    return;
  }
  window.close();
}

function getFilePathFromUrlOrStorage() {
  const params = new URLSearchParams(window.location.search);

  let filePath =
    params.get("file_path") ||
    params.get("attachment_url") ||
    params.get("path") ||
    "";

  if (!filePath) {
    try {
      const selectedLeaveRaw =
        localStorage.getItem("selected_leave") ||
        localStorage.getItem("selectedLeave");
      if (selectedLeaveRaw) {
        const selectedLeave = JSON.parse(selectedLeaveRaw);
        filePath = selectedLeave.attachment_url || selectedLeave.file_path || "";
      }
    } catch (error) {
      console.warn("Cannot parse selected leave from localStorage", error);
    }
  }

  try {
    filePath = decodeURIComponent(filePath);
  } catch (_) {}

  return filePath;
}

function extractSignedUrl(payloadText) {
  if (!payloadText) return "";

  // Some Lambda/API responses return a raw URL as text.
  if (payloadText.trim().startsWith("http")) {
    return payloadText.trim();
  }

  let data;
  try {
    data = JSON.parse(payloadText);
  } catch (error) {
    console.log("generate-view-url raw response:", payloadText);
    return "";
  }

  // API Gateway/Lambda proxy may wrap the real JSON in body.
  if (typeof data.body === "string") {
    try {
      const inner = JSON.parse(data.body);
      data = { ...data, ...inner };
    } catch (_) {
      if (data.body.trim().startsWith("http")) return data.body.trim();
    }
  }

  return (
    data.view_url ||
    data.url ||
    data.file_url ||
    data.signed_url ||
    data.presigned_url ||
    data.data?.view_url ||
    data.data?.url ||
    data.data?.file_url ||
    data.data?.signed_url ||
    data.data?.presigned_url ||
    ""
  );
}

function renderNoFile() {
  const titleEl = document.getElementById("file-title");
  const contentEl = document.getElementById("file-content");
  const openBtn = document.getElementById("open-file-btn");
  const downloadBtn = document.getElementById("download-file-btn");

  if (titleEl) titleEl.textContent = "ไม่มีไฟล์แนบ";
  if (contentEl) {
    contentEl.innerHTML = `
      <div class="text-5xl mb-4">📄</div>
      <h2 class="text-xl font-bold mb-2">ไม่มีเอกสารแนบ</h2>
      <p class="text-slate-500">รายการนี้ไม่มีไฟล์แนบ หรือไม่มี path ไฟล์ในระบบ</p>
    `;
  }
  if (openBtn) openBtn.classList.add("hidden");
  if (downloadBtn) downloadBtn.classList.add("hidden");
}

function renderOpenFile(fileUrl, filePath) {
  const titleEl = document.getElementById("file-title");
  const contentEl = document.getElementById("file-content");
  const openBtn = document.getElementById("open-file-btn");
  const downloadBtn = document.getElementById("download-file-btn");

  if (titleEl) titleEl.textContent = "ไฟล์แนบ";

  const fileName = filePath.split("/").pop() || "attachment";

  if (contentEl) {
    contentEl.innerHTML = `
      <div class="text-6xl mb-4">📎</div>
      <h2 class="text-xl font-bold mb-2">พร้อมเปิดไฟล์แนบ</h2>
      <p class="text-slate-600 break-all text-sm mb-5">${fileName}</p>
      <button id="inline-open-file-btn" class="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-lg w-full">
        เปิดไฟล์แนบ
      </button>
      <p class="text-xs text-slate-400 mt-4">
        ถ้าเป็น PDF หรือไฟล์เอกสาร ให้กดปุ่มเพื่อเปิดในหน้าต่างใหม่/ดาวน์โหลด
      </p>
    `;
  }

  const openFile = () => {
    window.location.href = fileUrl;
  };

  const inlineBtn = document.getElementById("inline-open-file-btn");
  if (inlineBtn) inlineBtn.onclick = openFile;

  if (openBtn) {
    openBtn.classList.remove("hidden");
    openBtn.onclick = openFile;
  }
  if (downloadBtn) {
    downloadBtn.classList.remove("hidden");
    downloadBtn.onclick = openFile;
  }
}

function renderError(message) {
  const titleEl = document.getElementById("file-title");
  const contentEl = document.getElementById("file-content");
  const openBtn = document.getElementById("open-file-btn");
  const downloadBtn = document.getElementById("download-file-btn");

  if (titleEl) titleEl.textContent = "เปิดไฟล์ไม่สำเร็จ";
  if (contentEl) {
    contentEl.innerHTML = `
      <div class="text-5xl mb-4">⚠️</div>
      <h2 class="text-xl font-bold mb-2">เปิดไฟล์แนบไม่สำเร็จ</h2>
      <p class="text-slate-500">${message || "กรุณาลองใหม่อีกครั้ง"}</p>
    `;
  }
  if (openBtn) openBtn.classList.add("hidden");
  if (downloadBtn) downloadBtn.classList.add("hidden");
}

async function loadAttachment() {
  const filePath = getFilePathFromUrlOrStorage();

  if (!filePath || filePath === "null" || filePath === "undefined") {
    renderNoFile();
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/generate-view-url?file_path=${encodeURIComponent(filePath)}`
    );

    const payloadText = await response.text();

    if (!response.ok) {
      console.log("generate-view-url error response:", payloadText);
      renderError("ระบบสร้างลิงก์ไฟล์ไม่สำเร็จ");
      return;
    }

    const fileUrl = extractSignedUrl(payloadText);

    if (!fileUrl || !fileUrl.startsWith("http")) {
      console.log("generate-view-url response has no usable URL:", payloadText);
      renderError("ไม่พบลิงก์ไฟล์แนบจากระบบ");
      return;
    }

    renderOpenFile(fileUrl, filePath);
  } catch (error) {
    console.error("load attachment error:", error);
    renderError("เกิดข้อผิดพลาดระหว่างโหลดไฟล์แนบ");
  }
}

document.addEventListener("DOMContentLoaded", loadAttachment);
