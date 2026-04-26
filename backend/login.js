require("dotenv").config();
const axios = require("axios");
const line = require('@line/bot-sdk');
const { response, getBody, dynamodb } = require("./common");

// ชื่อตาราง Users
const USERS_TABLE = process.env.USERS_TABLE || "Users";

// ชื่อ GSI ที่ใช้ค้นหาด้วย username
// ต้องให้คนทำ DB สร้าง GSI นี้ใน DynamoDB ด้วย
const USERNAME_INDEX = process.env.USERNAME_INDEX || "username-index";
const client = new line.Client({ channelAccessToken: process.env.LINE_ACCESS_TOKEN });

exports.handler = async (event) => {
  try {
    // อ่านข้อมูลจาก request
    const body = getBody(event);

    const {
      line_user_id, // LINE user id ของผู้ใช้
      username,     // username หรือ email มหาลัย
      password      // password ของ account
    } = body;

    // เช็คว่าข้อมูลมาครบไหม
    if (!line_user_id || !username || !password) {
      return response(400, {
        success: false,
        message: "missing line_user_id, username or password"
      });
    }

    // ยิงไปที่ TU API เพื่อตรวจสอบตัวตน
    const tuRes = await axios.post(
      "https://restapi.tu.ac.th/api/v1/auth/Ad/verify",
      {
        UserName: username,
        PassWord: password
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Application-Key": process.env.TU_APP_KEY
        },
        timeout: 10000
      }
    );

    // ข้อมูลที่ TU API ส่งกลับมา
    const tuData = tuRes.data;

    // log ไว้ดูใน CloudWatch ว่า TU API ส่ง field อะไรมาบ้าง
    console.log("TU API RESPONSE:", JSON.stringify(tuData));

    // ถ้า login ไม่ผ่าน
    if (!tuData.status) {
      return response(401, {
        success: false,
        message: tuData.message || "login failed"
      });
    }

    // --------------------------------------------------
    // Anti-cheating validation:
    // 1 university account = 1 LINE ID
    // 1 LINE ID = 1 university account
    // --------------------------------------------------

    // 1) ตรวจว่า LINE ID นี้เคยผูกกับ username อื่นแล้วหรือไม่
    const existingLineUser = await dynamodb
      .get({
        TableName: USERS_TABLE,
        Key: {
          line_user_id
        }
      })
      .promise();

    // ถ้า LINE ID นี้มีอยู่แล้ว แต่ username ไม่ตรงกับ username ที่ login ครั้งนี้
    // แปลว่า LINE เดิมพยายาม login เป็นบัญชีมหาลัยคนอื่น
    if (
      existingLineUser.Item &&
      existingLineUser.Item.username !== username
    ) {
      return response(409, {
        success: false,
        message: "this LINE account is already linked to another university account"
      });
    }

    // 2) ตรวจว่า username นี้เคยผูกกับ LINE ID อื่นแล้วหรือไม่
    // ต้องมี GSI: username-index ก่อนถึงจะ query ได้
    const existingUsername = await dynamodb
      .query({
        TableName: USERS_TABLE,
        IndexName: USERNAME_INDEX,
        KeyConditionExpression: "username = :username",
        ExpressionAttributeValues: {
          ":username": username
        }
      })
      .promise();

    // ถ้า username นี้เคยถูกใช้แล้ว แต่ line_user_id ไม่ตรงกับคนที่ login ครั้งนี้
    // แปลว่า account มหาลัยเดิมกำลังถูกเอาไป login ด้วย LINE อื่น
    if (
      existingUsername.Items &&
      existingUsername.Items.length > 0 &&
      existingUsername.Items[0].line_user_id !== line_user_id
    ) {
      return response(409, {
        success: false,
        message: "this university account is already linked to another LINE account"
      });
    }

    // map role
    // ถ้าเป็น employee ให้ถือเป็น teacher
    // ถ้าไม่ใช่ employee ให้ถือเป็น student
    let role = "student";

    if (tuData.type === "employee") {
      role = "teacher";
    }

    // เตรียม object user ที่จะเก็บลง DynamoDB
    const userItem = {
      // ใช้เป็น primary key ใน Users table
      line_user_id,

      // account มหาวิทยาลัยที่ login
      username,

      // role ในระบบเรา
      role,

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

    // บันทึก user ลง Users table
    // ถ้าเป็น LINE เดิม + username เดิม จะ update profile ได้
    await dynamodb
      .put({
        TableName: USERS_TABLE,
        Item: userItem
      })
      .promise();

    try {
      const menuId = (role === 'teacher') ? process.env.TEACHER_MENU_ID : process.env.STUDENT_MENU_ID;
      await client.linkRichMenuToUser(line_user_id, menuId);
    } catch (err) { console.error("Link Rich Menu Error:", err); }

    // ส่งผลกลับ frontend
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