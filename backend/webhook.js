const line = require("@line/bot-sdk");
const { dynamodb } = require("./common");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();

const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
});

const ATTENDANCE_TABLE = process.env.ATTENDANCE_TABLE || "Attendance";
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "Sessions";
const BUCKET_NAME =
  process.env.BUCKET_NAME ||
  process.env.S3_BUCKET ||
  "tu-attendance-images-s3";

const LEAVE_TABLE = process.env.LEAVE_TABLE || "Leave";

// DEMO locked sessions: use these instead of newly generated sessions
const DEMO_SESSION_IDS = ["ONLINE650001", "YSqk16"];


function generateViewUrl(filePath) {
  if (!filePath) return null;

  // ถ้าเป็น URL เต็ม
  if (filePath.startsWith("http")) {
    const url = new URL(filePath);
    filePath = decodeURIComponent(
      url.pathname.replace(/^\/+/, "")
    );
  }

  // กัน path มี / นำหน้า
  filePath = filePath.replace(/^\/+/, "");

  return s3.getSignedUrl("getObject", {
    Bucket: BUCKET_NAME,
    Key: filePath,
    Expires: 60 * 10
  });
}

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

async function getSessionById(session_id) {
  if (!session_id) return null;

  try {
    const result = await dynamodb.get({
      TableName: SESSIONS_TABLE,
      Key: { session_id }
    }).promise();

    return result.Item || null;
  } catch (err) {
    console.error("GET SESSION BY ID ERROR:", err);
    return null;
  }
}

async function getAttendance(session_id, line_user_id) {
  const result = await dynamodb.get({
    TableName: ATTENDANCE_TABLE,
    Key: { session_id, line_user_id }
  }).promise();
  return result.Item || null;
}

async function getAttendanceFromDemoSessions(line_user_id) {
  const items = [];

  for (const session_id of DEMO_SESSION_IDS) {
    const attendance = await getAttendance(session_id, line_user_id);
    if (attendance) {
      items.push(attendance);
    }
  }

  if (items.length === 0) return null;

  items.sort((a, b) => {
    const aTime = Number(a.checkin_time || a.leave_time || a.created_at || 0);
    const bTime = Number(b.checkin_time || b.leave_time || b.created_at || 0);
    return bTime - aTime;
  });

  return items[0];
}

async function getLatestLeaveAttendanceByUser(line_user_id, session_id) {
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

  // ถ้ามี session_id ให้กรองเฉพาะ session ปัจจุบันก่อน
  if (session_id) {
    const exact = leaveItems.find(item => item.session_id === session_id);
    if (exact) return exact;
  }

  return leaveItems[0] || null;
}

// ดึงข้อมูลการลาครบถ้วนจาก Leave table โดยใช้ leave_id
// leave.js เขียน leave_id ไว้ใน Attendance.Item ด้วย
async function getLeaveRecord(leave_id) {
  if (!leave_id) return null;
  try {
    const result = await dynamodb.get({
      TableName: LEAVE_TABLE,
      Key: { leave_id }
    }).promise();
    return result.Item || null;
  } catch (err) {
    console.error("GET LEAVE RECORD ERROR:", err);
    return null;
  }
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

        let activeSession = await getLatestActiveSession();

        console.log("WEBHOOK userId:", userId);
        console.log("WEBHOOK activeSession:", activeSession);

        // First check the currently active session, then the two locked demo sessions.
        // This fixes the case where online check-in is saved under ONLINE650001
        // but active-session / a newer generated session points somewhere else.
        let attendance = activeSession
          ? await getAttendance(activeSession.session_id, userId)
          : null;

        console.log("WEBHOOK attendance from active session:", attendance);

        if (!attendance) {
          attendance = await getAttendanceFromDemoSessions(userId);
        }

        // If attendance is found in ONLINE650001 or YSqk16, use that session for display.
        if (attendance?.session_id) {
          const attendanceSession = await getSessionById(attendance.session_id);
          if (attendanceSession) {
            activeSession = attendanceSession;
          }
        }

        // If no active session exists, still fall back to ONLINE650001 for display during demo.
        if (!activeSession) {
          activeSession = await getSessionById("ONLINE650001") || await getSessionById("YSqk16");
        }

        if (!activeSession) {
          return client.replyMessage(replyToken, {
            type: "text",
            text: "📌 ยังไม่มีการเริ่มคลาสในตอนนี้\nเมื่ออาจารย์เริ่มคาบแล้ว ระบบจะแสดงสถานะการเช็คชื่อของคุณได้"
          });
        }

        console.log("WEBHOOK attendance before leave fallback:", attendance);

        // ถ้าหา Attendance ไม่เจอ ให้ลองหา leave ล่าสุดของ user จาก Attendance table
        if (!attendance) {
          const latestLeaveAttendance = await getLatestLeaveAttendanceByUser(userId, activeSession.session_id);

          if (
            latestLeaveAttendance &&
            (
              latestLeaveAttendance.session_id === activeSession.session_id ||
              latestLeaveAttendance.class_id === activeSession.class_id ||
              latestLeaveAttendance.section === activeSession.section ||
              DEMO_SESSION_IDS.includes(latestLeaveAttendance.session_id)
            )
          ) {
            attendance = latestLeaveAttendance;
          }
        }

        // ถ้า attendance ที่ได้มี leave_id → ดึงข้อมูลครบจาก Leave table
        if (attendance?.leave_id) {
          const leaveRecord = await getLeaveRecord(attendance.leave_id);
          if (leaveRecord) {
            attendance = { ...attendance, ...leaveRecord };
          }
        }

        console.log("WEBHOOK final attendance:", attendance);

        if (!attendance) {
          return client.replyMessage(replyToken, {
            type: "text",
            text:
              `📊 สถานะของฉัน\n` +
              `วิชา: ${activeSession.course_name || activeSession.course_id || "CS232 INTRODUCTION TO CLOUD COMPUTING TECHNOLOGY"}\n` +
              `Section: ${activeSession.section || "650001"}\n` +
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

        const attachmentPath =
          attendance.attachment_url ||
          attendance.file_path ||
          attendance.image_url;

        const attachmentUrl = attachmentPath
          ? generateViewUrl(attachmentPath)
          : null;

        // ถ้ามีไฟล์แนบ
        if (attachmentUrl) {

          // เช็คว่าเป็นรูปไหม
          const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(
            attachmentPath
          );

          // ถ้าเป็นรูป → ส่งรูปใน LINE
          if (isImage) {
            return client.replyMessage(replyToken, [
              {
                type: "text",
                text:
                  `📊 สถานะของฉัน\n` +
                  `วิชา: ${attendance.course_name || activeSession.course_name || "-"}\n` +
                  `Section: ${attendance.section || activeSession.section || "-"}\n` +
                  `สถานะ: ${statusText}\n` +
                  `เวลา: ${time}\n` +
                  `📎 มีเอกสารแนบ`
              },
              {
                type: "image",
                originalContentUrl: attachmentUrl,
                previewImageUrl: attachmentUrl
              }
            ]);
          }

          // ถ้าเป็น PDF หรือไฟล์อื่น
          return client.replyMessage(replyToken, {
            type: "text",
            text:
              `📊 สถานะของฉัน\n` +
              `วิชา: ${attendance.course_name || activeSession.course_name || "-"}\n` +
              `Section: ${attendance.section || activeSession.section || "-"}\n` +
              `สถานะ: ${statusText}\n` +
              `เวลา: ${time}\n\n` +
              `📎 เอกสารแนบ:\n${attachmentUrl}`
          });
        }

        // ถ้าไม่มีไฟล์แนบ
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
