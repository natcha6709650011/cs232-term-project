const { response, getBody, dynamodb } = require("./common");
const { v4: uuidv4 } = require("uuid");

// ชื่อตาราง DynamoDB
const USERS_TABLE = process.env.USERS_TABLE;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "Sessions";

exports.handler = async (event) => {
  try {
    //อ่านข้อมูลจาก request
    const body = getBody(event);

    const {
      line_user_id,
      type,
      latitude,
      longitude
    } = body;

    //เช็คข้อมูลพื้นฐาน
    if (!line_user_id || !type) {
      return response(400, {
        success: false,
        message: "missing line_user_id or type"
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

    //onsite ต้องมี location
    if (type === "onsite" && (latitude == null || longitude == null)) {
      return response(400, {
        success: false,
        message: "onsite class must have latitude and longitude"
      });
    }

    //ดึง user จาก DynamoDB
    const userResult = await dynamodb.get({
      TableName: USERS_TABLE,
      Key: {
        line_user_id
      }
    }).promise();

    const user = userResult.Item;

    if (!user) {
      return response(404, {
        success: false,
        message: "user not found"
      });
    }

    if (user.role !== "teacher") {
      return response(403, {
        success: false,
        message: "only teacher can start session"
      });
    }

    const teacher_id = line_user_id;
    const session_id = uuidv4();

    const now = Date.now();
    const expire_at = now + 30 * 60 * 1000;

    let status = "active";
    if (type === "cancel") {
      status = "cancelled";
    }

    const sessionItem = {
      session_id,
      teacher_id,
      teacher_name: user.name_th || user.name_en || user.username || null,
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

    const checkin_link =
      type === "cancel"
        ? null
        : `https://your-liff-url.com/checkin?session_id=${session_id}`;//รอliff จริงก่อนค่อยใส่

    return response(200, {
      success: true,
      message: "session created",
      data: {
        session_id,
        teacher_id,
        teacher_name: sessionItem.teacher_name,
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