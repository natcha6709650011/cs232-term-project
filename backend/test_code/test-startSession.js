require("dotenv").config();
const { handler } = require("../startSession");

// จำลอง request
const event = {
  body: JSON.stringify({
    line_user_id: "U123456789",
    type: "onsite",
    latitude: 13.7367,
    longitude: 100.5231
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