const { response, getBody, dynamodb } = require("./common");

const USERS_TABLE = process.env.USERS_TABLE || "Users";
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "Sessions";
const ATTENDANCE_TABLE = process.env.ATTENDANCE_TABLE || "Attendance";

exports.handler = async (event) => {
  try {
    // อ่านข้อมูลจาก request
    const body = getBody(event);

    const {
      line_user_id,   // line user id ของนักศึกษา
      session_id,     // id ของ session ที่จะลา
      reason,         // เหตุผลการลา
      attachment_url  // รูปภาพหรือเอกสารประกอบการลา (ถ้ามี)
    } = body;

    // เช็คข้อมูลพื้นฐาน
    if (!line_user_id || !session_id || !reason) {
      return response(400, {
        success: false,
        message: "missing line_user_id, session_id or reason"
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
        message: "only students can submit leave"
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

    // ถ้าคลาสถูกยกเลิกไม่ต้องลา
    if (session.status === "cancelled") {
      return response(400, {
        success: false,
        message: "class is cancelled"
      });
    }

    // ถ้า session ไม่ active ก็ลาไม่ได้
    if (session.status !== "active") {
      return response(400, {
        success: false,
        message: "session is not active"
      });
    }

    // ถ้า session หมดเวลาแล้วก็ลาไม่ได้
    if (Date.now() > session.expire_at) {
      return response(400, {
        success: false,
        message: "session has expired"
      });
    }

    // กันส่งซ้ำ
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
        message: "attendance record already exists"
      });
    }

    // เตรียมข้อมูลการลา
    const leaveItem = {
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

      // สถานะ
      status: "leave",

      // รายละเอียดการลา
      reason,
      attachment_url: attachment_url || null,

      // เวลาที่ส่งลา
      leave_time: Date.now()
    };

    // บันทึกการลาใน Attendance table
    await dynamodb.put({
      TableName: ATTENDANCE_TABLE,
      Item: leaveItem
    }).promise();

    // ส่งผลกลับ frontend
    return response(200, {
      success: true,
      message: "leave submitted successfully",
      data: leaveItem
    });

  } catch (err) {
    console.error("LEAVE ERROR:", err);

    return response(500, {
      success: false,
      message: "internal server error"
    });
  }
};