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
const ROSTER_TABLE = process.env.ROSTER_TABLE || "ClassRoster";

// DEMO locked sessions: use these instead of newly generated sessions
const DEMO_SESSION_IDS = ["ONLINE650001", "YSqk16"];

function getContentType(filePath) {
  if (!filePath) return "application/octet-stream";
  const ext = filePath.split(".").pop().toLowerCase().split("?")[0];
  const map = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic"
  };
  return map[ext] || "application/octet-stream";
}

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
    Expires: 60 * 10,
    ResponseContentType: getContentType(filePath),
    ResponseContentDisposition: "inline"
  });
}

function formatTime(timestamp) {
  if (!timestamp) return "-";
  // บางไฟล์เก่าเก็บเป็นวินาที บางไฟล์เก็บเป็น milliseconds จึง normalize ให้ก่อน
  const ms = timestamp < 100000000000 ? timestamp * 1000 : timestamp;
  return new Date(ms).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

function formatDate(timestamp) {
  if (!timestamp) return "-";
  const ms = timestamp < 100000000000 ? timestamp * 1000 : timestamp;
  return new Date(ms).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric"
  });
}

function firstChar(name) {
  return (name || "?").trim().charAt(0);
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

async function getAllAttendanceBySession(session_id) {
  const r = await dynamodb.query({
    TableName: ATTENDANCE_TABLE,
    KeyConditionExpression: "session_id = :sid",
    ExpressionAttributeValues: { ":sid": session_id }
  }).promise();
  return r.Items || [];
}

async function getRoster(class_id) {
  if (!class_id) return [];
  try {
    const r = await dynamodb.query({
      TableName: ROSTER_TABLE,
      IndexName: "class_id-index",
      KeyConditionExpression: "class_id = :cid",
      ExpressionAttributeValues: { ":cid": class_id }
    }).promise();
    return r.Items || [];
  } catch (err) { return []; }
}

async function getLeavesBySession(session_id, class_id) {
  try {
    const r = await dynamodb.query({
      TableName: LEAVE_TABLE,
      IndexName: "session_id-index",
      KeyConditionExpression: "session_id = :sid",
      ExpressionAttributeValues: { ":sid": session_id }
    }).promise();
    return r.Items || [];
  } catch {
    const r = await dynamodb.scan({
      TableName: LEAVE_TABLE,
      FilterExpression: "session_id = :sid OR class_id = :cid",
      ExpressionAttributeValues: { ":sid": session_id, ":cid": class_id || "__none__" }
    }).promise();
    return r.Items || [];
  }
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

// --- [เริ่มแก้ข้อ 2 จากตรงนี้] ---

function buildSummaryFlex(session, presentCount, leaveCount, absentCount) {
  const dateStr = formatDate(session.created_at);
  const sid = session.session_id;
  return {
    type: "flex",
    altText: "สรุปการเข้าเรียน",
    contents: {
      type: "bubble", size: "mega",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#2865E3", paddingAll: "25px",
        contents: [
          { type: "text", text: "สรุปการเข้าเรียน", weight: "bold", color: "#ffffff", size: "xl" },
          { type: "text", text: `วันที่ ${dateStr}`, color: "#ffffff", size: "sm", margin: "sm" }
        ]
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "xxl",
        contents: [
          {
            type: "box", layout: "horizontal", spacing: "md",
            contents: [
              { type: "box", layout: "vertical", flex: 1, backgroundColor: "#B2DFDB", cornerRadius: "lg", paddingAll: "md", alignItems: "center", contents: [{ type: "text", text: String(presentCount), weight: "bold" }, { type: "text", text: "มาเรียน", size: "xs" }] },
              { type: "box", layout: "vertical", flex: 1, backgroundColor: "#FFE0B2", cornerRadius: "lg", paddingAll: "md", alignItems: "center", contents: [{ type: "text", text: String(leaveCount), weight: "bold" }, { type: "text", text: "แจ้งลา", size: "xs" }] },
              { type: "box", layout: "vertical", flex: 1, backgroundColor: "#FFCDD2", cornerRadius: "lg", paddingAll: "md", alignItems: "center", contents: [{ type: "text", text: String(absentCount), weight: "bold" }, { type: "text", text: "ขาดเรียน", size: "xs" }] }
            ]
          },
          {
            type: "box", layout: "vertical", margin: "xxl", spacing: "md",
            contents: [
              { type: "button", action: { type: "postback", label: "ดูรายชื่อมาเรียน", data: `action=view_list&status=present&session_id=${sid}` }, style: "secondary", color: "#E0F2F1" },
              { type: "button", action: { type: "postback", label: "ดูรายชื่อแจ้งลา", data: `action=view_list&status=leave&session_id=${sid}` }, style: "secondary", color: "#FFF3E0" },
              { type: "button", action: { type: "postback", label: "ดูรายชื่อขาดเรียน", data: `action=view_list&status=absent&session_id=${sid}` }, style: "secondary", color: "#FFEBEE" }
            ]
          }
        ]
      }
    }
  };
}

function buildPresentListFlex(session, students) {
  const rows = students.map(s => ({
    type: "box", layout: "horizontal", alignItems: "center", margin: "md",
    contents: [
      { type: "box", layout: "vertical", width: "40px", height: "40px", backgroundColor: "#4DB6AC", cornerRadius: "100px", alignItems: "center", justifyContent: "center", contents: [{ type: "text", text: firstChar(s.student_name || s.username), color: "#ffffff" }] },
      { type: "box", layout: "vertical", margin: "lg", contents: [{ type: "text", text: s.student_name || s.username || "-", weight: "bold", size: "sm" }, { type: "text", text: s.student_username || "-", size: "xs", color: "#888888" }] }
    ]
  }));
  return { type: "flex", altText: "รายชื่อมาเรียน", contents: { type: "bubble", size: "mega", header: { type: "box", layout: "vertical", backgroundColor: "#F5F5F5", paddingAll: "20px", contents: [{ type: "text", text: "รายชื่อมาเรียน", weight: "bold" }] }, body: { type: "box", layout: "vertical", paddingAll: "xl", contents: rows.length ? rows : [{ type: "text", text: "ไม่มีข้อมูล" }] } } };
}

function buildLeaveListFlex(session, leaveStudents) {
  const rows = leaveStudents.map(s => ({
    type: "box", layout: "vertical", margin: "md", paddingBottom: "md",
    contents: [
      {
        type: "box", layout: "horizontal", alignItems: "center", contents: [
          { type: "box", layout: "vertical", width: "40px", height: "40px", backgroundColor: "#FFB74D", cornerRadius: "100px", alignItems: "center", justifyContent: "center", contents: [{ type: "text", text: firstChar(s.student_name || s.username), color: "#ffffff" }] },
          { type: "box", layout: "vertical", margin: "lg", contents: [{ type: "text", text: s.student_name || s.username || "-", weight: "bold", size: "sm" }, { type: "text", text: s.leave_type || "แจ้งลา", size: "xs", color: "#EB8500" }] }
        ]
      },
      { type: "button", action: { type: "postback", label: "ดูรายละเอียดการลา", data: `action=view_leave_detail&leave_id=${s.leave_id || ""}` }, style: "link", height: "sm" },
      { type: "separator" }
    ]
  }));
  return { type: "flex", altText: "รายชื่อแจ้งลา", contents: { type: "bubble", size: "mega", header: { type: "box", layout: "vertical", backgroundColor: "#F5F5F5", paddingAll: "20px", contents: [{ type: "text", text: "รายชื่อแจ้งลา", weight: "bold" }] }, body: { type: "box", layout: "vertical", paddingAll: "xl", contents: rows.length ? rows : [{ type: "text", text: "ไม่มีข้อมูล" }] } } };
}

function buildLeaveDetailFlex(leaveRecord, session) {
  const name = leaveRecord.student_name || leaveRecord.username || "-";
  const attachPath = leaveRecord.attachment_url || leaveRecord.file_path;
  const signedUrl = generateViewUrl(attachPath);
  const isPdf = attachPath && /\.pdf$/i.test(attachPath);

  return {
    type: "flex", altText: "รายละเอียดการลา",
    contents: {
      type: "bubble", size: "mega",
      header: { type: "box", layout: "vertical", backgroundColor: "#2865E3", paddingAll: "20px", contents: [{ type: "text", text: "รายละเอียดการลา", weight: "bold", color: "#ffffff" }] },
      body: {
        type: "box", layout: "vertical", paddingAll: "xl", spacing: "md",
        contents: [
          { type: "text", text: `ชื่อ-นามสกุล: ${name}`, weight: "bold" },
          { type: "text", text: `ประเภท: ${leaveRecord.leave_type || "ลากิจ"}`, size: "sm" },
          { type: "text", text: `เหตุผล: ${leaveRecord.reason || "-"}`, size: "sm", wrap: true },
          { type: "separator" },
          signedUrl
            ? { type: "button", action: { type: "uri", label: isPdf ? "📂 เปิดดูไฟล์ PDF" : "🖼️ ดูรูปภาพประกอบ", uri: signedUrl }, style: "primary", color: "#2865E3" }
            : { type: "text", text: "ไม่มีเอกสารแนบ", color: "#9D9D9D", size: "xs" }
        ]
      }
    }
  };
}

function buildAbsentListFlex(session, absentStudents) {
  const rows = absentStudents.map(s => ({
    type: "box", layout: "horizontal", alignItems: "center", margin: "md",
    contents: [
      { type: "box", layout: "vertical", width: "40px", height: "40px", backgroundColor: "#B40023", cornerRadius: "100px", alignItems: "center", justifyContent: "center", contents: [{ type: "text", text: firstChar(s.student_name || s.name_th), color: "#ffffff" }] },
      { type: "box", layout: "vertical", margin: "lg", contents: [{ type: "text", text: s.student_name || s.name_th || "-", weight: "bold", size: "sm" }] }
    ]
  }));
  return { type: "flex", altText: "รายชื่อขาดเรียน", contents: { type: "bubble", size: "mega", header: { type: "box", layout: "vertical", backgroundColor: "#F5F5F5", paddingAll: "20px", contents: [{ type: "text", text: "รายชื่อขาดเรียน", weight: "bold" }] }, body: { type: "box", layout: "vertical", paddingAll: "xl", contents: rows.length ? rows : [{ type: "text", text: "ไม่มีคนขาด" }] } } };
}

// --- [สิ้นสุดการแก้ข้อ 2] ---

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

        // ─── TEACHER ROUTING ───
        if (e.type === "message" && e.message?.text === "สถานะนักศึกษาในห้องเรียน") {
          const session = await getLatestActiveSession();
          if (!session) return client.replyMessage(replyToken, { type: "text", text: "📌 ยังไม่มีคาบเรียนที่กำลังดำเนินอยู่" });
          const [allAtt, roster] = await Promise.all([getAllAttendanceBySession(session.session_id), getRoster(session.class_id)]);
          const present = allAtt.filter(a => ["present", "late"].includes(a.status)).length;
          const leave = allAtt.filter(a => a.status === "leave").length;
          const absent = Math.max(0, roster.length - present - leave);
          return client.replyMessage(replyToken, buildSummaryFlex(session, present, leave, absent));
        }

        if (e.type === "message" && e.message?.text === "นักศึกษาลากิจ/ลาป่วย") {
          const session = await getLatestActiveSession();
          if (!session) return client.replyMessage(replyToken, { type: "text", text: "📌 ยังไม่มีคาบเรียนที่กำลังดำเนินอยู่" });
          const leaves = await getLeavesBySession(session.session_id, session.class_id);
          return client.replyMessage(replyToken, buildLeaveListFlex(session, leaves));
        }

        if (e.type === "postback" && e.postback.data.includes("action=view_list")) {
          const params = new URLSearchParams(e.postback.data);
          const status = params.get("status");
          const session = await getSessionById(params.get("session_id")) || await getLatestActiveSession();
          if (!session) return;

          if (status === "present") {
            const all = await getAllAttendanceBySession(session.session_id);
            return client.replyMessage(replyToken, buildPresentListFlex(session, all.filter(a => ["present", "late"].includes(a.status))));
          } else if (status === "leave") {
            const leaves = await getLeavesBySession(session.session_id, session.class_id);
            return client.replyMessage(replyToken, buildLeaveListFlex(session, leaves));
          } else if (status === "absent") {
            const [all, roster] = await Promise.all([getAllAttendanceBySession(session.session_id), getRoster(session.class_id)]);
            const attIds = new Set(all.map(a => a.line_user_id));
            return client.replyMessage(replyToken, buildAbsentListFlex(session, roster.filter(r => !attIds.has(r.line_user_id))));
          }
        }

        if (e.type === "postback" && e.postback.data.includes("action=view_leave_detail")) {
          const leaveId = new URLSearchParams(e.postback.data).get("leave_id");
          const leaveRec = await getLeaveRecord(leaveId);
          if (!leaveRec) return client.replyMessage(replyToken, { type: "text", text: "ไม่พบข้อมูล" });
          const session = await getSessionById(leaveRec.session_id) || await getLatestActiveSession();

          const detailFlex = buildLeaveDetailFlex(leaveRec, session);
          const attachPath = leaveRec.attachment_url || leaveRec.file_path;
          const isImg = attachPath && /\.(jpg|jpeg|png|gif|webp)$/i.test(attachPath);
          const imgUrl = isImg ? generateViewUrl(attachPath) : null;

          if (imgUrl) {
            return client.replyMessage(replyToken, [detailFlex, { type: "image", originalContentUrl: imgUrl, previewImageUrl: imgUrl }]);
          }
          return client.replyMessage(replyToken, detailFlex);
        }

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
            const originalStatus = attendance.status;
            attendance = { ...attendance, ...leaveRecord };
            if (!["present", "late", "leave", "absent"].includes(attendance.status)) {
              attendance.status = originalStatus;
            }
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