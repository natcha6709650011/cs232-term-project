const { handler } = require("../getStatus");

// จำลอง path parameter แบบที่ API Gateway ส่งมา
const event = {
  pathParameters: {
    session_id: "SESSION001"
  }
};

handler(event)
  .then((res) => {
    console.log("===== RESULT =====");
    console.log(res);

    console.log("===== BODY =====");
    console.log(JSON.parse(res.body));
  })
  .catch((err) => {
    console.error("ERROR:", err);
  });