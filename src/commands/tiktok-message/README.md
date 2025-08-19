# TikTok Message Command

Command để gửi tin nhắn tự động cho followers trên TikTok.

## Cách sử dụng

```bash
# Build project trước
npm run build

# Chạy command
npm run command tiktok-message <data-file> <message-file> <user-follow-csv>
```

## Arguments

1. **data-file**: File JSON chứa cấu hình (ví dụ: `data.json`)

   ```json
   {
     "user_id": "your_tiktok_username",
     "is_close_browser": false
   }
   ```

2. **message-file**: File text chứa nội dung tin nhắn (ví dụ: `message.txt`)

   ```
   Xin chào! Cảm ơn bạn đã follow tôi.
   ```

3. **user-follow-csv**: File CSV chứa danh sách followers (ví dụ: `user_follow.csv`)
   ```csv
   uniqueId,nickname,id,chatted
   user123,Nick Name,123456789,false
   ```

## Cấu trúc file CSV

File `user_follow.csv` có các cột:

- `uniqueId`: ID duy nhất của user
- `nickname`: Tên hiển thị của user
- `id`: ID TikTok của user
- `chatted`: Trạng thái đã gửi tin nhắn (true/false)

## Ví dụ chạy

```bash
npm run command tiktok-message data.json message.txt user_follow.csv
```

## Lưu ý

- Command sẽ tự động đọc và cập nhật file CSV khi có followers mới
- Trạng thái `chatted` sẽ được cập nhật thành `true` sau khi gửi tin nhắn thành công
- Đảm bảo đã đăng nhập TikTok trước khi chạy command
- **Tính năng mới**: Nếu file CSV chưa tồn tại hoặc không có header, command sẽ tự động tạo file với header `uniqueId,nickname,id,chatted`
