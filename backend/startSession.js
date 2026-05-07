const { response, getBody, dynamodb } = require("./common");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");

const USERS_TABLE = process.env.USERS_TABLE || "Users";
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "Sessions";
const ROSTER_TABLE = process.env.ROSTER_TABLE || "ClassRoster";
const CLASSES_TABLE = process.env.CLASSES_TABLE || "Classes";

exports.handler = async (event) => {
  try {
    const body = getBody(event);

    const {
      line_user_id,
      type,
      latitude,
      longitude,
      class_id,
      course_id,
      course_name,
      section,
      start_time,
      end_time,
      student_count
    } = body;

    const teacherLatitude = Number(latitude || body.teacher_latitude);
    const teacherLongitude = Number(longitude || body.teacher_longitude);

    if (!line_user_id || !type) {
      return response(400, {
        success: false,
        message: "missing line_user_id or type"
      });
    }

    if (!["onsite", "online", "cancel"].includes(type)) {
      return response(400, {
        success: false,
        message: "invalid session type"
      });
    }

    if (
      type === "onsite" &&
      (
        !teacherLatitude ||
        !teacherLongitude ||
        Number.isNaN(teacherLatitude) ||
        Number.isNaN(teacherLongitude)
      )
    ) {
      return response(400, {
        success: false,
        message: "onsite class must have latitude and longitude"
      });
    }

    const userResult = await dynamodb
      .get({
        TableName: USERS_TABLE,
        Key: {
          line_user_id
        }
      })
      .promise();

    const user = userResult.Item;

    if (!user) {
      return response(404, {
        success: false,
        message: "user not found"
      });
    }

    if (user.role !== "employee" && user.type !== "employee") {
      return response(403, {
        success: false,
        message: "only teacher can start session"
      });
    }

    const teacher_id = line_user_id;

    let classInfo = null;

    if (class_id) {
      try {
        const classResult = await dynamodb
          .get({
            TableName: CLASSES_TABLE,
            Key: {
              class_id
            }
          })
          .promise();

        classInfo = classResult.Item || null;
      } catch (err) {
        console.error("Error fetching class info:", err);
      }
    }

    const session_id = uuidv4();

    const now = Date.now();
    const expire_at = now + 30 * 60 * 1000;

    const status = type === "cancel" ? "cancelled" : "active";

    const sessionItem = {
      session_id,

      teacher_id,
      teacher_line_user_id: line_user_id,
      teacher_name: user.name_th || user.name_en || user.username || null,

      class_id: class_id || "CS232_SEC01",
      course_id: course_id || classInfo?.course_id || "CS232",
      course_name:
        course_name ||
        classInfo?.course_name ||
        "CS232 INTRODUCTION TO CLOUD COMPUTING TECHNOLOGY",
      section: section || classInfo?.section || "650001",
      start_time: start_time || classInfo?.start_time || "09.30",
      end_time: end_time || classInfo?.end_time || "12.30",
      student_count: student_count || classInfo?.student_count || 0,

      type,
      status,

      latitude: type === "onsite" ? teacherLatitude : null,
      longitude: type === "onsite" ? teacherLongitude : null,
      teacher_latitude: type === "onsite" ? teacherLatitude : null,
      teacher_longitude: type === "onsite" ? teacherLongitude : null,
      teacher_location:
        type === "onsite"
          ? {
              latitude: teacherLatitude,
              longitude: teacherLongitude
            }
          : null,

      created_at: now,
      expire_at
    };

    await dynamodb
      .put({
        TableName: SESSIONS_TABLE,
        Item: sessionItem
      })
      .promise();

    const checkin_link =
      type === "cancel"
        ? null
        : `https://main.d1d25usb5e0o4s.amplifyapp.com/frontend/checkin.html?session_id=${encodeURIComponent(session_id)}`;

    let studentList = [];

    if (type !== "cancel") {
      try {
        const rosterResult = await dynamodb
          .query({
            TableName: ROSTER_TABLE,
            IndexName: "class_id-index",
            KeyConditionExpression: "class_id = :cid",
            ExpressionAttributeValues: {
              ":cid": sessionItem.class_id
            }
          })
          .promise();

        studentList = (rosterResult.Items || []).map((item) => item.line_user_id);
      } catch (err) {
        console.error("Error fetching roster:", err);
      }
    }

    if (studentList.length > 0 && process.env.WEBHOOK_URL) {
      try {
        await axios.post(process.env.WEBHOOK_URL, {
          action: "notify_students",
          students: studentList,
          sessionDetails: {
            course_name: sessionItem.course_name,
            checkin_link
          }
        });
      } catch (err) {
        console.error("Failed to notify:", err);
      }
    }

    return response(200, {
      success: true,
      message: type === "cancel" ? "class cancelled" : "session created",
      data: {
        session_id,

        teacher_id,
        teacher_line_user_id: line_user_id,
        teacher_name: sessionItem.teacher_name,

        class_id: sessionItem.class_id,
        course_id: sessionItem.course_id,
        course_name: sessionItem.course_name,
        section: sessionItem.section,

        type,
        status,

        latitude: sessionItem.latitude,
        longitude: sessionItem.longitude,
        teacher_latitude: sessionItem.teacher_latitude,
        teacher_longitude: sessionItem.teacher_longitude,
        teacher_location: sessionItem.teacher_location,

        created_at: now,
        expire_at,

        checkin_link
      }
    });
  } catch (error) {
    console.error("startSession error:", error);

    return response(500, {
      success: false,
      message: "internal server error",
      error: error.message
    });
  }
};
