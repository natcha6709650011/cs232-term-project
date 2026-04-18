require("dotenv").config();
const axios = require("axios");
const { response, getBody, dynamodb } = require("./common");

const USERS_TABLE = "Users";

exports.handler = async (event) => {
  try {
    //อ่านข้อมูลจาก request
    const body = getBody(event);

    const {
      line_user_id, // LINE user id ของผู้ใช้
      username,     // username หรือ email มหาลัย
      password      // password ของ account
    } = body;

    //เช็คว่าข้อมูลมาครบไหม
    if (!line_user_id || !username || !password) {
      return response(400, {
        success: false,
        message: "missing line_user_id, username or password"
      });
    }

    //ยิงไปที่ TU API เพื่อตรวจสอบตัวตน
    const tuRes = await axios.post(
      "https://restapi.tu.ac.th/api/v1/auth/Ad/verify",
      {
        UserName: username,
        PassWord: password
      },
      {
        headers: {
          "Content-Type": "application/json",
          //token ต้องเก็บใน environment variable
          "Application-Key": process.env.TU_APP_KEY
        },
        timeout: 10000
      }
    );

    //ข้อมูลที่ TU API ส่งกลับมา
    const tuData = tuRes.data;

    //ดูใน CloudWatch ว่า API ส่ง field อะไรมาบ้าง
    console.log("TU API RESPONSE:", JSON.stringify(tuData));

    //ถ้า login ไม่ผ่าน
    if (!tuData.status) {
      return response(401, {
        success: false,
        message: tuData.message || "login failed"
      });
    }

    // map role
    // ถ้าเป็น employee ให้ถือเป็น teacher
    // ถ้าเป็น student ให้ถือเป็น student
    let role = "student";
    if (tuData.type === "employee") {
      role = "teacher";
    }

    //เตรียม object user ที่จะเก็บลง DynamoDB
    const userItem = {
      line_user_id, // ใช้เป็น primary identifier ในระบบเรา
      username,     // account ที่ใช้ login
      role,         // teacher / student

      // ข้อมูลที่ดึงได้จาก TU API
      type: tuData.type || null,
      name_th: tuData.displayname_th || null,
      name_en: tuData.displayname_en || null,
      email: tuData.email || null,
      faculty: tuData.faculty || null,
      department: tuData.department || null,
      organization: tuData.organization || null,

      // เวลาอัปเดตล่าสุด
      updated_at: new Date().toISOString()
    };

    //บันทึก user ลง Users table
    await dynamodb.put({
      TableName: USERS_TABLE,
      Item: userItem
    }).promise();

    //ส่งผลกลับ frontend
    return response(200, {
      success: true,
      message: "login success",
      data: {
        role,
        profile: userItem
      }
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error.response?.data || error.message);

    return response(500, {
      success: false,
      message: "internal server error",
      detail: error.response?.data || error.message
    });
  }
};