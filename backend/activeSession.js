const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient();

const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "Sessions";

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "OPTIONS,GET,POST"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  try {
    if (event.requestContext?.http?.method === "OPTIONS") {
      return response(200, { success: true });
    }

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

    const sessions = result.Items || [];

    if (sessions.length === 0) {
      return response(404, {
        success: false,
        message: "active session not found"
      });
    }

    sessions.sort((a, b) => {
      const timeA = new Date(a.start_time || a.created_at || 0).getTime();
      const timeB = new Date(b.start_time || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    const session = sessions[0];

    return response(200, {
      success: true,
      session_id: session.session_id,
      data: session
    });
  } catch (error) {
    console.error("active session error:", error);

    return response(500, {
      success: false,
      message: error.message || "cannot get active session"
    });
  }
};