const line = require("@line/bot-sdk");
const { dynamodb } = require("./common");

const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
});

const ATTENDANCE_TABLE = process.env.ATTENDANCE_TABLE || "Attendance";
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "Sessions";

function formatTime(timestamp) {
  if (!timestamp) return "-";
  // บางไฟล์เก่าเก็บเป็นวินาที บางไฟล์เก็บเป็น milliseconds จึง normalize ให้ก่อน
  const ms = timestamp < 100000000000 ? timestamp * 1000 : timestamp;
  return new Date(ms).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

function isActiveSession(session) {
  return session?.status === "active" && (!session.expire_at || Date.now() <= session.expire_at);
}

async function getLatestActiveSession() {
  const result = await dynamodb.scan({
    TableName: SESSIONS_TABLE,
    FilterExpression: "#status = :active",
    ExpressionAttributeNames: {
      "#status": "status"
    },
    ExpressionAttributeValues: {
      ":active": "active"
    }
  }).promise();

  const activeSessions = (result.Items || [])
    .filter(isActiveSession)
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

  return activeSessions[0] || null;
}

async function getAttendance(session_id, line_user_id) {
  const result = await dynamodb.get({
    TableName: ATTENDANCE_TABLE,
    Key: { session_id, line_user_id }
  }).promise();
  return result.Item || null;
}

async function getLatestLeaveAttendanceByUser(line_user_id) {
  const result = await dynamodb.scan({
    TableName: ATTENDANCE_TABLE,
    FilterExpression: "line_user_id = :uid AND #status = :leave",
    ExpressionAttributeNames: {
      "#status": "status"
    },
    ExpressionAttributeValues: {
      ":uid": line_user_id,
      ":leave": "leave"
    }
  }).promise();

  const leaveItems = (result.Items || [])
    .sort((a, b) => (b.leave_time || b.checkin_time || 0) - (a.leave_time || a.checkin_time || 0));

  return leaveItems[0] || null;
}

exports.handler = async (event) => {
  console.log("EVENT:", JSON.stringify(event));

  const body =
    typeof event.body === "string"
      ? JSON.parse(event.body)
      : event.body || event;

  if (!body.events) {
    return { statusCode: 200, body: "OK" };
  }

  await Promise.all(
    body.events.map(async (e) => {
      try {
        const userId = e.source?.userId;
        const replyToken = e.replyToken;

        if (!replyToken || !userId) return;

        const isCheckStatus =
          (e.type === "message" && e.message?.text === "สถานะของฉัน") ||
          (e.type === "postback" && e.postback?.data?.includes("action=check_status"));

        if (!isCheckStatus) return;

        const activeSession = await getLatestActiveSession();

        console.log("WEBHOOK userId:", userId);
        console.log("WEBHOOK activeSession:", activeSession);

        if (!activeSession) {
          return client.replyMessage(replyToken, {
            type: "text",
            text: "📌 ยังไม่มีการเริ่มคลาสในตอนนี้\nเมื่ออาจารย์เริ่มคาบแล้ว ระบบจะแสดงสถานะการเช็คชื่อของคุณได้"
          });
        }

        let attendance = await getAttendance(activeSession.session_id, userId);

        console.log("WEBHOOK attendance before fallback:", attendance);

        // ถ้าหา Attendance ใน session ปัจจุบันไม่เจอ
        // ให้ลองหา leave ล่าสุดของ user จาก Attendance table
        if (!attendance) {
          const latestLeaveAttendance = await getLatestLeaveAttendanceByUser(userId);
        
          // ถ้ามี leave ล่าสุด และเป็น class/section เดียวกับ session ปัจจุบัน ให้ใช้เป็นสถานะ
          if (
            latestLeaveAttendance &&
            (
              latestLeaveAttendance.session_id === activeSession.session_id ||
              latestLeaveAttendance.class_id === activeSession.class_id ||
              latestLeaveAttendance.section === activeSession.section
            )
          ) {
            attendance = latestLeaveAttendance;
          }
        }
        
        console.log("WEBHOOK final attendance:", attendance);
        
        if (!attendance) {
          return client.replyMessage(replyToken, {
            type: "text",
            text:
              `📊 สถานะของฉัน\n` +
              `วิชา: ${activeSession.course_name || activeSession.course_id || "-"}\n` +
              `Section: ${activeSession.section || "-"}\n` +
              `สถานะ: ⏳ ยังไม่เช็คชื่อ\n` +
              `หมายเหตุ: หากกดเช็คชื่อแล้วแต่ยังไม่ขึ้น ให้ลองกดใหม่หรือแจ้งอาจารย์`
          });
        }
      

        const statusMap = {
          present: "✅ มาเรียน",
          late: "🟠 มาสาย",
          leave: "🟡 ลา",
          absent: "❌ ขาดเรียน"
        };

        let statusText = statusMap[attendance.status] || "❓ ไม่ทราบสถานะ";

        if (attendance.status === "leave") {
          if (attendance.leave_type === "ลาป่วย") {
            statusText = "🤒 ลาป่วย";
          } else if (attendance.leave_type === "ลากิจ") {
            statusText = "📌 ลากิจ";
          }
        }
        const time = formatTime(attendance.checkin_time || attendance.leave_time);

        return client.replyMessage(replyToken, {
          type: "text",
          text:
            `📊 สถานะของฉัน\n` +
            `วิชา: ${attendance.course_name || activeSession.course_name || "-"}\n` +
            `Section: ${attendance.section || activeSession.section || "-"}\n` +
            `สถานะ: ${statusText}\n` +
            `เวลา: ${time}`
        });
      } catch (err) {
        console.error("HANDLER ERROR:", err);
      }
    })
  );

  return {
    statusCode: 200,
    body: "OK"
  };
};
