const { response, dynamodb } = require("./common");

const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "Sessions";
const ATTENDANCE_TABLE = process.env.ATTENDANCE_TABLE || "Attendance";
const CLASS_ROSTER_TABLE = process.env.CLASS_ROSTER_TABLE || "ClassRoster";

exports.handler = async () => {
  try {
    const now = Date.now();

    //ดึง session ที่ยัง active ทั้งหมด
    const sessionsResult = await dynamodb.scan({
      TableName: SESSIONS_TABLE,
      FilterExpression: "#st = :active",
      ExpressionAttributeNames: {
        "#st": "status"
      },
      ExpressionAttributeValues: {
        ":active": "active"
      }
    }).promise();

    const sessions = sessionsResult.Items || [];
    let processed_sessions = 0;

    //วนทีละ session
    for (const session of sessions) {
      // ทำเฉพาะ session ที่หมดเวลาแล้ว
      if (now <= session.expire_at) {
        continue;
      }

      //ต้องมี class_id เพื่อไปหารายนักศึกษาในคาบ
      if (!session.class_id) {
        continue;
      }

      //ดึงรายชื่อนักศึกษาทั้งหมดของ class นี้
      const rosterResult = await dynamodb.query({
        TableName: CLASS_ROSTER_TABLE,
        KeyConditionExpression: "class_id = :cid",
        ExpressionAttributeValues: {
          ":cid": session.class_id
        }
      }).promise();

      const roster = rosterResult.Items || [];

      //ดึง attendance ทั้งหมดของ session นี้
      const attendanceResult = await dynamodb.query({
        TableName: ATTENDANCE_TABLE,
        KeyConditionExpression: "session_id = :sid",
        ExpressionAttributeValues: {
          ":sid": session.session_id
        }
      }).promise();

      const attendanceItems = attendanceResult.Items || [];

      //สร้าง set ของ line_user_id ที่มี record แล้ว
      const existingUserIds = new Set(
        attendanceItems.map(item => item.line_user_id)
      );

      //คนที่ไม่มี record เลย = absent
      for (const student of roster) {
        if (!existingUserIds.has(student.line_user_id)) {
          const absentItem = {
            session_id: session.session_id,
            line_user_id: student.line_user_id,

            //ข้อมูลนักศึกษา
            student_username: student.username || null,
            student_name: student.student_name || student.name_th || null,
            student_email: student.email || null,

            //ข้อมูลคาบ
            class_id: session.class_id || null,
            course_id: session.course_id || null,
            course_name: session.course_name || null,
            section: session.section || null,

            //สถานะ
            status: "absent",
            absent_time: now
          };

          await dynamodb.put({
            TableName: ATTENDANCE_TABLE,
            Item: absentItem
          }).promise();
        }
      }

      //ปิด session หลังสรุปเสร็จ
      await dynamodb.update({
        TableName: SESSIONS_TABLE,
        Key: {
          session_id: session.session_id
        },
        UpdateExpression: "SET #st = :closed",
        ExpressionAttributeNames: {
          "#st": "status"
        },
        ExpressionAttributeValues: {
          ":closed": "closed"
        }
      }).promise();

      processed_sessions += 1;
    }

    //ส่งผลกลับ
    return response(200, {
      success: true,
      message: "auto summary completed",
      data: {
        processed_sessions
      }
    });

  } catch (error) {
    console.error("AUTO SUMMARY ERROR:", error);

    return response(500, {
      success: false,
      message: "internal server error"
    });
  }
};