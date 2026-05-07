const { response, dynamodb } = require("./common");

const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "Sessions";

exports.handler = async (event) => {
  try {
    // รองรับ CORS preflight
    if (event.requestContext?.http?.method === "OPTIONS") {
      return response(200, { success: true });
    }

    const now = Date.now();

    // หา session ที่ status = active
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

    let sessions = result.Items || [];

    // ถ้ามี expire_at ให้กรองเฉพาะ session ที่ยังไม่หมดอายุ
    sessions = sessions.filter((session) => {
      if (!session.expire_at) return true;
      return Number(session.expire_at) > now;
    });

    if (sessions.length === 0) {
      return response(404, {
        success: false,
        message: "active session not found"
      });
    }

    // เรียงเอา session ล่าสุด
    sessions.sort((a, b) => {
      const aTime = Number(a.created_at || 0);
      const bTime = Number(b.created_at || 0);
      return bTime - aTime;
    });

    const activeSession = sessions[0];

    return response(200, {
      success: true,
      session_id: activeSession.session_id,
      data: activeSession
    });

  } catch (error) {
    console.error("activeSession error:", error);

    return response(500, {
      success: false,
      message: "internal server error",
      error: error.message
    });
  }
};