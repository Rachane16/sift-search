# Sift — ถามมาเลย

หน้าเว็บแชตค้นข้อมูลภาษาไทยบน [GitHub Pages](https://rachane16.github.io/sift-search/) ถามต่อจากคำถามก่อนหน้าได้ เลือกตอบสั้นหรือยาว และมีลิงก์สั้น ๆ ให้อ่านต้นฉบับต่อ ถ้าข้อมูลไม่พอ ระบบจะบอกตามตรง

หน้าเว็บในรีโปนี้เป็น **static frontend** ส่วน API ค้นหาอยู่ที่ [Sift Sites](https://sift-search-th.tealshell64.chatgpt.site) และรันบนเซิร์ฟเวอร์แยก เพราะ [GitHub Pages ใช้เผยแพร่ไฟล์ static](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) หน้าเว็บส่งคำถามพร้อมคีย์ที่ผู้ใช้กรอกผ่าน HTTPS ไปยัง API นี้ คีย์อยู่ในหน่วยความจำของแท็บ ไม่ฝังในโค้ด ไม่เก็บใน localStorage และต้องกรอกใหม่หลังรีเฟรช

ปกติคำถามหนึ่งใช้ Tavily search หนึ่งครั้งและโมเดล Gemini หรือ Groq หนึ่งครั้ง โมเดลต้องคืนแหล่งข้อมูลและข้อความจากผลค้น โปรแกรมตรวจว่าลิงก์และข้อความนั้นมีอยู่จริงก่อนแสดงคำตอบ แต่ไม่ได้รับประกันว่าการตีความของโมเดลถูกทุกเรื่อง

## พัฒนาและเผยแพร่

```sh
npm install
npm run dev
npm run build
```

`github-pages/` เป็น entry point, `app/` เป็นหน้าและ API route, `lib/search-engine.ts` เป็นตรรกะค้นหา, `tests/` เป็นการทดสอบ, `docs/` เป็นไฟล์ที่ build แล้วสำหรับ GitHub Pages ตั้งค่า Pages ให้เผยแพร่จาก `main` และ `/docs`

GitHub Pages ไม่รัน API route ในรีโปนี้ ไฟล์ route และ engine เปิดเผยไว้เพื่อให้ตรวจดูและนำไปโฮสต์บน runtime ที่รองรับ หากจะย้าย API ไปโฮสต์อื่น ต้องแก้ `window.__SIFT_API_URL__` ใน `github-pages/index.html` แล้ว build ใหม่

ยังไม่ได้ทดสอบคำถามจริงด้วยคีย์ของผู้ใช้ ความเร็วและความแม่นยำปลายทางขึ้นกับ Tavily, โมเดล และข้อมูลที่ค้นพบ

