let myLat = null;
let myLon = null;
let retryCount = 0;

window.onload = function() {
    requestGPS();
};

function requestGPS() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                myLat = pos.coords.latitude;
                myLon = pos.coords.longitude;
                document.getElementById('display-coords').innerText = `${myLat.toFixed(5)}, ${myLon.toFixed(5)}`;
                document.getElementById('geo-text').innerText = "พิกัดระบุเรียบร้อยแล้ว";
                const btn = document.getElementById('btn-confirm-gps');
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            },
            (err) => {
                document.getElementById('view-step-3-error').classList.remove('hidden');
            }
        );
    }
}

function hideAllViews() {
    const views = ['view-step-2', 'view-step-4', 'view-failed', 'view-step-3-error'];
    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

async function submitStep2() {
    // ในอนาคตเปลี่ยนเป็น true เพื่อทดสอบเคส Error จริงจาก Backend
    let isError = false; 

    if (isError) {
        showErrorPage();
    } else {
        hideAllViews();
        document.getElementById('view-step-4').classList.remove('hidden');
        
        // --- ส่วนที่เพิ่มใหม่สำหรับหยอดข้อมูล ---
        const dataFromDB = {
            courseId: "CS232",
            section: "650001",
            time: "09.30-12.30"
        };

        document.getElementById('res-course-id').innerText = dataFromDB.courseId;
        document.getElementById('res-section').innerText = dataFromDB.section;
        document.getElementById('res-time').innerText = `เวลา ${dataFromDB.time}`;
        // ----------------------------------
        const mockCheckinUrl = "https://line.me/R/oaMessage/@bot/?checkin=CS232_650001"; 
        document.getElementById('final-qr').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mockCheckinUrl)}`;
    }
}

function showErrorPage(forceCount = null) {
    hideAllViews();
    document.getElementById('view-failed').classList.remove('hidden');

    if (forceCount !== null) {
        retryCount = forceCount;
    } else {
        retryCount++;
    }

    const errorMsg = document.getElementById('error-msg');
    const btnRetry = document.getElementById('btn-retry');

    if (retryCount >= 3) {
        errorMsg.innerText = "กรุณาติดต่อเจ้าหน้าที่";
        btnRetry.innerText = "ติดต่อเจ้าหน้าที่";
        btnRetry.classList.remove('bg-orange-400'); 
        btnRetry.classList.add('bg-red-500');
        btnRetry.onclick = () => { window.location.href = "https://line.me/ti/p/@admin_tu"; };
    } else {
        errorMsg.innerText = "กรุณาลองใหม่อีกครั้ง";
        btnRetry.innerText = "ลองอีกครั้ง";
        btnRetry.classList.remove('bg-red-500');
        btnRetry.classList.add('bg-orange-400');
        btnRetry.onclick = handleRetry;
    }
}

function showStep(stepNum) {
    hideAllViews();
    if (stepNum === 4) {
        document.getElementById('view-step-4').classList.remove('hidden');
        document.getElementById('final-qr').src = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=TEST";
    }
}

function handleRetry() {
    hideAllViews();
    document.getElementById('view-step-2').classList.remove('hidden');
    requestGPS();
}

function closeError() {
    document.getElementById('view-step-3-error').classList.add('hidden');
}

function finishProcess() {
    if (typeof liff !== 'undefined' && liff.isInClient()) {
        liff.closeWindow();
    } else {
        alert("ปิดหน้าต่างสำเร็จ");
    }
}

async function downloadQRCode() {
    const qrImage = document.getElementById('final-qr');
    if (!qrImage.src) return;
    try {
        const response = await fetch(qrImage.src);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QRCode.png`;
        a.click();
    } catch (e) { alert("ดาวน์โหลดล้มเหลว"); }
}