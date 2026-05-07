const AWS = require("aws-sdk");
const { response } = require("./common");

const s3 = new AWS.S3({
  signatureVersion: "v4"
});

const BUCKET_NAME = process.env.BUCKET_NAME || "tu-attendance-images-s3";

exports.handler = async (event) => {
  try {
    const query = event.queryStringParameters || {};

    const folder = query.folder || "leave";
    const fileName = query.file_name || query.filename || "upload-file";
    const contentType =
      query.content_type ||
      query.contentType ||
      "application/octet-stream";

    const safeFileName = fileName.replace(/[^\w.\-ก-๙]/g, "_");
    const filePath = `${folder}/${Date.now()}-${safeFileName}`;

    const uploadUrl = await s3.getSignedUrlPromise("putObject", {
      Bucket: BUCKET_NAME,
      Key: filePath,
      ContentType: contentType,
      Expires: 300
    });

    return response(200, {
      success: true,
      upload_url: uploadUrl,
      file_path: filePath,
      file_url: `https://${BUCKET_NAME}.s3.amazonaws.com/${filePath}`
    });
  } catch (error) {
    console.error("generateUploadUrl error:", error);

    return response(500, {
      success: false,
      message: "internal server error",
      error: error.message
    });
  }
};