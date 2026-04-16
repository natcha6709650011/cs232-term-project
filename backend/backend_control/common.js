const AWS = require("aws-sdk");

// สร้างตัวเชื่อมต่อ DynamoDB
const dynamodb = new AWS.DynamoDB.DocumentClient();

//ฟังก์ชันสร้าง response กลับไป frontend (LIFF / Web) รองรับ CORS เพื่อให้เรียก API จาก browser ได้
function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",

      // อนุญาตให้ทุก domain เรียก API ได้ (สำหรับ LIFF)
      "Access-Control-Allow-Origin": "*",

      // อนุญาต header ที่ส่งมา
      "Access-Control-Allow-Headers": "Content-Type",

      // อนุญาต method ที่ใช้
      "Access-Control-Allow-Methods": "OPTIONS,GET,POST"
    },
    // แปลง object เป็น JSON string
    body: JSON.stringify(body)
  };
}

//ฟังก์ชันดึง body จาก requestใช้ parse JSON ที่ส่งมาจาก frontend
 
function getBody(event) {
  try {
    // ถ้ามี body → parse JSON
    return JSON.parse(event.body || "{}");
  } catch (error) {
    // ถ้า parse ไม่ได้ → return object ว่าง กัน error
    return {};
  }
}

//ฟังก์ชันคำนวณระยะทางระหว่าง GPS 2 จุด (หน่วย: เมตร)ใช้สูตร Haversine ใช้ในระบบ check-in เพื่อเช็คว่าอยู่ในระยะที่กำหนด 50 เมตร
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  // แปลงองศา → เรเดียน
  const toRad = (deg) => (deg * Math.PI) / 180;

  // รัศมีโลก (เมตร)
  const R = 6371000;

  // ความต่างของ latitude และ longitude
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  // สูตร Haversine
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  // คำนวณระยะทาง
  return 2 * R * Math.asin(Math.sqrt(a));
}

// export ออกไปให้ไฟล์อื่นเรียกใช้
module.exports = {
  dynamodb, // ใช้คุยกับฐานข้อมูล
  response, // ใช้ส่ง response กลับ frontend
  getBody, // ใช้อ่าน request
  haversineDistanceMeters // ใช้คำนวณระยะ GPS
};