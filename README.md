# Xiaozhi MCP Manager - Cloudflare v0.2

Mục tiêu: chạy trên Cloudflare Workers + Durable Objects, giao diện tiếng Việt.

## Có sẵn
- Mỗi tên thiết bị dùng một Durable Object riêng
- Lưu MCP Endpoint trong Durable Object storage
- Token bị che trên giao diện
- Kết nối/ngắt outbound WebSocket
- MCP initialize + tools/list thử nghiệm
- Online/Offline, log, get_time

## Triển khai
Yêu cầu: tài khoản Cloudflare và Node.js/npm trên máy dùng để deploy.

1. Giải nén.
2. Chạy `npm install`.
3. Chạy `npx wrangler login` và đăng nhập Cloudflare.
4. Chạy `npm run deploy`.
5. Wrangler sẽ trả URL `*.workers.dev`; mở URL đó để dùng giao diện.

## Cảnh báo / trạng thái thử nghiệm
- Không gửi MCP token đầy đủ cho người khác.
- Endpoint thật được lưu trong Durable Object storage vì server cần nó để kết nối.
- Bản này chưa được thử với MCP Endpoint Xiaozhi thật của bạn, nên handshake `initialize/tools/list`
  có thể cần chỉnh theo giao thức cụ thể của Xiaozhi.
- Outbound WebSocket không dùng được Hibernation API như WebSocket inbound. Cloudflare hiện nói
  outbound connection chỉ ngăn Durable Object bị eviction tối đa 15 phút. Vì vậy v0.2 phù hợp để
  kiểm tra kiến trúc/kết nối; trước khi gọi là 24/7 production cần kiểm tra hành vi endpoint Xiaozhi
  và thiết kế reconnect/keepalive phù hợp.
