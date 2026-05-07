const { response, dynamodb } = require("./common");

const ATTENDANCE_TABLE = process.env.ATTENDANCE_TABLE || "Attendance";
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "Sessions";
const ROSTER_TABLE = process.env.ROSTER_TABLE || "ClassRoster";

exports.handler = async (event) => {
  try {
    const session_id = event.pathParameters?.session_id;

    if (!session_id) {
      return response(400, {
        success: false,
        message: "session_id is required"
      });
    }

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

    const attendanceResult = await dynamodb.query({
      TableName: ATTENDANCE_TABLE,
      KeyConditionExpression: "session_id = :sid",
      ExpressionAttributeValues: {
        ":sid": session_id
      }
    }).promise();

    const items = attendanceResult.Items || [];

    let roster = [];
    if (session.class_id) {
      try {
        const rosterResult = await dynamodb.query({
          TableName: ROSTER_TABLE,
          IndexName: "class_id-index",
          KeyConditionExpression: "class_id = :cid",
          ExpressionAttributeValues: {
            ":cid": session.class_id
          }
        }).promise();
        roster = rosterResult.Items || [];
      } catch (err) {
        console.error("GET ROSTER ERROR:", err);
      }
    }

    const attendanceByStudent = new Map(items.map((item) => [item.line_user_id, item]));

    const students = roster.length > 0
      ? roster.map((student) => {
          const attendance = attendanceByStudent.get(student.line_user_id);
          return {
            line_user_id: student.line_user_id,
            username: student.username || student.student_username || null,
            student_name: student.student_name || student.name_th || student.username || null,
            status: attendance?.status || "absent",
            checkin_time: attendance?.checkin_time || null,
            leave_time: attendance?.leave_time || null,
            image_url: attendance?.image_url || null,
            leave_id: attendance?.leave_id || null,
            reason: attendance?.reason || null
          };
        })
      : items;

    const presentList = students.filter(i => i.status === "present");
    const lateList = students.filter(i => i.status === "late");
    const leaveList = students.filter(i => i.status === "leave");
    const absentList = students.filter(i => i.status === "absent");

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
          late_count: lateList.length,
          leave_count: leaveList.length,
          absent_count: absentList.length,
          total_student_count: roster.length || session.student_count || students.length,
          total_record_count: items.length
        },

        students
      }
    });
  } catch (error) {
    console.error("GET STATUS ERROR:", error);

    return response(500, {
      success: false,
      message: "internal server error",
      error: error.message
    });
  }
};
