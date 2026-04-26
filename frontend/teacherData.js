// 1. กำหนดค่าเริ่มต้น
const API_BASE_URL = "https://26vfnfp8b5.execute-api.us-east-1.amazonaws.com";
// ADDED: LIFF ID ตัวจริงจาก LINE Developers
const LIFF_ID = "2009731150-FBugBxC4";
let currentClassId = ""; // เก็บไว้ใช้ตอนส่ง Start Session
let activeLineUserId = "";

// ADDED: ดึง line_user_id จริงของอาจารย์จาก LIFF แล้วเก็บไว้ใช้ทั้งหน้า
async function initializeTeacherLiff() {
    if (typeof liff !== "undefined") {
        try {
            await liff.init({ liffId: LIFF_ID });

            if (!liff.isLoggedIn()) {
                liff.login();
                return "";
            }

            const profile = await liff.getProfile();

            if (profile?.userId) {
                activeLineUserId = profile.userId;
                localStorage.setItem("line_user_id", profile.userId);
                localStorage.setItem("line_profile", JSON.stringify(profile));
                return profile.userId;
            }
        } catch (error) {
            console.warn("teacher LIFF init failed:", error);
        }
    }

    const savedLineUserId = localStorage.getItem("line_user_id");

    if (savedLineUserId) {
        activeLineUserId = savedLineUserId;
        return savedLineUserId;
    }

    return "";
}

// 2. ฟังก์ชันดึงข้อมูลวิชามาโชว์ (ยิงไปที่ getClassInfo)
async function fetchClassData() {
    try {
        // ADDED: ใช้ line_user_id จริงจาก LIFF/localStorage แทน mock
        const lineUserId = await initializeTeacherLiff();
        if (!lineUserId) {
            console.warn("ยังไม่พบ line_user_id ของอาจารย์");
            return;
        }
        
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
        const lineUserId = await initializeTeacherLiff();

        if (!lineUserId) {
            alert("ยังไม่พบ line_user_id ของอาจารย์");
            return;
        }

        const payload = {
            // ADDED: ใช้ line_user_id จริงจาก LIFF/localStorage
            line_user_id: lineUserId,
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
initializeTeacherLiff().then(fetchClassData);