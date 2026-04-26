from flask import Flask, request, abort
from linebot import LineBotApi, WebhookHandler
from linebot.models import FollowEvent, TextSendMessage

app = Flask(__name__)

line_bot_api = LineBotApi('6EwCJpBOqiFvz63rCvNPMpNR9jvemqJy/zuPiskIuAGazcuXEG1ktZA26GtqHAze7rvdF6oTn/KmZjZ2MZ45yVa4otKmHHxYOv/1vakJND8t2hcTbiHrQaNWnZv18EBZG39yasy+gT1vj2uIR2QwzQdB04t89/1O/w1cDnyilFU=')
handler = WebhookHandler('ab5da2602e01f2fb70ff06b6c278292f')

@handler.add(FollowEvent)
def handle_follow(event):
    line_bot_api.reply_message(
        event.reply_token,
        TextSendMessage(
            text="สวัสดีครับ/ค่ะ 👋\n"
                 "ยินดีต้อนรับสู่ช่องทางติดต่อเจ้าหน้าที่ TU Class\n\n"
                 "📌 พิมพ์ข้อความที่ต้องการสอบถามได้เลยครับ/ค่ะ\n"
                 "⏰ เจ้าหน้าที่ให้บริการ จ-ศ 08:30-16:30 น."
        )
    )

@app.route("/webhook", methods=['POST'])
def webhook():
    signature = request.headers['X-Line-Signature']
    body = request.get_data(as_text=True)
    handler.handle(body, signature)
    return 'OK'

if __name__ == "__main__":
    app.run(port=5000)