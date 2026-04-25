let myLat = null;
let myLon = null;

// เมื่อเปิดหน้าจอมาปุ๊บ ให้ขอ GPS ทันที (นี่คือ Step 3 ในรูป คือการขอ Consent)
window.onload = function() {
    requestGPS();
};

function requestGPS() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                // ถ้าอาจารย์กด "Allow"
                myLat = pos.coords.latitude;
                myLon = pos.coords.longitude;
                
                // อัปเดตหน้าจอ Step 2
                document.getElementById('display-coords').innerText = `${myLat.toFixed(5)}, ${myLon.toFixed(5)}`;
                document.getElementById('geo-text').innerText = "พิกัดระบุเรียบร้อยแล้ว";
                
                // เปิดให้กดปุ่มยืนยันได้
                const btn = document.getElementById('btn-confirm-gps');
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            },
            (err) => {
                // ถ้าอาจารย์กด "Don't Allow" หรือเกิด Error
                document.getElementById('view-step-3-error').classList.remove('hidden');
            }
        );
    }
}

// เมื่อกดยืนยันจากหน้า 2 (Locations) เพื่อไปหน้า 4 (สำเร็จ)
async function submitStep2() {
    // 1. ตรงนี้ต้องยิง API ไปหา Backend (startSession)
    // เพื่อน Backend จะส่ง URL สำหรับเช็คชื่อกลับมา
    const mockCheckinUrl = "https://line.me/R/oaMessage/@bot/?checkin=CS232_650001"; 

    // 2. เปลี่ยนหน้า
    document.getElementById('view-step-2').classList.add('hidden');
    document.getElementById('view-step-4').classList.remove('hidden');

    // 3. เจน QR Code และข้อมูลม็อคอัพ
    document.getElementById('final-qr').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mockCheckinUrl)}`;
    document.getElementById('res-course-id').innerText = "CS232";
    document.getElementById('res-section').innerText = "Section 650001";
    document.getElementById('res-time').innerText = "เวลา 09.30-12.30";
}

function closeError() {
    document.getElementById('view-step-3-error').classList.add('hidden');
}

function finishProcess() {
    alert("ระบบกำลังปิดหน้าจอ...");
    // liff.closeWindow(); // ถ้าเชื่อม LINE แล้วใช้คำสั่งนี้
}

