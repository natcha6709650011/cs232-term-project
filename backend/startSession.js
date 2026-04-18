const { response, getBody, dynamodb } = require("./common");
const { v4: uuidv4 } = require("uuid");

//ชื่อตาราง
const USERS_TABLE = process.env.USERS_TABLE || "Users";
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "Sessions";

exports.handler = async (event) => {
  try {
    //อ่านข้อมูลจาก request
    const body = getBody(event);

    const {
      line_user_id,   // id อาจารย์
      class_id,       // id วิชา/คาบ
      course_id,      // รหัสวิชา
      course_name,    // ชื่อวิชา
      section,        // section
      start_time,     // เวลาเริ่มเรียน
      end_time,       // เวลาจบเรียน
      student_count,  // จำนวน นศ
      type,           // onsite / online / cancel
      latitude,
      longitude
    } = body;

    //เช็คข้อมูลพื้นฐาน
    if (!line_user_id || !class_id || !type) {
      return response(400, {
        success: false,
        message: "missing required fields"
      });
    }

    //เช็ค type
    const allowedTypes = ["onsite", "online", "cancel"];
    if (!allowedTypes.includes(type)) {
      return response(400, {
        success: false,
        message: "invalid type"
      });
    }

    //ถ้า onsite ต้องมี location
    if (type === "onsite" && (latitude == null || longitude == null)) {
      return response(400, {
        success: false,
        message: "onsite class must have location"
      });
    }

    //ดึง user จาก Users table
    const userResult = await dynamodb.get({
      TableName: USERS_TABLE,
      Key: { line_user_id }
    }).promise();

    const user = userResult.Item;

    //ไม่เจอ user
    if (!user) {
      return response(404, {
        success: false,
        message: "user not found"
      });
    }

    //ไม่ใช่อาจารย์
    if (user.role !== "teacher") {
      return response(403, {
        success: false,
        message: "only teacher can start session"
      });
    }

    //เตรียมข้อมูล session
    const teacher_id = line_user_id;
    const session_id = uuidv4();

    const now = Date.now();
    const expire_at = now + 30 * 60 * 1000; // 30 นาที

    let status = "active";
    if (type === "cancel") {
      status = "cancelled";
    }

    //รวมข้อมูล class + session
    const sessionItem = {
      session_id,
      teacher_id,
      teacher_name: user.name_th || user.name_en || user.username || null,

      //class info
      class_id,
      course_id,
      course_name,
      section,
      start_time,
      end_time,
      student_count,

      //session info
      type,
      status,
      latitude: type === "onsite" ? latitude : null,
      longitude: type === "onsite" ? longitude : null,

      created_at: now,
      expire_at
    };

    //บันทึกลง DynamoDB
    await dynamodb.put({
      TableName: SESSIONS_TABLE,
      Item: sessionItem
    }).promise();

    //สร้าง check-in link
    const checkin_link =
      type === "cancel"
        ? null
        : `https://your-liff-url.com/checkin?session_id=${session_id}`;

    // 🔹 10) ส่ง response กลับ
    return response(200, {
      success: true,
      message: "session created",
      data: {
        session_id,
        teacher_id,
        teacher_name: sessionItem.teacher_name,
        class_id,
        course_name,
        section,
        type,
        status,
        expire_at,
        checkin_link
      }
    });

  } catch (error) {
    console.error("START SESSION ERROR:", error);

    return response(500, {
      success: false,
      message: "internal server error"
    });
  }
};