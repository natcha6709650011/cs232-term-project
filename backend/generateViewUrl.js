const AWS = require("aws-sdk");

const s3 = new AWS.S3();

const BUCKET_NAME =
  process.env.BUCKET_NAME ||
  process.env.S3_BUCKET ||
  "tu-attendance-images-s3";

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
    console.log("GENERATE VIEW URL EVENT:", JSON.stringify(event));

    if (event.requestContext?.http?.method === "OPTIONS") {
      return response(200, { success: true });
    }

    const query = event.queryStringParameters || {};

    let filePath =
      query.file_path ||
      query.filePath ||
      query.key ||
      query.image_url ||
      query.attachment_url;

    if (!filePath) {
      const body =
        typeof event.body === "string"
          ? JSON.parse(event.body || "{}")
          : event.body || {};

      filePath =
        body.file_path ||
        body.filePath ||
        body.key ||
        body.image_url ||
        body.attachment_url;
    }

    if (!filePath) {
      return response(400, {
        success: false,
        message: "missing file_path"
      });
    }

    // กันกรณี frontend ส่ง URL เต็มมา ให้ตัดเหลือแค่ path ใน S3
    if (filePath.startsWith("http")) {
      const url = new URL(filePath);
      filePath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    }

    // กัน path มี / นำหน้า
    filePath = filePath.replace(/^\/+/, "");

    const viewUrl = s3.getSignedUrl("getObject", {
      Bucket: BUCKET_NAME,
      Key: filePath,
      Expires: 60 * 10
    });

    return response(200, {
      success: true,
      view_url: viewUrl,
      file_path: filePath
    });
  } catch (error) {
    console.error("generate view url error:", error);

    return response(500, {
      success: false,
      message: error.message || "generate view url failed"
    });
  }
};