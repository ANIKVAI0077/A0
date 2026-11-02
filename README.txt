SyncBridge — Complete refreshed project

Files:
- index.html
- style.css
- script.js
- profile.png

Deploy:
1. Extract this ZIP.
2. Upload all four files to the same root folder of your GitHub Pages repository, replacing old files.
3. Ensure GitHub Pages is served over HTTPS.
4. Open the site on PC, choose PC, and wait for the QR code.
5. On the phone open the same HTTPS site, choose Mobile, scan the QR, then tap Match if the QR link only fills the code.
6. Both screens should show the same session chat interface after connection.

Important technical notes:
- PeerJS public signaling is used to establish a WebRTC peer-to-peer data connection. Internet access is required; a TURN relay may be needed on restrictive networks.
- Messages/files are not stored in a database. The visible history is in page memory and is cleared on disconnect or refresh.
- Files up to 100 MB are allowed by this front-end guard; practical limits depend on browser/device/network memory.
- Camera access requires HTTPS and browser permission.
- Replace the Facebook URL in script.js with your actual profile/page URL.
- This project was statically checked for required HTML IDs and JavaScript syntax. Real-world network/browser testing is still required; no one can guarantee zero issues across every device/network.
