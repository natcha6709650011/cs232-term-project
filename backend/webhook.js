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
const ALLOWED_SESSION_IDS = DEMO_SESSION_IDS;
const LEAVE_PAGE_SIZE = 5;
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://main.d1d25usb5e0o4s.amplifyapp.com/frontend";

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

function formatShortTime(timestamp) {
  if (!timestamp) return "-";
  const ms = timestamp < 100000000000 ? timestamp * 1000 : timestamp;
  const d = new Date(ms);
  const hh = String(d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", hour12: false })).padStart(2, "0");
  const mm = String(d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", minute: "2-digit" })).padStart(2, "0");
  return `${hh}:${mm} น.`;
}

function formatShortDate(timestamp) {
  if (!timestamp) return "-";
  const ms = timestamp < 100000000000 ? timestamp * 1000 : timestamp;
  const d = new Date(ms);
  const day = String(d.getDate()).padStart(2, "0");
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear() + 543;
  return `${day}/${mon}/${year}`;
}

function firstChar(name) {
  return (name || "?").trim().charAt(0);
}

function cleanValue(value, fallback = "-") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") {
    return fallback;
  }
  return text;
}

function getAttachmentPath(record) {
  const candidates = [record?.attachment_url, record?.file_path, record?.image_url];
  for (const value of candidates) {
    const cleaned = cleanValue(value, "");
    if (cleaned) return cleaned;
  }
  return null;
}

function normalizeTimestamp(value) {
  if (!value) return 0;
  const n = Number(value);
  if (!Number.isNaN(n)) return n;
  const d = Date.parse(value);
  return Number.isNaN(d) ? 0 : d;
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
  // ใช้ scan ตรง ๆ เพื่อไม่ต้องพึ่ง session_id-index
  // แล้วคัดเฉพาะ 2 session ที่ใช้จริงใน demo เท่านั้น
  try {
    const result = await dynamodb.scan({
      TableName: LEAVE_TABLE
    }).promise();

    const allowed = new Set(ALLOWED_SESSION_IDS);
    return (result.Items || [])
      .filter(item => allowed.has(item.session_id))
      .sort((a, b) => normalizeTimestamp(b.created_at || b.updated_at) - normalizeTimestamp(a.created_at || a.updated_at));
  } catch (err) {
    console.error("SCAN LEAVES ERROR:", err);
    return [];
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

function buildLeaveListFlex(session, leaveStudents, page = 1) {
  const safePage = Math.max(1, Number(page) || 1);
  const total = leaveStudents.length;
  const totalPages = Math.max(1, Math.ceil(total / LEAVE_PAGE_SIZE));
  const currentPage = Math.min(safePage, totalPages);
  const startIndex = (currentPage - 1) * LEAVE_PAGE_SIZE;
  const pageItems = leaveStudents.slice(startIndex, startIndex + LEAVE_PAGE_SIZE);

  const rows = pageItems.map((s, idx) => {
    const attachmentPath = getAttachmentPath(s);
    const attachmentName = cleanValue(s.attachment_name, attachmentPath ? "มีเอกสารแนบ" : "ไม่มีเอกสารแนบ");

    return {
      type: "box", layout: "vertical", margin: "md", paddingBottom: "md",
      contents: [
        {
          type: "box", layout: "horizontal", alignItems: "center", contents: [
            { type: "box", layout: "vertical", width: "40px", height: "40px", backgroundColor: "#FFB74D", cornerRadius: "100px", alignItems: "center", justifyContent: "center", contents: [{ type: "text", text: firstChar(s.student_name || s.username), color: "#ffffff" }] },
            { type: "box", layout: "vertical", margin: "lg", contents: [
              { type: "text", text: cleanValue(s.student_name || s.username), weight: "bold", size: "sm", wrap: true },
              { type: "text", text: `รหัส: ${cleanValue(s.student_username, "-")}`, size: "xs", color: "#777777" },
              { type: "text", text: cleanValue(s.leave_type, "แจ้งลา"), size: "xs", color: "#EB8500" },
              { type: "text", text: attachmentPath ? `มีไฟล์แนบ: ${attachmentName}` : "ไม่มีเอกสารแนบ", size: "xs", color: attachmentPath ? "#2865E3" : "#9CA3AF", wrap: true }
            ] }
          ]
        },
        { type: "button", action: { type: "postback", label: "ดูรายละเอียดการลา", data: `action=view_leave_detail&leave_id=${encodeURIComponent(s.leave_id || "")}` }, style: "link", height: "sm" },
        { type: "separator" }
      ]
    };
  });

  const pagerButtons = [];
  if (currentPage > 1) {
    pagerButtons.push({ type: "button", style: "secondary", height: "sm", action: { type: "postback", label: "หน้าก่อนหน้า", data: `action=view_list&status=leave&page=${currentPage - 1}` } });
  }
  if (currentPage < totalPages) {
    pagerButtons.push({ type: "button", style: "secondary", height: "sm", action: { type: "postback", label: "หน้าถัดไป", data: `action=view_list&status=leave&page=${currentPage + 1}` } });
  }

  const bodyContents = [
    { type: "text", text: `แสดงหน้า ${currentPage}/${totalPages} • ทั้งหมด ${total} รายการ`, size: "xs", color: "#777777", wrap: true },
    ...(rows.length ? rows : [{ type: "text", text: "ไม่มีข้อมูล", wrap: true }]),
    ...(pagerButtons.length ? [{ type: "box", layout: "horizontal", spacing: "sm", margin: "lg", contents: pagerButtons }] : [])
  ];

  return {
    type: "flex",
    altText: "รายชื่อแจ้งลา",
    contents: {
      type: "bubble",
      size: "mega",
      header: { type: "box", layout: "vertical", backgroundColor: "#F5F5F5", paddingAll: "20px", contents: [{ type: "text", text: "รายชื่อแจ้งลา", weight: "bold" }] },
      body: { type: "box", layout: "vertical", paddingAll: "xl", contents: bodyContents }
    }
  };
}

function buildLeaveDetailFlex(leaveRecord, session) {
  const name = cleanValue(leaveRecord.student_name || leaveRecord.username);
  const studentId = cleanValue(leaveRecord.student_username, "-");
  const course = cleanValue(leaveRecord.course_name || session?.course_name || leaveRecord.course_id || session?.course_id, "CS232 INTRODUCTION TO CLOUD COMPUTING TECHNOLOGY");
  const section = cleanValue(leaveRecord.section || session?.section, "650001");
  const leaveType = cleanValue(leaveRecord.leave_type, "แจ้งลา");
  const leaveDate = cleanValue(leaveRecord.leave_date, "-");
  const reason = cleanValue(leaveRecord.reason || leaveRecord.note, "-");
  const status = cleanValue(leaveRecord.status, "pending");
  const attachPath = getAttachmentPath(leaveRecord);
  const attachmentName = cleanValue(leaveRecord.attachment_name, attachPath ? "เอกสารแนบ" : "ไม่มีเอกสารแนบ");

  // LINE URI action rejects very long S3 presigned URLs.
  // Use a short frontend viewer URL; the viewer page will request generate-view-url itself.
  let attachmentViewerUrl = null;
  if (attachPath) {
    attachmentViewerUrl = `${FRONTEND_BASE_URL}/TeacherViewPicture.html?file_path=${encodeURIComponent(attachPath)}&name=${encodeURIComponent(attachmentName)}`;
  }

  const detailContents = [
    { type: "text", text: `ชื่อ-นามสกุล: ${name}`, weight: "bold", wrap: true },
    { type: "text", text: `รหัส: ${studentId}`, size: "sm", wrap: true },
    { type: "text", text: `วิชา: ${course}`, size: "sm", wrap: true },
    { type: "text", text: `Section: ${section}`, size: "sm", wrap: true },
    { type: "separator" },
    { type: "text", text: `ประเภทการลา: ${leaveType}`, size: "sm", wrap: true },
    { type: "text", text: `วันที่ลา: ${leaveDate}`, size: "sm", wrap: true },
    { type: "text", text: `เหตุผล: ${reason}`, size: "sm", wrap: true },
    { type: "text", text: `สถานะ: ${status}`, size: "sm", wrap: true },
    { type: "separator" },
    { type: "text", text: attachmentViewerUrl ? `เอกสารแนบ: ${attachmentName}` : "ไม่มีเอกสารแนบ", size: "sm", color: attachmentViewerUrl ? "#2865E3" : "#9CA3AF", wrap: true }
  ];

  if (attachmentViewerUrl) {
    detailContents.push({ type: "button", action: { type: "uri", label: "ดูเอกสารแนบ", uri: attachmentViewerUrl }, style: "primary", color: "#2865E3" });
  }

  return {
    type: "flex", altText: "รายละเอียดการลา",
    contents: {
      type: "bubble", size: "mega",
      header: { type: "box", layout: "vertical", backgroundColor: "#2865E3", paddingAll: "20px", contents: [{ type: "text", text: "รายละเอียดการลา", weight: "bold", color: "#ffffff" }] },
      body: { type: "box", layout: "vertical", paddingAll: "xl", spacing: "md", contents: detailContents }
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

function _sessionTimeRange(session) {
  if (session?.start_time && session?.end_time) {
    // normalize "09.30" → "09:30" กันกรณีเก็บด้วยจุดแทนโคลอน
    const fmt = (t) => String(t).replace(".", ":").trim() + " น.";
    return { start: fmt(session.start_time), end: fmt(session.end_time) };
  }
  return {
    start: formatShortTime(session?.created_at),
    end: formatShortTime(session?.expire_at)
  };
}

// helper: แถวข้อมูลวิชาด้านล่าง badge  (CS232 • 650001 • 09:30-12:30)
function _courseRow(courseId, section, startTime, endTime) {
  const dot = { type: "box", layout: "vertical", contents: [], width: "4px", height: "4px", backgroundColor: "#aaaaaa", cornerRadius: "10px", margin: "sm", offsetTop: "1px" };
  const label = `${courseId || "CS232"}  •  ${section || "-"}  •  ${startTime}–${endTime}`;
  return {
    type: "box", layout: "horizontal", justifyContent: "center", alignItems: "center", margin: "xxl",
    paddingStart: "xl", paddingEnd: "xl",
    contents: [
      { type: "text", text: label, size: "xs", color: "#aaaaaa", weight: "bold", align: "center", wrap: false, adjustMode: "shrink-to-fit" }
    ]
  };
}
 
// ── สถานะ: ยังไม่เช็คชื่อ (session ยังเปิดอยู่ มีปุ่มเช็คชื่อ) ──
function buildStudentNotCheckedActiveFlex(session, checkinUrl) {
  const now = Date.now();
  return {
    type: "flex", altText: `ยังไม่ได้เช็คชื่อ (ขาด) ${formatShortTime(now)}`,
    contents: {
      type: "bubble", size: "mega",
      body: {
        type: "box", layout: "vertical", paddingAll: "xxl", backgroundColor: "#F7F7F7",
        contents: [
          {
            type: "box", layout: "vertical", backgroundColor: "#DA8091", cornerRadius: "100px", paddingAll: "xl", borderWidth: "2px", borderColor: "#B40023",
            contents: [
              { type: "box", layout: "horizontal", justifyContent: "center", alignItems: "center",
                contents: [
                  { type: "box", layout: "vertical", contents: [], width: "12px", height: "12px", backgroundColor: "#B40023", cornerRadius: "20px", offsetTop: "2px" },
                  { type: "text", text: `ยังไม่ได้เช็คชื่อ (ขาด) ${formatShortTime(now)}`, weight: "bold", size: "sm", color: "#000000", margin: "md", flex: 0 }
                ]
              },
              { type: "text", text: formatShortDate(now), weight: "bold", size: "md", color: "#000000", align: "center", margin: "sm" }
            ]
          },
          _courseRow(session.course_id, session.section, _sessionTimeRange(session).start, _sessionTimeRange(session).end),
          {
            type: "box", layout: "vertical", margin: "xxl", paddingStart: "xxl", paddingEnd: "xxl",
            contents: [{
              type: "button", style: "primary", color: "#19A597", height: "md", margin: "none",
              action: { type: "uri", label: "เช็คชื่อเข้าเรียน", uri: checkinUrl || "https://liff.line.me/" }
            }]
          }
        ]
      }
    }
  };
}
 
// ── สถานะ: ยังไม่เช็คชื่อ (session หมดเวลาแล้ว ไม่มีปุ่ม) ──
function buildStudentAbsentFlex(session) {
  const expireTime = session.expire_at || Date.now();
  return {
    type: "flex", altText: `ยังไม่ได้เช็คชื่อ (ขาด) ${formatShortTime(expireTime)}`,
    contents: {
      type: "bubble", size: "mega",
      body: {
        type: "box", layout: "vertical", paddingAll: "xxl", backgroundColor: "#F7F7F7",
        contents: [
          {
            type: "box", layout: "vertical", backgroundColor: "#DE8793", cornerRadius: "100px", paddingAll: "xl", borderWidth: "2px", borderColor: "#C2002E",
            contents: [
              { type: "box", layout: "horizontal", justifyContent: "center", alignItems: "center",
                contents: [
                  { type: "box", layout: "vertical", contents: [], width: "12px", height: "12px", backgroundColor: "#C2002E", cornerRadius: "20px", margin: "none", offsetTop: "2px", spacing: "none" },
                  { type: "text", text: `ยังไม่ได้เช็คชื่อ (ขาด) ${formatShortTime(expireTime)}`, weight: "bold", size: "sm", color: "#000000", margin: "md", flex: 0 }
                ]
              },
              { type: "text", text: formatShortDate(expireTime), weight: "bold", size: "md", color: "#000000", align: "center", margin: "sm" }
            ]
          },
          _courseRow(session.course_id, session.section, _sessionTimeRange(session).start, _sessionTimeRange(session).end)
        ]
      }
    }
  };
}
 
// ── สถานะ: เช็คชื่อแล้ว (present) ──
function buildStudentPresentFlex(attendance, session) {
  const checkinTime = attendance.checkin_time || Date.now();
  const dotColor = attendance.status === "late" ? "#FDB456" : "#1B9E8E";
  const badgeBg  = attendance.status === "late" ? "#F9D5A6"  : "#8CD2CC";
  const badgeBorder = attendance.status === "late" ? "#FDB456" : "#1B9E8E";
  const label    = attendance.status === "late" ? `เช็คชื่อแล้ว (สาย) ${formatShortTime(checkinTime)}` : `เช็คชื่อแล้ว ${formatShortTime(checkinTime)}`;
 
  return {
    type: "flex", altText: label,
    contents: {
      type: "bubble", size: "mega",
      body: {
        type: "box", layout: "vertical", paddingAll: "xxl", backgroundColor: "#F7F7F7",
        contents: [
          {
            type: "box", layout: "vertical", backgroundColor: badgeBg, cornerRadius: "100px", paddingAll: "xl", borderWidth: "2px", borderColor: badgeBorder,
            contents: [
              { type: "box", layout: "horizontal", justifyContent: "center", alignItems: "center",
                contents: [
                  { type: "box", layout: "vertical", contents: [], width: "12px", height: "12px", backgroundColor: dotColor, cornerRadius: "20px", margin: "none", offsetTop: "2px", spacing: "none" },
                  { type: "text", text: label, weight: "bold", size: attendance.status === "late" ? "sm" : "md", color: "#000000", margin: "md", flex: 0 }
                ]
              },
              { type: "text", text: formatShortDate(checkinTime), weight: "bold", size: "md", color: "#000000", align: "center", margin: "sm" }
            ]
          },
          _courseRow(
            attendance.course_id || session.course_id,
            attendance.section   || session.section,
            _sessionTimeRange(session).start,
            _sessionTimeRange(session).end
          )
        ]
      }
    }
  };
}
 
// ── สถานะ: แจ้งลา ไม่มีเอกสาร ──
function buildStudentLeaveNoDocFlex(attendance, session) {
  const leaveTime = attendance.leave_time || attendance.created_at || Date.now();
  const leaveType = attendance.leave_type || "ลากิจ";
  const reason    = attendance.reason || "-";
  return {
    type: "flex", altText: `แจ้งลา (ไม่มีเอกสาร) ${formatShortTime(leaveTime)}`,
    contents: {
      type: "bubble", size: "mega",
      body: {
        type: "box", layout: "vertical", paddingAll: "xxl", backgroundColor: "#F7F7F7",
        contents: [
          {
            type: "box", layout: "vertical", backgroundColor: "#BFD1F7", cornerRadius: "100px", paddingAll: "xl", borderWidth: "2px", borderColor: "#2865E3",
            contents: [
              { type: "box", layout: "horizontal", justifyContent: "center", alignItems: "center",
                contents: [
                  { type: "box", layout: "vertical", contents: [], width: "12px", height: "12px", backgroundColor: "#2865E3", cornerRadius: "20px", margin: "none", offsetTop: "2px" },
                  { type: "text", text: `${leaveType} (ไม่มีเอกสาร) ${formatShortTime(leaveTime)}`, weight: "bold", size: "sm", color: "#000000", margin: "md", flex: 0 }
                ]
              },
              { type: "text", text: formatShortDate(leaveTime), weight: "bold", size: "md", color: "#000000", align: "center", margin: "sm" }
            ]
          },
          _courseRow(
            attendance.course_id || session.course_id,
            attendance.section   || session.section,
            _sessionTimeRange(session).start,
            _sessionTimeRange(session).end
          ),
          // เหตุผล
          {
            type: "box", layout: "vertical", margin: "xl", paddingStart: "md", paddingEnd: "md",
            contents: [
              { type: "text", text: `เหตุผล: ${reason}`, size: "sm", color: "#555555", wrap: true }
            ]
          }
        ]
      }
    }
  };
}
 
// ── สถานะ: แจ้งลา มีเอกสารแนบ ──
function buildStudentLeaveWithDocFlex(attendance, session, viewerUrl) {
  const leaveTime = attendance.leave_time || attendance.created_at || Date.now();
  const leaveType = attendance.leave_type || "ลากิจ";
  const reason    = attendance.reason || "-";
  return {
    type: "flex", altText: `แจ้งลา (แนบเอกสาร) ${formatShortTime(leaveTime)}`,
    contents: {
      type: "bubble", size: "mega",
      body: {
        type: "box", layout: "vertical", paddingAll: "xxl", backgroundColor: "#F7F7F7",
        contents: [
          {
            type: "box", layout: "vertical", backgroundColor: "#BFD1F7", cornerRadius: "100px", paddingAll: "xl", borderWidth: "2px", borderColor: "#2865E3",
            contents: [
              { type: "box", layout: "horizontal", justifyContent: "center", alignItems: "center",
                contents: [
                  { type: "box", layout: "vertical", contents: [], width: "12px", height: "12px", backgroundColor: "#2865E3", cornerRadius: "20px", offsetTop: "2px" },
                  { type: "text", text: `${leaveType} (แนบเอกสาร) ${formatShortTime(leaveTime)}`, weight: "bold", size: "sm", color: "#000000", margin: "md", flex: 0 }
                ]
              },
              { type: "text", text: formatShortDate(leaveTime), weight: "bold", size: "md", color: "#000000", align: "center", margin: "sm" }
            ]
          },
          _courseRow(
            attendance.course_id || session.course_id,
            attendance.section   || session.section,
            _sessionTimeRange(session).start,
            _sessionTimeRange(session).end
          ),
          // เหตุผล
          {
            type: "box", layout: "vertical", margin: "xl", paddingStart: "md", paddingEnd: "md",
            contents: [
              { type: "text", text: `เหตุผล: ${reason}`, size: "sm", color: "#555555", wrap: true }
            ]
          },
          // ปุ่มเปิดเอกสาร — เปิด TeacherViewPicture.html เหมือนฝั่งอาจารย์
          {
            type: "box", layout: "vertical", margin: "xxl", paddingStart: "xxl", paddingEnd: "xxl",
            contents: [{
              type: "button", style: "primary", color: "#ABC6FF", height: "md",
              action: { type: "uri", label: "เอกสารแจ้งลา", uri: viewerUrl }
            }]
          }
        ]
      }
    }
  };
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

          // เรียกใช้ฟังก์ชัน scan ที่เราแก้ใหม่
          const leaves = await getLeavesBySession(session.session_id, session.class_id);
          return client.replyMessage(replyToken, buildLeaveListFlex(session, leaves, 1));
        }

        // 2. ปุ่มกด "ดูรายชื่อแจ้งลา" จากหน้าสรุป
        if (e.type === "postback" && e.postback.data.includes("action=view_list")) {
          const params = new URLSearchParams(e.postback.data);
          const status = params.get("status");
          const page = Number(params.get("page") || 1);
          const session = await getSessionById(params.get("session_id")) || await getLatestActiveSession();

          if (status === "present") {
            const all = await getAllAttendanceBySession(session.session_id);
            return client.replyMessage(replyToken, buildPresentListFlex(session, all.filter(a => ["present", "late"].includes(a.status))));
          } else if (status === "leave" && session) {
            const leaves = await getLeavesBySession(session.session_id, session.class_id);
            return client.replyMessage(replyToken, buildLeaveListFlex(session, leaves, page));
          } else if (status === "absent") {
            const [all, roster] = await Promise.all([getAllAttendanceBySession(session.session_id), getRoster(session.class_id)]);
            const attIds = new Set(all.map(a => a.line_user_id));
            return client.replyMessage(replyToken, buildAbsentListFlex(session, roster.filter(r => !attIds.has(r.line_user_id))));
          }
        }

        // 3. ปุ่มกด "ดูรายละเอียดการลา" (ดึงข้อมูลด้วย Primary Key leave_id ตรงๆ ไม่ต้องใช้ Index)
        if (e.type === "postback" && e.postback.data.includes("action=view_leave_detail")) {
          const leaveId = new URLSearchParams(e.postback.data).get("leave_id");
          const leaveRec = await getLeaveRecord(leaveId);

          if (!leaveRec) {
            return client.replyMessage(replyToken, { type: "text", text: "ไม่พบข้อมูลใบลา" });
          }

          if (!ALLOWED_SESSION_IDS.includes(leaveRec.session_id)) {
            return client.replyMessage(replyToken, { type: "text", text: "รายการนี้ไม่ได้อยู่ใน session ที่ใช้งาน" });
          }

          const session = await getSessionById(leaveRec.session_id) || await getLatestActiveSession();
          const detailFlex = buildLeaveDetailFlex(leaveRec, session);

          // ไม่ส่ง image message แยก เพราะ presigned URL/ขนาดไฟล์บางกรณีทำให้ LINE 400 ได้
          // ใช้ปุ่ม URI ใน Flex แทน ปลอดภัยกว่า
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
          // session ยังเปิดอยู่ → มีปุ่มเช็คชื่อ, หมดแล้ว → ไม่มีปุ่ม
          const stillActive = isActiveSession(activeSession);
          const checkinLink = activeSession.checkin_link || `${FRONTEND_BASE_URL}/checkin.html?session_id=${activeSession.session_id}`;
          const notCheckedFlex = stillActive
            ? buildStudentNotCheckedActiveFlex(activeSession, checkinLink)
            : buildStudentAbsentFlex(activeSession);
          return client.replyMessage(replyToken, notCheckedFlex);
        }


        // ── แทนที่ reply text เดิมด้วย Flex message ──────────────────
 
        const attachmentPath = getAttachmentPath(attendance);
 
        if (attendance.status === "present" || attendance.status === "late") {
          // เช็คชื่อแล้ว / มาสาย
          return client.replyMessage(replyToken, buildStudentPresentFlex(attendance, activeSession));
        }
 
        if (attendance.status === "leave") {
          // มีเอกสารแนบ → เปิด TeacherViewPicture.html (เหมือนฝั่งอาจารย์)
          if (attachmentPath) {
            const viewerUrl = `${FRONTEND_BASE_URL}/TeacherViewPicture.html?file_path=${encodeURIComponent(attachmentPath)}&name=${encodeURIComponent(attendance.attachment_name || "เอกสารแจ้งลา")}`;
            return client.replyMessage(replyToken, buildStudentLeaveWithDocFlex(attendance, activeSession, viewerUrl));
          }
          // ไม่มีเอกสาร
          return client.replyMessage(replyToken, buildStudentLeaveNoDocFlex(attendance, activeSession));
        }
 
        // status อื่น (absent ที่ system เซ็ต) — ใช้ absent flex
        return client.replyMessage(replyToken, buildStudentAbsentFlex(activeSession));
      } catch (err) {
        console.error("HANDLER ERROR:", err);
        try {
          if (e.replyToken) {
            await client.replyMessage(e.replyToken, {
              type: "text",
              text: "ระบบเกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"
            });
          }
        } catch (replyErr) {
          console.error("FALLBACK REPLY ERROR:", replyErr);
        }
      }
    })
  );

  return {
    statusCode: 200,
    body: "OK"
  };
};