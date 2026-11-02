SyncBridge — Updated session chat version

Files:
- index.html
- style.css
- script.js
- profile.png (developer photo supplied for this website)

Install:
1. Keep all five files in the same folder.
2. Upload them to the root of your GitHub Pages repository.
3. Enable GitHub Pages using Settings > Pages > Deploy from a branch > main > /(root).
4. Open the HTTPS website on the PC and phone. Select PC on one device and Mobile on the other, then scan the QR code.

What changed:
- After pairing, both devices open the same chat-style interface.
- Both sent and received text messages appear in the session history on both devices.
- Sent and received files appear in the same history. The receiving device gets a Download link.
- Messages and session history are held only in the page memory; disconnecting/refreshing clears the local history.
- Your supplied developer photo is used instead of the AH initials.

Important:
- Camera access requires HTTPS and permission.
- PeerJS public signaling is used to establish WebRTC. Internet access is required.
- Actual file/message data is sent through the WebRTC data connection, not saved to a database.
- This is a functional prototype. For production scale, use your own signaling infrastructure, TURN server, rate limiting, file-size limits, and security review.
- Replace the Facebook URL in index.html (id="facebookLink") with your actual profile URL.
