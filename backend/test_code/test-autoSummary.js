const { handler } = require("../autoSummary.js");

handler()
  .then((res) => {
    console.log("===== RESULT =====");
    console.log(res);

    console.log("===== BODY =====");
    console.log(JSON.parse(res.body));
  })
  .catch((err) => {
    console.error("ERROR:", err);
  });