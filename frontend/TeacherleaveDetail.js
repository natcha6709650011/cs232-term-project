// ฟังก์ชันรับข้อมูลการลามาแสดงผล (เว้นช่องไว้รับจาก DB)
function renderLeaveDetail(data) {
    // data ควรเป็น Object เช่น { name: "...", studentId: "...", reason: "..." }
    document.getElementById('std-name').innerText = data.name || "ไม่ระบุชื่อ";
    document.getElementById('std-id').innerText = data.studentId || "-";
    document.getElementById('leave-type').innerText = data.type || "-";
    document.getElementById('leave-reason').innerText = data.reason || "-";
    
    // ถ้ามีรูปแนบมาด้วย
    if (data.photoPath) {
        // เรียกฟังก์ชันจาก API เพื่อนเพื่อโชว์รูป
        fetchViewUrl(data.photoPath);
    }
}

async function fetchViewUrl(path) {
    const res = await fetch(`https://w763mkyzm5.execute-api.us-east-1.amazonaws.com/default/generate-view-url?file_path=${path}`);
    const url = await res.text();
    document.getElementById('evidence-img').src = url;
}

// TeacherleaveDetail.js — เพิ่มฟังก์ชันนี้เข้าไป

async function submitApproval(status) {
    // status = "approved" หรือ "rejected"
    
    const leaveId = getLeaveIdFromUrl(); // รับ leaveId จาก URL
    
    try {
        const response = await fetch("https://xxxxxxx.execute-api.us-east-1.amazonaws.com/default/update-leave-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                leaveId: leaveId,
                status: status
            })
        });

        if (response.ok) {
            alert(status === "approved" ? "อนุมัติสำเร็จ" : "ไม่อนุมัติสำเร็จ");
            window.close(); // หรือ redirect กลับ
        }
    } catch (err) {
        alert("เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
}

function getLeaveIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('leaveId');
}

// เพิ่มใน TeacherleaveDetail.js
function openPhoto(photoPath) {
    window.open(`TeacherViewPicture.html?file_path=${encodeURIComponent(photoPath)}`);
}