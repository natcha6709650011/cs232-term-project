let currentPhotoPath = "";

function renderLeaveDetail(data) {
    document.getElementById('std-name').innerText = data.name || "ไม่ระบุชื่อ";
    document.getElementById('std-id').innerText = data.studentId || "-";
    document.getElementById('leave-type').innerText = data.type || "-";
    document.getElementById('leave-reason').innerText = data.reason || "-";

    if (data.photoPath) {
        currentPhotoPath = data.photoPath;
        fetchViewUrl(data.photoPath);
    }
}

async function fetchViewUrl(path) {
    const res = await fetch(`https://w763mkyzm5.execute-api.us-east-1.amazonaws.com/default/generate-view-url?file_path=${path}`);
    const url = await res.text();
    document.getElementById('evidence-img').src = url;
}

// ✅ เพิ่มตรงนี้
async function submitApproval(status) {
    const params = new URLSearchParams(window.location.search);
    const leaveId = params.get('leaveId');

    // ถ้าทดสอบใน PC ยังไม่มี leaveId ก็แจ้งให้รู้ก่อน
    if (!leaveId) {
        alert("ทดสอบบน PC: leaveId = null\nจริงๆ ต้องเปิดผ่าน LINE LIFF");
        return;
    }

    try {
        const response = await fetch("https://xxxxxxx.execute-api.us-east-1.amazonaws.com/default/update-leave-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leaveId, status })
        });

        if (response.ok) {
            alert(status === "approved" ? "✅ อนุมัติสำเร็จ" : "❌ ไม่อนุมัติสำเร็จ");
            window.close();
        } else {
            alert("เกิดข้อผิดพลาด กรุณาลองใหม่");
        }
    } catch (err) {
        alert("ไม่สามารถเชื่อมต่อได้: " + err.message);
    }
}

function openPhoto() {
    if (!currentPhotoPath) return;
    window.open(`TeacherViewPicture.html?file_path=${encodeURIComponent(currentPhotoPath)}`);
}

// ==============================
// 🧪 Mock ไว้ทดสอบ — ลบตอน deploy จริง
// ==============================
renderLeaveDetail({
    name: "มานะ ใจดี",
    studentId: "6401005678",
    type: "ลาป่วย",
    reason: "ป่วย มีไข้สูง ไปพบแพทย์",
    photoPath: "attendance/9bef1645-49e9-4bed-887f-20836fad43d9.jpg"
});