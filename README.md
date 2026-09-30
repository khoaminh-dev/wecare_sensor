# wecare · Sensor Companion

Web/PWA tối ưu cho điện thoại, phong cách xanh ngọc và lá từ thiết kế tham chiếu. Nhận dữ liệu MAX30102 + MPU6050 qua Web Bluetooth trên XIAO ESP32-C3.

## Chạy và triển khai

Không cần cài dependency cho ứng dụng.

```sh
npm run dev
# http://localhost:3000
npm test
npm run build
```

Vercel: đưa mã nguồn này vào một kho GitHub mới (gợi ý `wecare-sensor`), Import Project trong tài khoản Vercel, giữ `vercel.json`. Build Command `npm run build`, Output Directory `dist`, Framework Preset `Other`. Không cần biến môi trường, database hay tài khoản đăng nhập cho bản này.

Có thể dùng Vercel CLI khi đã đăng nhập:

```sh
npx vercel
npx vercel --prod
```

Các lệnh triển khai ở trên là hướng dẫn; bản đóng gói này chưa được triển khai lên Vercel.

## Trên điện thoại

1. Mở link HTTPS bằng Chrome trên Android.
2. Bật nguồn mạch và Bluetooth điện thoại.
3. Nhấn **Kết nối thiết bị**, chọn **VieGrand-Sensor**.
4. Giữ cảm biến ở tư thế chuẩn, mở **Đặt gốc** và nhấn **Ghi tư thế hiện tại** để đặt tọa độ tương đối về 0, 0, 0.
5. Đặt ngón tay ổn định trên MAX30102 để đọc BPM.
6. Cài đặt → Cài đặt wecare (hoặc Chrome ⋮ → Thêm vào màn hình chính).
7. Nút góc trên bên phải bật toàn màn hình trên trình duyệt hỗ trợ.

iPhone/iPad có thể xem giao diện và demo; Web Bluetooth không được hỗ trợ trực tiếp trong Chrome/Safari trên iOS. Ứng dụng hiển thị hướng dẫn khi trình duyệt thiếu tính năng. Giữ trang đang mở khi đo; không bảo đảm nhận BLE khi chạy nền hoặc khóa màn hình.

## Tính năng

- Màn hình chào WeCare với biểu tượng vector lấy cảm hứng từ ảnh mẫu.
- Tổng quan: nhịp tim, gia tốc X/Y/Z, độ lớn gia tốc, IR, mô hình nghiêng 3D bằng CSS.
- Đặt và lưu tư thế gốc; hiển thị gia tốc, pitch và roll tương đối, đồng thời hiệu chỉnh mô hình 3D theo mốc đã lưu.
- Cấu hình hướng cảm biến bằng preset xoay 0°/90°/180°/270°, lật mặt hoặc ánh xạ từng trục mô hình sang ±X/±Y/±Z của MPU6050.
- Cảnh báo chuyển động mạnh và rung lặp lại với công tắc, ngưỡng tùy chỉnh, rung/notification khi trình duyệt cho phép và nhật ký tối đa 100 sự kiện lưu cục bộ.
- Biểu đồ 60 giây, thống kê, xuất CSV có cột nguồn dữ liệu và loại gói.
- Demo được ghi nhãn rõ; không tự bật khi kết nối thất bại.
- Giao diện cài được ra màn hình chính, có service worker lưu giao diện ngoại tuyến.
- Nút toàn màn hình và tùy chọn giữ màn hình sáng khi hỗ trợ.
- Dữ liệu chỉ nằm trong RAM của tab; không gửi dữ liệu cảm biến lên máy chủ.
- Lưu tối đa 50.000 sự kiện; CSV có dòng cho từng gói BLE. Tải lại trang hoặc bắt đầu kết nối/demo mới sẽ xóa phiên cũ; hãy xuất CSV trước.
- Số đo cũ hơn 3,5 giây không còn hiển thị như số đo trực tiếp. Biểu đồ để trống khoảng gián đoạn >1,5 giây.

## Giao thức tương thích firmware

| Loại | UUID | Chuỗi UTF-8 |
|---|---|---|
| Service | `37af0000-39a2-4fce-9c60-01ee00000000` | — |
| BPM | `37af0001-39a2-4fce-9c60-01ee00000000` | `78`, hoặc `-1` khi chưa hợp lệ |
| Gia tốc | `37af0002-39a2-4fce-9c60-01ee00000000` | `0.12,-0.35,9.76` (m/s²), `ERR` khi lỗi |
| IR | `37af0003-39a2-4fce-9c60-01ee00000000` | `85432` |

Tên Bluetooth vẫn là `VieGrand-Sensor` để tương thích firmware đang nạp; giao diện sản phẩm mang tên `wecare`. Bộ lọc cũng chấp nhận tên bắt đầu bằng `WeCare` hoặc `wecare`.

Gia tốc có trọng trường. Góc nghiêng chỉ là ước tính từ accelerometer khi ít chuyển động, không có yaw. IR truyền ở 2 Hz không phải dạng sóng PPG độ phân giải cao. Bản này không suy diễn SpO₂, điện tim hoặc phát hiện té ngã. Số đo từ nguyên mẫu dùng tham khảo.

Cảnh báo rung lặp lại chỉ phản ánh mẫu chuyển động đo được, không chẩn đoán Parkinson hay bệnh lý khác. Tần số gia tốc 10 Hz hiện tại chưa đủ để đánh giá đáng tin cậy run Parkinson thường nằm khoảng 4–6 Hz; firmware nên truyền accelerometer và gyroscope ở 50–100 Hz nếu cần phân tích sâu hơn. Web Bluetooth cần trang/PWA tiếp tục mở để ghi nhận và cảnh báo.

## Kiểm tra đã thực hiện

- `node --check public/app.js`, `node --check public/sw.js`.
- `npm run build`: tạo thư mục `dist` thành công.
- `npm test`: kiểm tra trực tiếp các hàm BLE của ứng dụng với transport giả lập, gồm UUID, gói lỗi, BPM -1, dữ liệu cũ, lỗi IMU, Notify, ngắt/kết nối lại và dọn dẹp khi một subscription thất bại.
- HTTP kiểm tra các tài nguyên tĩnh.

`tests/verify.cjs` là bộ kiểm tra trình duyệt (Playwright): responsive, demo, xuất CSV, BLE giả lập, PWA ngoại tuyến. Chưa chạy xong trong môi trường tạo bản này vì không tải được Chromium. Có thể chạy sau khi cài Playwright/Chromium trong môi trường kiểm thử riêng. Chưa kiểm thử kết nối trực tiếp với mạch vật lý.

Không có secret, token hoặc dữ liệu đo cá nhân trong mã nguồn. Font Be Vietnam Pro được tải từ Google Fonts; khi không có mạng sẽ dùng font hệ thống. Mọi tính năng dữ liệu không phụ thuộc thư viện CDN.
