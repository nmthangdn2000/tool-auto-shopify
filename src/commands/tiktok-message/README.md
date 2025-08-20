# Hướng dẫn sử dụng hàm click trong vùng main content

## Tổng quan

Đã thêm 4 hàm mới vào class `TiktokMessageCommand` để thực hiện click trong vùng bỏ header, sidebar và bottom (input chat):

1. `clickInMainContentArea()` - Click tại vị trí cụ thể
2. `clickRandomInMainContentArea()` - Click ngẫu nhiên trong vùng an toàn
3. `clickElementInMainContentArea()` - Click vào element cụ thể
4. `naturalClickInMainContentArea()` - Click tự nhiên với hiệu ứng di chuyển chuột

## Cách sử dụng

### 1. Click tại vị trí cụ thể

```typescript
// Click ở giữa vùng main content
await this.clickInMainContentArea(page);

// Click ở góc trên bên phải của vùng main content
await this.clickInMainContentArea(page, 0.9, 0.1);

// Tùy chỉnh kích thước header, sidebar và bottom
await this.clickInMainContentArea(page, 0.5, 0.5, {
  headerHeight: 100,
  sidebarWidth: 300,
  bottomHeight: 150,
  delay: 200,
  button: 'left',
  clickCount: 1,
});
```

### 2. Click ngẫu nhiên

```typescript
// Click ngẫu nhiên trong vùng an toàn
await this.clickRandomInMainContentArea(page);

// Tùy chỉnh vùng click ngẫu nhiên
await this.clickRandomInMainContentArea(page, {
  headerHeight: 80,
  sidebarWidth: 240,
  bottomHeight: 120,
  minX: 0.2,
  maxX: 0.8,
  minY: 0.2,
  maxY: 0.8,
  delay: 150,
});
```

### 3. Click vào element cụ thể

```typescript
// Click vào button có class 'btn-primary'
await this.clickElementInMainContentArea(page, '.btn-primary');

// Click với tùy chọn force nếu element nằm ngoài vùng an toàn
await this.clickElementInMainContentArea(page, '.btn-primary', {
  force: true,
  timeout: 15000,
  bottomHeight: 120,
});
```

### 4. Click tự nhiên với hiệu ứng di chuyển chuột

```typescript
// Click tự nhiên ở giữa màn hình
await this.naturalClickInMainContentArea(page);

// Click tự nhiên với tùy chỉnh thời gian
await this.naturalClickInMainContentArea(page, 0.5, 0.5, {
  headerHeight: 200,
  sidebarWidth: 450,
  bottomHeight: 120,
  preClickDelay: 150, // Thời gian chờ trước khi click
  postClickDelay: 100, // Thời gian chờ sau khi click
});

// Click tự nhiên ngẫu nhiên để tạo hiệu ứng thật
const randomX = Math.random() * 0.8 + 0.1;
const randomY = Math.random() * 0.6 + 0.2;
await this.naturalClickInMainContentArea(page, randomX, randomY, {
  preClickDelay: Math.random() * 200 + 100,
  postClickDelay: Math.random() * 150 + 50,
});
```

## Tham số

### clickInMainContentArea()

- `page`: Playwright Page object
- `x`: Tọa độ X tương đối (0-1), mặc định 0.5 (giữa)
- `y`: Tọa độ Y tương đối (0-1), mặc định 0.5 (giữa)
- `options`:
  - `headerHeight`: Chiều cao header (px), mặc định 80
  - `sidebarWidth`: Chiều rộng sidebar (px), mặc định 240
  - `bottomHeight`: Chiều cao bottom/input chat (px), mặc định 120
  - `delay`: Độ trễ giữa mousedown và mouseup (ms), mặc định 100
  - `button`: Loại button ('left', 'right', 'middle'), mặc định 'left'
  - `clickCount`: Số lần click, mặc định 1

### clickRandomInMainContentArea()

- `page`: Playwright Page object
- `options`:
  - `headerHeight`: Chiều cao header (px), mặc định 80
  - `sidebarWidth`: Chiều rộng sidebar (px), mặc định 240
  - `bottomHeight`: Chiều cao bottom/input chat (px), mặc định 120
  - `minX`, `maxX`: Vùng X tương đối cho click ngẫu nhiên, mặc định 0.1-0.9
  - `minY`, `maxY`: Vùng Y tương đối cho click ngẫu nhiên, mặc định 0.1-0.9
  - `delay`: Độ trễ click (ms), mặc định 100

### clickElementInMainContentArea()

- `page`: Playwright Page object
- `selector`: CSS selector của element
- `options`:
  - `headerHeight`: Chiều cao header (px), mặc định 80
  - `sidebarWidth`: Chiều rộng sidebar (px), mặc định 240
  - `bottomHeight`: Chiều cao bottom/input chat (px), mặc định 120
  - `timeout`: Thời gian chờ element (ms), mặc định 10000
  - `force`: Bỏ qua kiểm tra vùng an toàn, mặc định false

### naturalClickInMainContentArea()

- `page`: Playwright Page object
- `x`: Tọa độ X tương đối (0-1), mặc định 0.5 (giữa)
- `y`: Tọa độ Y tương đối (0-1), mặc định 0.5 (giữa)
- `options`:
  - `headerHeight`: Chiều cao header (px), mặc định 80
  - `sidebarWidth`: Chiều rộng sidebar (px), mặc định 240
  - `bottomHeight`: Chiều cao bottom/input chat (px), mặc định 120
  - `preClickDelay`: Thời gian chờ trước khi click (ms), mặc định 100
  - `postClickDelay`: Thời gian chờ sau khi click (ms), mặc định 50
  - `button`: Loại button ('left', 'right', 'middle'), mặc định 'left'

## Ví dụ thực tế

```typescript
// Trong method run() hoặc các method khác
async someMethod(page: Page) {
  // Click vào giữa màn hình để đóng popup
  await this.clickInMainContentArea(page, 0.5, 0.5);

  // Click ngẫu nhiên để tương tác tự nhiên
  await this.clickRandomInMainContentArea(page);

  // Click vào button cụ thể
  const clicked = await this.clickElementInMainContentArea(page, 'button[data-e2e="follow"]');
  if (!clicked) {
    console.log('Button không nằm trong vùng an toàn');
  }

  // Click tự nhiên với hiệu ứng di chuyển chuột
  await this.naturalClickInMainContentArea(page, 0.3, 0.4, {
    preClickDelay: 200,
    postClickDelay: 100,
  });
}
```

## Lưu ý

- Các hàm này đảm bảo click chỉ xảy ra trong vùng an toàn (bỏ header, sidebar và bottom/input chat)
- Tọa độ được tính tương đối (0-1) để dễ sử dụng
- Có logging để debug vị trí click
- Hỗ trợ các tùy chọn click như delay, button type, click count
- Mặc định bottomHeight = 120px để tránh click nhầm vào input chat
- Hàm `naturalClickInMainContentArea()` tạo hiệu ứng click tự nhiên với `mousedown` và `mouseup` riêng biệt
- Sử dụng `page.mouse.move()` với `steps` để tạo hiệu ứng di chuyển chuột mượt mà
