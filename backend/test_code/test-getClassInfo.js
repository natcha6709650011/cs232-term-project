const { handler } = require("../getClassInfo");

const event = {
  pathParameters: {
    line_user_id: "U123456"
  }
};

handler(event)
  .then((res) => {
    console.log("RESULT:");
    console.log(res);

    console.log("BODY:");
    console.log(JSON.parse(res.body));
  })
  .catch(console.error);