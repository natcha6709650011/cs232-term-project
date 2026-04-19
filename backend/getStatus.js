const { response, dynamodb } = require("./common");

const ATTENDANCE_TABLE = process.env.ATTENDANCE_TABLE || "Attendance";
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "Sessions";

exports.handler = async (event) => {
  try {
    // รับ session_id จาก path parameter
    const session_id = event.pathParameters?.session_id;

    if (!session_id) {
      return response(400, {
        success: false,
        message: "session_id is required"
      });
    }

    // เช็คว่า session มีอยู่จริงไหม
    const sessionResult = await dynamodb.get({
      TableName: SESSIONS_TABLE,
      Key: { session_id }
    }).promise();

    const session = sessionResult.Item;

    if (!session) {
      return response(404, {
        success: false,
        message: "session not found"
      });
    }

    // ดึง attendance ของ session นี้ทั้งหมด
    const attendanceResult = await dynamodb.query({
      TableName: ATTENDANCE_TABLE,
      KeyConditionExpression: "session_id = :sid",
      ExpressionAttributeValues: {
        ":sid": session_id
      }
    }).promise();

    const items = attendanceResult.Items || [];

    // นับจำนวนแต่ละสถานะ
    const presentList = items.filter(i => i.status === "present");
    const leaveList = items.filter(i => i.status === "leave");
    const absentList = items.filter(i => i.status === "absent");

    // ส่ง response กลับ
    return response(200, {
      success: true,
      message: "status loaded successfully",
      data: {
        session_id,
        class_id: session.class_id || null,
        course_id: session.course_id || null,
        course_name: session.course_name || null,
        section: session.section || null,
        type: session.type || null,
        session_status: session.status || null,

        summary: {
          present_count: presentList.length,
          leave_count: leaveList.length,
          absent_count: absentList.length,
          total_record_count: items.length
        },

        students: items
      }
    });

  } catch (error) {
    console.error("GET STATUS ERROR:", error);

    return response(500, {
      success: false,
      message: "internal server error"
    });
  }
};