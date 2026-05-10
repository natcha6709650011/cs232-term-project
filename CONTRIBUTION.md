คนที่ 1: Backend Lead นางสาวณัชชา กาญจนาภา	รหัสนักศึกษา 6709650011
ดู flow หลักทั้งหมด
 • Lambda: start-session
 • Lambda: check-in
 • Logic present / absent / leave
 • เชื่อมทุกส่วนเข้าด้วยกัน


คนที่ 2: API & AWS Integration นายณัฐพัชญ์ อาจรนกิจ	รหัสนักศึกษา 6709650029
 • API Gateway
 • เชื่อม frontend ↔ backend
 • จัด route (/start-session, /check-in)
 • จัดโครง request/response


คนที่ 3: Database (DynamoDB) นายปรวีย์ คนหมั่น	รหัสนักศึกษา 6709650466
 • ออกแบบ table (Sessions, Attendance)
 • เขียน query
 • เชื่อม Lambda กับ DB



คนที่ 4: S3 + Camera + fetch message นายกลวัชร พินิจพงศ์	รหัสนักศึกษา 6709650110
 • อัปโหลดรูปไป S3
 • เขียน logic รับรูป
 • คืน image_url ให้ backend


คนที่ 5: LINE Bot นางสาวณัฐกฤตา ภูริวิกรัย	รหัสนักศึกษา 6709650292
 • สร้าง LINE Messaging API
 • ปุ่ม rich menu / fetch message line
 • แจ้งเตือน (onsite / online / cancel)


คนที่ 6: Frontend (Teacher) นางสาวชวัลรัตน์ ภาคอารีย์	รหัสนักศึกษา 6709650250
 • ปุ่ม:
 • เริ่มคาบ
 • online / cancel
 • dashboard ดูสถานะ UI ฝั่งอาจารย์

คนที่ 7: Frontend (Student - LIFF) นางสาววรรยา จันทะคาม	รหัสนักศึกษา 6709650078
 • หน้าเช็คชื่อ
 • เปิดกล้อง
 • ดึง GPS
 • ส่งข้อมูลไป backend

trello: https://trello.com/invite/b/6991cc296b7da38106a12cd9/ATTIaade2c2d5b4000e8610cb5862fadefac0F7A935E/project-planning
