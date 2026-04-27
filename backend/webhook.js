const line = require('@line/bot-sdk');
const { dynamodb } = require("./common");
const client = new line.Client({ channelAccessToken: process.env.LINE_ACCESS_TOKEN, channelSecret: process.env.LINE_CHANNEL_SECRET });

exports.handler = async (event) => {
    const body = JSON.parse(event.body);

    // 1. รับคำสั่งแจ้งเตือน (ผ่าน API อื่นเรียกมา)
    if (body.action === 'notify_students') {
        await client.multicast(body.students, [{
            type: "text",
            text: `📢 ${body.sessionDetails.course_name} เริ่มแล้ว! เช็คชื่อที่: ${body.sessionDetails.checkin_link}`
        }]);
        return { statusCode: 200, body: "OK" };
    }

    // 2. รับ Event จาก LINE (Message หรือ Postback)
    if (body.events && body.events.length > 0) {
        await Promise.all(body.events.map(async (e) => {
            const userId = e.source.userId;
            let isTriggered = false;

            // เช็คว่าเป็นข้อความ "สถานะของฉัน" หรือ Postback จาก Rich Menu
            if (e.type === 'message' && e.message.text === 'สถานะของฉัน') isTriggered = true;
            if (e.type === 'postback' && e.postback.data === 'action=check_status') isTriggered = true;

            if (isTriggered) {
                const user = await dynamodb.get({
                    TableName: "Users",
                    Key: { line_user_id: userId }
                }).promise();

                const lastSessionId = user.Item?.last_session_id;

                if (!lastSessionId) {
                    await client.replyMessage(e.replyToken, { type: 'text', text: "คุณยังไม่มีประวัติการเช็คชื่อล่าสุดครับ" });
                    return;
                }

                const data = await dynamodb.query({
                    TableName: "Attendance",
                    KeyConditionExpression: "session_id = :sid AND line_user_id = :uid",
                    ExpressionAttributeValues: { 
                        ":sid": lastSessionId,
                        ":uid": userId 
                    }
                }).promise();

                if (data.Items.length === 0) {
                    await client.replyMessage(e.replyToken, { type: 'text', text: "ไม่พบข้อมูลการเช็คชื่อในวิชาล่าสุด" });
                    return;
                }

                const item = data.Items[0];
                const flex = {
                    type: "flex",
                    altText: "สถานะล่าสุด",
                    contents: {
                        type: "bubble",
                        body: { type: "box", layout: "vertical", contents: [
                            { type: "text", text: "สถานะการเช็คชื่อล่าสุด", weight: "bold", size: "lg" },
                            { type: "separator", margin: "md" },
                            { type: "text", text: item.course_name || "ไม่ระบุวิชา", margin: "md" },
                            { type: "text", text: item.status === "present" ? "มาเรียน" : "ขาดเรียน", color: item.status === "present" ? "#3EB489" : "#FF6B6B" }
                        ]}
                    }
                };
                await client.replyMessage(e.replyToken, flex);
            }
        }));
    }
    return { statusCode: 200, body: "OK" };
};