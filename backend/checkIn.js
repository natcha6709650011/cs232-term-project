const { response, getBody, dynamodb, haversineDistanceMeters } = require("./common");

const USERS_TABLE = process.env.USERS_TABLE || "Users";
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "Sessions";
const ATTENDANCE_TABLE = process.env.ATTENDANCE_TABLE || "Attendance";

const CHECKIN_RADIUS_METERS = 50; // รัศมีเช็คอิน 50 เมตร

exports.handler = async (event) => {
  try {
    // อ่านข้อมูลจาก request
    const body = getBody(event);

    const {
      line_user_id, // line user id ของนักศึกษา
      session_id,   // id ของ session ที่จะเช็คอิน
      latitude,     // พิกัดตอนเช็คอิน
      longitude,    // พิกัดตอนเช็คอิน
      image_url     // รูปภาพตอนเช็คอิน
    } = body;

    // เช็คข้อมูลพื้นฐาน
    if (!line_user_id || !session_id) {
      return response(400, {
        success: false,
        message: "missing line_user_id or session_id"
      });
    }

    // ดึง user จาก Users table
    const userResult = await dynamodb.get({
      TableName: USERS_TABLE,
      Key: { line_user_id }
    }).promise();

    const user = userResult.Item;

    // ไม่เจอ user
    if (!user) {
      return response(404, {
        success: false,
        message: "user not found"
      });
    }

    // ต้องเป็น student เท่านั้น
    if (user.role !== "student") {
      return response(403, {
        success: false,
        message: "only students can check in"
      });
    }

    // ดึง session จาก Sessions table
    const sessionResult = await dynamodb.get({
      TableName: SESSIONS_TABLE,
      Key: { session_id }
    }).promise();

    const session = sessionResult.Item;

    // ไม่เจอ session
    if (!session) {
      return response(404, {
        success: false,
        message: "session not found"
      });
    }

    // เช็คสถานะ session
    if (session.status === "cancelled") {
      return response(400, {
        success: false,
        message: "class is cancelled"
      });
    }

    if (session.status !== "active") {
      return response(400, {
        success: false,
        message: "session is not active"
      });
    }

    // session หมดเวลาแล้ว
    if (Date.now() > session.expire_at) {
      return response(400, {
        success: false,
        message: "session has expired"
      });
    }

    // กันเช็คซ้ำ
    // Attendance table ใช้ PK = session_id, SK = line_user_id
    const existingAttendance = await dynamodb.get({
      TableName: ATTENDANCE_TABLE,
      Key: {
        session_id,
        line_user_id
      }
    }).promise();

    if (existingAttendance.Item) {
      return response(409, {
        success: false,
        message: "already checked in"
      });
    }

    // ต้องมีรูปเสมอ
    if (!image_url) {
      return response(400, {
        success: false,
        message: "image_url is required"
      });
    }

    // ถ้าเป็น onsite ต้องเช็คระยะ
    if (session.type === "onsite") {
      // ต้องมี location ของนักศึกษา
      if (latitude == null || longitude == null) {
        return response(400, {
          success: false,
          message: "onsite check-in requires latitude and longitude"
        });
      }

      // ต้องมี location ของอาจารย์ใน session
      if (session.latitude == null || session.longitude == null) {
        return response(500, {
          success: false,
          message: "teacher location not found in session"
        });
      }

      // คำนวณระยะทางระหว่างพิกัดอาจารย์กับนักศึกษา
      const distance = haversineDistanceMeters(
        session.latitude,
        session.longitude,
        latitude,
        longitude
      );

      // ตรวจสอบว่าอยู่ในรัศมี 50 เมตรหรือไม่
      if (distance > CHECKIN_RADIUS_METERS) {
        return response(400, {
          success: false,
          message: "out of allowed range",
          data: {
            distance_meters: Math.round(distance),
            allowed_meters: CHECKIN_RADIUS_METERS
          }
        });
      }
    }

    // เตรียมข้อมูล attendance ที่จะบันทึก
    const attendanceItem = {
      session_id,
      line_user_id,

      // ข้อมูลนักศึกษา
      student_username: user.username || null,
      student_name: user.name_th || user.name_en || user.username || null,
      student_email: user.email || null,

      // ข้อมูลคาบ
      class_id: session.class_id || null,
      course_id: session.course_id || null,
      course_name: session.course_name || null,
      section: session.section || null,

      // ผลการเช็คชื่อ
      status: "present",

      // ตำแหน่งและรูปภาพ
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      image_url,

      // เวลาเช็คชื่อ
      checkin_time: Date.now()
    };

    // บันทึกลง DynamoDB
    await dynamodb.put({
      TableName: ATTENDANCE_TABLE,
      Item: attendanceItem
    }).promise();

    // ส่ง response กลับ
    return response(200, {
      success: true,
      message: "check-in success",
      data: attendanceItem
    });

  } catch (error) {
    console.error("CHECK-IN ERROR:", error);

    return response(500, {
      success: false,
      message: "internal server error"
    });
  }
};