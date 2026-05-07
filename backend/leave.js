const { response, getBody, dynamodb } = require("./common");
const { v4: uuidv4 } = require("uuid");

const USERS_TABLE = process.env.USERS_TABLE || "Users";
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "Sessions";
const ATTENDANCE_TABLE = process.env.ATTENDANCE_TABLE || "Attendance";
const LEAVE_TABLE = process.env.LEAVE_TABLE || "Leave";

function normalizeLeaveType(type) {
  if (!type) return "ลากิจ";
  const value = String(type).trim();
  if (["sick", "ลาป่วย"].includes(value)) return "ลาป่วย";
  if (["personal", "ลากิจ"].includes(value)) return "ลากิจ";
  return value;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return response(200, { success: true });
    }

    const body = getBody(event);

    const {
      line_user_id,
      session_id,
      class_id,
      course_id,
      course_name,
      section,
      leave_date,
      type,
      reason,
      note,
      attachment_url,
      attachment_name
    } = body;

    if (!line_user_id || !leave_date || !reason) {
      return response(400, {
        success: false,
        message: "missing line_user_id, leave_date or reason"
      });
    }

    if (!session_id && !class_id) {
      return response(400, {
        success: false,
        message: "missing class_id or session_id"
      });
    }

    const userResult = await dynamodb.get({
      TableName: USERS_TABLE,
      Key: { line_user_id }
    }).promise();

    const user = userResult.Item;

    if (!user) {
      return response(404, {
        success: false,
        message: "user not found"
      });
    }

    if (user.role !== "student") {
      return response(403, {
        success: false,
        message: "only students can submit leave"
      });
    }

    let session = null;

    // session_id เป็น optional แล้ว: ใช้เฉพาะกรณีอาจารย์เปิดคลาสอยู่
    if (session_id) {
      const sessionResult = await dynamodb.get({
        TableName: SESSIONS_TABLE,
        Key: { session_id }
      }).promise();

      session = sessionResult.Item || null;

      if (!session) {
        return response(404, {
          success: false,
          message: "session not found"
        });
      }

      if (session.status === "cancelled") {
        return response(400, {
          success: false,
          message: "class is cancelled"
        });
      }
    }

    const leaveType = normalizeLeaveType(type);
    const now = Date.now();
    const leave_id = uuidv4();

    const leaveItem = {
      leave_id,
      line_user_id,
      session_id: session_id || null,

      student_username: user.username || null,
      student_name: user.name_th || user.name_en || user.username || null,
      student_email: user.email || null,

      class_id: class_id || session?.class_id || null,
      course_id: course_id || session?.course_id || null,
      course_name: course_name || session?.course_name || null,
      section: section || session?.section || null,

      leave_date,
      leave_type: leaveType,
      status: "pending",
      reason,
      note: note || null,
      attachment_url: attachment_url || null,
      attachment_name: attachment_name || null,
      created_at: now,
      updated_at: now
    };

    // บันทึกคำขอลงตาราง Leave เสมอ เพื่อให้อาจารย์มาอนุมัติ/ดูหลักฐานภายหลังได้
    await dynamodb.put({
      TableName: LEAVE_TABLE,
      Item: leaveItem
    }).promise();

    // ถ้ามี session_id ให้ลง Attendance เป็น leave ด้วย เพื่อให้หน้าสรุปคาบนั้นนับจำนวนลาได้ทันที
    if (session_id) {
      const existingAttendance = await dynamodb.get({
        TableName: ATTENDANCE_TABLE,
        Key: { session_id, line_user_id }
      }).promise();

      if (!existingAttendance.Item) {
        await dynamodb.put({
          TableName: ATTENDANCE_TABLE,
          Item: {
            session_id,
            line_user_id,
            leave_id,
            student_username: leaveItem.student_username,
            student_name: leaveItem.student_name,
            student_email: leaveItem.student_email,
            class_id: leaveItem.class_id,
            course_id: leaveItem.course_id,
            course_name: leaveItem.course_name,
            section: leaveItem.section,
            status: "leave",
            leave_type: leaveType,
            reason,
            attachment_url: attachment_url || null,
            leave_time: now,
            checkin_time: now
          }
        }).promise();
      }
    }

    return response(200, {
      success: true,
      message: "leave submitted successfully",
      data: leaveItem
    });
  } catch (err) {
    console.error("LEAVE ERROR:", err);

    return response(500, {
      success: false,
      message: "internal server error",
      error: err.message
    });
  }
};
