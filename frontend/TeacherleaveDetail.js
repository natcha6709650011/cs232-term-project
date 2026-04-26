const API_BASE_URL = "https://26vfnfp8b5.execute-api.us-east-1.amazonaws.com";
const VIEW_URL_API = "https://26vfnfp8b5.execute-api.us-east-1.amazonaws.com/generate-view-url";
// ฟังก์ชันรับข้อมูลการลามาแสดงผล
function renderLeaveDetail(data) {
    // data ควรเป็น Object เช่น { name: "...", studentId: "...", reason: "..." }
    document.getElementById("std-name").innerText = data.name || "ไม่ระบุชื่อ";
    document.getElementById("std-id").innerText = data.studentId || "-";
    document.getElementById("leave-type").innerText = data.type || "-";
    document.getElementById("leave-reason").innerText = data.reason || "-";

    // รองรับชื่อ field หลายแบบ เผื่อ backend ส่งมาไม่เหมือนกัน
    const photoPath = data.photoPath || data.attachment_url || data.attachment_path || data.image_url;

    if (photoPath) {
        fetchViewUrl(photoPath);
    }
}

async function fetchViewUrl(path) {
    try {
        const res = await fetch(`${VIEW_URL_API}?file_path=${encodeURIComponent(path)}`);

        if (!res.ok) {
            throw new Error("ไม่สามารถดึงลิงก์รูปหลักฐานได้");
        }

        const url = await res.text();
        document.getElementById("evidence-img").src = url;
    } catch (err) {
        console.error("fetchViewUrl error:", err);
        alert("ไม่สามารถโหลดรูปหลักฐานได้");
    }
}

async function submitApproval(status) {
    // status = "approved" หรือ "rejected"
    const leaveId = getLeaveIdFromUrl();

    if (!leaveId) {
        alert("ไม่พบ leaveId");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/update-leave-status`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                leaveId: leaveId,
                status: status
            })
        });

        let result = null;

        try {
            result = await response.json();
        } catch (err) {
            result = null;
        }

        if (!response.ok || (result && result.success === false)) {
            throw new Error(result?.message || "อัปเดตสถานะไม่สำเร็จ");
        }

        alert(status === "approved" ? "อนุมัติสำเร็จ" : "ไม่อนุมัติสำเร็จ");
        window.location.href = "teacher-dashboard.html";
    } catch (err) {
        console.error("submitApproval error:", err);
        alert(err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
}

function getLeaveIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("leaveId");
}

function openPhoto(photoPath) {
    window.open(`TeacherViewPicture.html?file_path=${encodeURIComponent(photoPath)}`, "_blank");
}