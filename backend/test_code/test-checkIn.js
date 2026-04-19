require("dotenv").config();
const { handler } = require("../checkIn");

// จำลอง request จาก frontend
const event = {
  body: JSON.stringify({
    line_user_id: "U99999999",
    session_id: "SESSION001",
    latitude: 13.7368,
    longitude: 100.5232,
    image_url: "https://example.com/student1.jpg"
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