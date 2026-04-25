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

// teacher-GPS.js (Update)

// --- ฟังก์ชันที่มีอยู่แล้ว (ทวนให้เฉยๆ) ---
function finishProcess() {
    // แก้ไข: จากเดิมแค่ alert ให้เป็นคำสั่งปิดจริงๆ
    console.log("ปิดหน้าต่างหน้าจอ");
    if (typeof liff !== 'undefined' && liff.isInClient()) {
        liff.closeWindow(); // ปิดหน้าต่างภายในแอป LINE
    } else {
        window.close(); // ปิด Tab ธรรมดา (อาจจะไม่ทำงานในบาง Browser ถ้าไม่ได้เปิดด้วย script)
        alert("ปิดหน้าต่างสำเร็จ (ถ้าอยู่ในแอป LINE หน้าต่างจะปิดทันที)");
    }
}


// --- ฟังก์ชันที่ต้องเพิ่มใหม่ (New) ---

// ฟังก์ชันสำหรับดาวน์โหลดรูป QR Code (สำหรับปุ่ม "บันทึก")
async function downloadQRCode() {
    console.log("กำลังดาวน์โหลด QR Code...");
    const qrImage = document.getElementById('final-qr');
    const courseId = document.getElementById('res-course-id').innerText || "CS232";
    
    if (!qrImage.src) {
        alert("ไม่พบรูป QR Code");
        return;
    }

    try {
        // 1. ดึงข้อมูลรูปภาพจาก URL
        const response = await fetch(qrImage.src);
        const blob = await response.blob(); // แปลงเป็นข้อมูล Blob
        
        // 2. สร้างลิงก์ชั่วคราวสำหรับดาวน์โหลด
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        // 3. ตั้งชื่อไฟล์ (เช่น CS232_QRCode.png)
        a.download = `${courseId}_QRCode.png`;
        
        // 4. สั่งคลิกลิงก์เพื่อดาวน์โหลด
        document.body.appendChild(a);
        a.click();
        
        // 5. ล้างข้อมูลชั่วคราว
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        console.log("ดาวน์โหลดสำเร็จ");
    } catch (error) {
        console.error("ดาวน์โหลดล้มเหลว:", error);
        alert("ไม่สามารถดาวน์โหลดรูปภาพได้ กรุณาลองใหม่อีกครั้ง");
    }
}
