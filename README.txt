# SyncBridge — PC ↔ Mobile Transfer

## ফাইল
- `index.html` — ওয়েবসাইটের কাঠামো
- `style.css` — ডিজাইন
- `script.js` — QR pairing, WebRTC data connection, file/text transfer

## চালু করার নিয়ম
1. তিনটি ফাইল একই ফোল্ডারে রাখুন।
2. GitHub repository-তে তিনটি ফাইল আপলোড করুন।
3. Repository → Settings → Pages → Deploy from a branch → `main` / root নির্বাচন করুন।
4. HTTPS GitHub Pages URL PC ও মোবাইল—দুই ডিভাইসে খুলুন।
5. PC নির্বাচন করে Next চাপুন। মোবাইলে Mobile নির্বাচন করে QR স্ক্যান করুন অথবা কোড লিখে Match চাপুন।

## গুরুত্বপূর্ণ
- QR scanner-এর জন্য HTTPS এবং ক্যামেরার অনুমতি প্রয়োজন।
- PeerJS public signaling service ব্যবহৃত হচ্ছে; তাই ইন্টারনেট সংযোগ দরকার। এই সংস্করণে Firebase config লাগবে না।
- ফাইল/মেসেজ কোনো স্থায়ী database-এ লেখা হয় না। WebRTC দিয়ে ডিভাইস-টু-ডিভাইস ডেটা যায়। Pairing-এর সময় PeerJS signaling service-এ অস্থায়ী signaling তথ্য যায়।
- বড় ফাইল পাঠানোর সময় ব্রাউজার/ডিভাইসের RAM ও WebRTC সীমাবদ্ধতা প্রভাব ফেলতে পারে। প্রথমে ছোট ফাইল দিয়ে পরীক্ষা করুন।
- Facebook লিংক বদলাতে `index.html`-এর `id="facebookLink"`-এর href অথবা `script.js`-এ `$ ('facebookLink')`-এর সেটিং বদলান।
- Developer ছবি যোগ করতে চাইলে নিজের ছবি `profile.jpg` নামে রাখুন এবং `index.html`-এর `.avatar` অংশে `<img src="profile.jpg" alt="MD. ANIK HASAN">` ব্যবহার করে CSS-এ image fit সেট করুন।

## নোট
এটি একটি কার্যকর প্রাথমিক সংস্করণ, production enterprise deployment-এর আগে নিজস্ব signaling server, TURN server, বড় ফাইলের streaming/backpressure, rate limiting এবং security review যোগ করা উচিত।
