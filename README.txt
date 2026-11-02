SyncBridge — Updated Website
============================

Files:
- index.html
- style.css
- script.js
- profile.png

Setup:
1. Upload all four files to the same GitHub Pages folder/repository.
2. Enable GitHub Pages.
3. Open the published HTTPS link on both PC and mobile.
4. On PC choose PC and keep the QR/code screen open.
5. On mobile choose Mobile, scan the QR or enter the 8-character code, then connect.

File transfer improvements:
- Acknowledgement waiter is registered BEFORE each packet is sent (fixes fast ACK race).
- Start, every chunk, and file completion are acknowledged.
- 16 KB chunks are sent sequentially to avoid overwhelming the data channel.
- Receiver checks exact file size before creating the download.
- Supports common file types including photos, PDF, documents, audio and video, up to 100 MB per file.

Privacy and limits:
- Chat and file data are held in browser memory only and are cleared when the session ends.
- Uses PeerJS public signaling and WebRTC peer-to-peer data channels.
- Both devices need internet access. Some networks/firewalls may prevent direct WebRTC transfer.
- Camera QR scanning requires HTTPS and camera permission.
- Test with two devices before relying on important transfers.
- Replace the Facebook link in script.js with your actual profile URL.
