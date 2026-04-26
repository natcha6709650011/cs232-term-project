// import helper จากไฟล์ common.js
// response = ใช้สร้าง HTTP response
// getBody = ใช้แปลง event.body ให้เป็น object
// dynamodb = DynamoDB DocumentClient ที่ตั้งค่าไว้ใน common.js
const { response, getBody, dynamodb } = require("./common");

// import uuidv4 สำหรับสร้าง session_id แบบไม่ซ้ำ
const { v4: uuidv4 } = require("uuid");

const axios = require("axios");

// กำหนดชื่อตาราง Users จาก environment variable
// ถ้าไม่มี env จะใช้ชื่อ "Users"
const USERS_TABLE = process.env.USERS_TABLE || "Users";

// กำหนดชื่อตาราง Sessions จาก environment variable
// ถ้าไม่มี env จะใช้ชื่อ "Sessions"
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "Sessions";

const ROSTER_TABLE = process.env.ROSTER_TABLE || "ClassRoster";

// Lambda handler หลักของไฟล์ startSession
exports.handler = async (event) => {
  try {
    // แปลง body ที่ frontend ส่งมาให้เป็น object
    const body = getBody(event);

    // ดึงข้อมูลจาก body
    const {
      // LINE user id ของอาจารย์
      line_user_id,

      // ประเภท session: onsite / online / cancel
      type,

      // latitude ของอาจารย์ ใช้เฉพาะ onsite
      latitude,

      // longitude ของอาจารย์ ใช้เฉพาะ onsite
      longitude,

      // class_id ของคาบเรียน อาจส่งมาจาก frontend teacher
      class_id,

      // รหัสวิชา เช่น CS232
      course_id,

      // ชื่อวิชา
      course_name,

      // section ของวิชา
      section,

      // เวลาเริ่มเรียนตามตาราง
      start_time,

      // เวลาจบเรียนตามตาราง
      end_time,

      // จำนวนนักศึกษาในคลาส
      student_count
    } = body;

    // ตรวจว่ามีข้อมูลหลักครบหรือไม่
    // สำหรับ test เดิมจะมีแค่ line_user_id, type, latitude, longitude
    // จึงยังไม่บังคับ class_id เพื่อไม่ให้ frontend/test พัง
    if (!line_user_id || !type) {
      return response(400, {
        success: false,
        message: "missing line_user_id or type"
      });
    }

    // ตรวจว่า type เป็นค่าที่ระบบรองรับหรือไม่
    if (!["onsite", "online", "cancel"].includes(type)) {
      return response(400, {
        success: false,
        message: "invalid session type"
      });
    }

    // ถ้าเป็น onsite ต้องส่งตำแหน่งอาจารย์มาด้วย
    if (type === "onsite" && (latitude == null || longitude == null)) {
      return response(400, {
        success: false,
        message: "onsite class must have latitude and longitude"
      });
    }

    // ดึงข้อมูลผู้ใช้จาก Users table ด้วย line_user_id
    const userResult = await dynamodb
      .get({
        TableName: USERS_TABLE,
        Key: {
          line_user_id
        }
      })
      .promise();

    // user คือข้อมูลผู้ใช้ที่ได้จาก DynamoDB
    const user = userResult.Item;

    // ถ้าไม่พบ user แปลว่ายังไม่ได้ login หรือยังไม่ถูกบันทึกในระบบ
    if (!user) {
      return response(404, {
        success: false,
        message: "user not found"
      });
    }

    // ตรวจสอบว่า user นี้เป็นอาจารย์หรือไม่
    // เฉพาะ role teacher เท่านั้นที่เริ่ม session ได้
    if (user.role !== "teacher") {
      return response(403, {
        success: false,
        message: "only teacher can start session"
      });
    }

    // ใช้ line_user_id เป็น teacher_id
    const teacher_id = line_user_id;

    // สร้าง session_id ใหม่แบบ unique
    const session_id = uuidv4();

    // เวลาปัจจุบัน หน่วยเป็น milliseconds
    const now = Date.now();

    // กำหนดเวลาหมดอายุ session = ตอนนี้ + 30 นาที
    const expire_at = now + 30 * 60 * 1000;

    // ถ้า type เป็น cancel ให้ status เป็น cancelled
    // ถ้า onsite หรือ online ให้เป็น active
    const status = type === "cancel" ? "cancelled" : "active";

    // เตรียมข้อมูล session สำหรับบันทึกลง Sessions table
    const sessionItem = {
      // primary key ของ Sessions table
      session_id,

      // ข้อมูลอาจารย์
      teacher_id,
      teacher_line_user_id: line_user_id,
      teacher_name: user.name_th || user.name_en || user.username || null,

      // ข้อมูลคลาส/วิชา
      // ถ้า frontend ยังไม่ส่งมา ให้ใส่ค่า default เพื่อให้ระบบไม่พัง
      class_id: class_id || "mock-class",
      course_id: course_id || null,
      course_name: course_name || null,
      section: section || null,
      start_time: start_time || null,
      end_time: end_time || null,
      student_count: student_count || 0,

      // ข้อมูล session
      type,
      status,

      // onsite เท่านั้นที่บันทึกพิกัดอาจารย์
      latitude: type === "onsite" ? Number(latitude) : null,
      longitude: type === "onsite" ? Number(longitude) : null,

      // เวลาที่สร้าง session
      created_at: now,

      // เวลาที่ session หมดอายุ
      expire_at
    };

    // บันทึกข้อมูล session ลง DynamoDB ตาราง Sessions
    await dynamodb
      .put({
        TableName: SESSIONS_TABLE,
        Item: sessionItem
      })
      .promise();

    // สร้าง check-in link ให้ student ใช้เปิด LIFF เพื่อเช็คชื่อ
    // ถ้า cancel จะไม่มี link
    const checkin_link =
      type === "cancel"
        ? null
        : `https://liff.line.me/2009731150-FBugBxC4?session_id=${session_id}`; //url นี้ตั้งค่าใน LIFF ของ LINE Developer Console

    let studentList = [];
    if (type !== "cancel") {
        try {
            const rosterResult = await dynamodb.query({
                TableName: ROSTER_TABLE,
                IndexName: "class_id-index", // ตรวจสอบชื่อ Index ใน AWS ให้ตรงกัน
                KeyConditionExpression: "class_id = :cid",
                ExpressionAttributeValues: { ":cid": sessionItem.class_id }
            }).promise();
            studentList = rosterResult.Items.map(item => item.line_user_id);
        } catch (err) { console.error("Error fetching roster:", err); }
    }

    if (studentList.length > 0) {
        try {
            await axios.post(process.env.WEBHOOK_URL, {
                action: "notify_students",
                students: studentList, // ใช้รายชื่อที่ Query ได้จริง
                sessionDetails: { course_name: sessionItem.course_name, checkin_link }
            });
        } catch (err) { console.error("Failed to notify:", err); }
     }

    // ส่ง response กลับไปให้ frontend teacher
    return response(200, {
      success: true,
      message: type === "cancel" ? "class cancelled" : "session created",
      data: {
        // session id ที่ frontend / LINE Bot ต้องใช้ต่อ
        session_id,

        // ข้อมูลอาจารย์
        teacher_id,
        teacher_line_user_id: line_user_id,
        teacher_name: sessionItem.teacher_name,

        // ข้อมูลคลาส
        class_id: sessionItem.class_id,
        course_id: sessionItem.course_id,
        course_name: sessionItem.course_name,
        section: sessionItem.section,

        // ข้อมูล session
        type,
        status,
        latitude: sessionItem.latitude,
        longitude: sessionItem.longitude,
        created_at: now,
        expire_at,

        // link สำหรับเช็คชื่อ
        checkin_link
      }
    });
  } catch (error) {
    // log error ลง CloudWatch เพื่อ debug
    console.error("startSession error:", error);

    // ส่ง response กรณี server error
    return response(500, {
      success: false,
      message: "internal server error",
      error: error.message
    });
  }
};