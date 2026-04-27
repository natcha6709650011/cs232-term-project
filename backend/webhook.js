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
                const data = await dynamodb.query({
                    TableName: "Attendance",
                    IndexName: "line_user_id-index",
                    KeyConditionExpression: "line_user_id = :uid",
                    ExpressionAttributeValues: { ":uid": userId },
                    ScanIndexForward: false,
                    Limit: 5
                }).promise();

                // ป้องกันกรณีไม่พบข้อมูล
                if (data.Items.length === 0) {
                    await client.replyMessage(e.replyToken, { type: 'text', text: "ไม่พบประวัติการเข้าเรียนของคุณ" });
                    return;
                }

                const flex = {
                    type: "flex",
                    altText: "สถานะการเข้าเรียน",
                    contents: {
                        type: "bubble",
                        body: { type: "box", layout: "vertical", contents: [
                            { type: "text", text: "ประวัติการเข้าเรียนล่าสุด", weight: "bold", size: "lg" },
                            { type: "separator", margin: "md" },
                            ...data.Items.map(i => ({ type: "box", layout: "horizontal", margin: "md", contents: [
                                { type: "text", text: i.course_name || "ไม่ระบุวิชา", size: "sm", flex: 3 },
                                { type: "text", text: i.status === "present" ? "มาเรียน" : "ขาดเรียน", align: "end", color: i.status === "present" ? "#3EB489" : "#FF6B6B", size: "sm" }
                            ]}))
                        ]}
                    }
                };
                await client.replyMessage(e.replyToken, flex);
            }
        }));
    }
    return { statusCode: 200, body: "OK" };
};