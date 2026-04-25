// ฟังก์ชันสำหรับดึง URL รูปภาพจาก API ที่เพื่อนให้มา
async function loadAttachment(filePath) {
    const apiEndpoint = "https://w763mkyzm5.execute-api.us-east-1.amazonaws.com/default/generate-view-url";
    try {
        const response = await fetch(`${apiEndpoint}?file_path=${filePath}`);
        const viewUrl = await response.text();
        
        const imgElement = document.getElementById('cert-image');
        imgElement.src = viewUrl;
        imgElement.classList.remove('hidden');
        document.getElementById('loading-text').classList.add('hidden');
    } catch (error) {
        console.error("Error loading image:", error);
        alert("ไม่สามารถโหลดรูปภาพได้");
    }
}

// ฟังก์ชันดาวน์โหลด
function downloadImage() {
    const imageUrl = document.getElementById('cert-image').src;
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = 'attachment.jpg';
    a.click();
}