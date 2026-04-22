const path = require("path");

// โหลด .env จาก backend/
require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

const { handler } = require("../login");

// จำลอง event แบบ Lambda
const event = {
  body: JSON.stringify({
    line_user_id: "U123456789",
    username: "6709650011",
    password: "1849901789177"
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