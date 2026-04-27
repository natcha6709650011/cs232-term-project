const line = require("@line/bot-sdk");
const { dynamodb } = require("./common");

const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
});

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

        if (!replyToken) return;

        const isCheckStatus =
          (e.type === "message" &&
            e.message?.text === "สถานะของฉัน") ||
          (e.type === "postback" &&
            e.postback?.data?.includes("action=check_status"));

        if (!isCheckStatus) return;

        console.log("CHECK STATUS FOR:", userId);

        // =========================
        // 🔥 STEP 1: ดึงล่าสุดจาก GSI
        // =========================
        const result = await dynamodb
          .query({
            TableName: "Attendance",
            IndexName: "line_user_id-index",
            KeyConditionExpression: "line_user_id = :uid",
            ExpressionAttributeValues: {
              ":uid": userId
            },
            ScanIndexForward: false, // ล่าสุดก่อน
            Limit: 1
          })
          .promise();

        const latest = result.Items?.[0];

        if (!latest) {
          return client.replyMessage(replyToken, {
            type: "text",
            text: "❌ ไม่พบข้อมูลการเช็คชื่อของคุณ"
          });
        }

        // =========================
        // 🔥 format status
        // =========================
        const statusMap = {
          present: "✅ มาเรียน",
          leave: "🟡 ลา",
          absent: "❌ ขาดเรียน"
        };

        const statusText =
          statusMap[latest.status] || "❓ ไม่ทราบสถานะ";

        // =========================
        // 🔥 format time
        // =========================
        const time = latest.checkin_time
            ? new Date(latest.checkin_time * 1000)
                .toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
            : "-";

        // =========================
        // 🔥 reply
        // =========================
        return client.replyMessage(replyToken, {
          type: "text",
          text:
            `📊 สถานะล่าสุด\n` +
            `วิชา: ${latest.course_name || "-"}\n` +
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