const { response, dynamodb } = require("./common");

const CLASSES_TABLE = process.env.CLASSES_TABLE || "Classes";

//ฟังก์ชันเช็คว่าวันนี้ตรงกับวันเรียนหรือไม่
function isTodayClass(day) {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];

  const today = days[new Date().getDay()];
  return day === today;
}

//ฟังก์ชันแปลงเวลา HH:MM เป็นจำนวนนาที
function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;

  const [hour, minute] = timeStr.split(":").map(Number);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

//ฟังก์ชันเช็คว่าตอนนี้อยู่ในช่วงเวลาเรียนไหม
function isInTimeRange(start_time, end_time) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const startMinutes = timeToMinutes(start_time);
  const endMinutes = timeToMinutes(end_time);

  if (startMinutes === null || endMinutes === null) {
    return false;
  }

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

exports.handler = async (event) => {
  try {
    // รับ line_user_id จาก path parameter
    const line_user_id = event.pathParameters?.line_user_id;

    if (!line_user_id) {
      return response(400, {
        success: false,
        message: "line_user_id is required"
      });
    }

    //ดึงวิชาทั้งหมดของอาจารย์จาก Classes table
    //scan + filter ก่อน เพราะง่ายสุดสำหรับงานนี้
    const result = await dynamodb.scan({
      TableName: CLASSES_TABLE,
      FilterExpression: "teacher_line_user_id = :tid",
      ExpressionAttributeValues: {
        ":tid": line_user_id
      }
    }).promise();

    const classes = result.Items || [];

    //ถ้าไม่เจอวิชาเลย
    if (classes.length === 0) {
      return response(404, {
        success: false,
        message: "no class found for this teacher"
      });
    }

    //หา class ที่ตรงวันและอยู่ในช่วงเวลาเรียนตอนนี้
    let currentClass = null;

    for (const cls of classes) {
      const sameDay = isTodayClass(cls.day);
      const inTime = isInTimeRange(cls.start_time, cls.end_time);

      if (sameDay && inTime) {
        currentClass = cls;
        break;
      }
    }

    //ถ้าไม่เจอ class ที่กำลังเรียนตอนนี้
    //ใช้วิชาแรกเป็น fallback เพื่อให้ frontend ยังมีข้อมูลไว้ demo ได้
    if (!currentClass) {
      currentClass = classes[0];
    }

    //ส่งข้อมูลกลับไปให้ frontend
    return response(200, {
      success: true,
      message: "class info loaded successfully",
      data: {
        class_id: currentClass.class_id || null,
        course_id: currentClass.course_id || null,
        course_name: currentClass.course_name || null,
        section: currentClass.section || null,
        day: currentClass.day || null,
        start_time: currentClass.start_time || null,
        end_time: currentClass.end_time || null,
        student_count: currentClass.student_count || 0
      }
    });

  } catch (error) {
    console.error("GET CLASS INFO ERROR:", error);

    return response(500, {
      success: false,
      message: "internal server error"
    });
  }
};