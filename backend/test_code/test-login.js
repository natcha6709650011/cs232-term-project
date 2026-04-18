require("dotenv").config();
const { handler } = require("../login");

// จำลอง request แบบที่ API Gateway ส่งมา
const event = {
  body: JSON.stringify({
    line_user_id: "------",   // ใส่อะไรก็ได้ก่อน
    username: "natcha.kanch@dome.tu.ac.th",
    password: "------"
  })
};

handler(event)
  .then((res) => {
    console.log("RESULT:");
    console.log(res);

    console.log("BODY:");
    console.log(JSON.parse(res.body));
  })
  .catch((err) => {
    console.error("ERROR:", err);
  });