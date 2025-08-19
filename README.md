# Tool Auto Shopify

Tool tự động hóa cho các tác vụ trên Shopify và các nền tảng mạng xã hội.

## Cài đặt

```bash
# Cài đặt dependencies
npm install

# Build project
npm run build
```

## Commands

### 1. TikTok Message Command

Command để gửi tin nhắn tự động cho followers trên TikTok.

#### Cách sử dụng:

```bash
# Development mode
yarn command:dev tiktok-message <data-file> <message-file> <user-follow-csv>

# Production mode
yarn command tiktok-message <data-file> <message-file> <user-follow-csv>
```

#### Arguments:

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

#### Ví dụ chạy:

```bash
# Development
yarn command:dev tiktok-message ./src/commands/tiktok-message/data.json ./src/commands/tiktok-message/message.txt ./src/commands/tiktok-message/user_follow.csv

# Production
yarn command tiktok-message ./src/commands/tiktok-message/data.json ./src/commands/tiktok-message/message.txt ./src/commands/tiktok-message/user_follow.csv
```

### 2. Auto Blog Shopify Command

Command để tự động tạo blog trên Shopify.

#### Cách sử dụng:

```bash
# Development mode
yarn command:dev auto-blog.shopify <data-file>

# Production mode
yarn command auto-blog.shopify <data-file>
```

## Scripts

```bash
# Build project
npm run build

# Start development mode
npm run start:dev

# Start production mode
npm run start:prod

# Run commands
npm run command

# Run commands in development mode
npm run command:dev

# Lint code
npm run lint

# Format code
npm run format

# Run tests
npm run test
```

## Cấu trúc Project

```
src/
├── commands/
│   ├── auto-blog.shopify/
│   │   ├── auto-blog.shopify.command.ts
│   │   ├── data.json
│   │   └── prompt.ts
│   └── tiktok-message/
│       ├── tiktok-message.command.ts
│       ├── data.json
│       ├── message.txt
│       ├── user_follow.csv
│       └── README.md
├── utils/
│   ├── browser.util.ts
│   └── common.util.ts
├── app.module.ts
└── main.ts
```

## Lưu ý

- Đảm bảo đã đăng nhập vào các nền tảng trước khi chạy commands
- Các file CSV sẽ được tự động cập nhật khi có dữ liệu mới
- Trạng thái `chatted` trong CSV sẽ được cập nhật thành `true` sau khi gửi tin nhắn thành công
