// 1. กำหนดค่าเริ่มต้น (เดี๋ยวเอา URL จริงจากเพื่อนมาใส่)
const API_BASE_URL = "https://9y8xshv9ek.execute-api.us-east-1.amazonaws.com"; 
let currentClassId = ""; // เก็บไว้ใช้ตอนส่ง Start Session

// 2. ฟังก์ชันดึงข้อมูลวิชามาโชว์ (ยิงไปที่ getClassInfo)
async function fetchClassData() {
    try {
        // ในงานจริง line_user_id จะได้มาจาก LIFF ของเพื่อน
        const lineUserId = "U123456789"; 
        
        const response = await fetch(`${API_BASE_URL}/class/${lineUserId}`);
        const result = await response.json();

        if (result.success) {
            const data = result.data;
            
            // เอาข้อมูลไปแปะใน HTML ตาม ID ที่ตั้งไว้
            document.getElementById('course-id').innerText = data.course_id;
            document.getElementById('course-name').innerText = data.course_name;
            document.getElementById('section').innerText = data.section;
            document.getElementById('time-range').innerText = `${data.start_time} - ${data.end_time}`;
            document.getElementById('student-count').innerText = `${data.student_count} คน`;
            
            currentClassId = data.class_id; // เก็บ ID ไว้ส่งต่อ
        }
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

// 3. ฟังก์ชันกดยืนยันเพื่อเริ่ม Session
document.getElementById('btn-confirm').addEventListener('click', async () => {
    // ขอพิกัด GPS ก่อนส่ง (สำหรับคาบ Onsite)
    navigator.geolocation.getCurrentPosition(async (position) => {
        const payload = {
            line_user_id: "U123456789", // Mock ไว้ก่อน
            class_id: currentClassId,
            type: "onsite",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
        };

        try {
            const response = await fetch(`${API_BASE_URL}/start-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.success) {
                alert("เริ่มคาบเรียนเรียบร้อยแล้ว!");
                // ตรงนี้อาจจะสั่งเปลี่ยนหน้าไปหน้าถัดไป (หน้า 5)
            } else {
                alert("ผิดพลาด: " + result.message);
            }
        } catch (error) {
            alert("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
        }
    }, (err) => {
        alert("กรุณาเปิด GPS เพื่อยืนยันการเริ่มคาบเรียน");
    });
});

// ฟังก์ชันสำหรับปิดหน้าจอ (ถ้าใช้ใน LINE LIFF)
function closeLiff() {
    // ถ้ามีการเชื่อมต่อ LIFF แล้ว ให้ใช้คำสั่งนี้
    if (typeof liff !== 'undefined') {
        liff.closeWindow();
    } else {
        // ถ้าเปิดใน Browser ธรรมดา ให้โชว์ Alert แทน (เพราะ Browser ไม่อนุญาตให้ script สั่งปิดหน้าต่างที่ไม่ได้เปิดโดย script)
        alert("ปิดหน้าต่างนี้ (ใน LINE จะปิด LIFF ทันที)");
    }
}

// รันฟังก์ชันโหลดข้อมูลทันทีที่เปิดหน้าเว็บ
fetchClassData();
