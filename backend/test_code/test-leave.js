require("dotenv").config();
const { handler } = require("../leave");

const event = {
  body: JSON.stringify({
    line_user_id: "U99999999",
    session_id: "SESSION001",
    reason: "ป่วย",
    attachment_url: "https://example.com/medical.pdf"
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