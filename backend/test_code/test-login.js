const path = require("path");

// โหลด .env จากโฟลเดอร์ backend
require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

const { handler } = require("../login");

// จำลอง event แบบ Lambda
const event = {
  body: JSON.stringify({
    line_user_id: "U123456789",
    username: "//รหัสนศ หรือ userอาจารย์//",
    password: "บัตรปชช หรือ passwordอาจารย์"
  })
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