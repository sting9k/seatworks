# Agent Orchestration & SLP — Phân tích nghiên cứu chi tiết

Sep 28, 2026 · @LONG

## 1. Tóm tắt điều hành

**Luận điểm trung tâm của bài:** trong dự án có phụ thuộc dọc (vertical dependency), phát hiện của agent đang trực tiếp đụng vào code phải có đường để thay đổi plan. Một cách điều phối mà main agent "giải hộ" bài toán rồi giao sub-agent phần còn lại sẽ khiến cả đội tối ưu ngày càng giỏi một quyết định sai.

Bài viết của vhLam (27/09/2026) lập luận qua ba lớp: trải nghiệm thực tế trên hai codebase netcode (Nova, Quark), một ẩn dụ xuyên suốt (chiếc xe đạp gắn dù giảm tốc) và một mô hình tổ chức tên SLP (Supervisor – Lead – Peer) chạy trên nền Paseo.

**Bảy mệnh đề chính rút ra từ bài:**

1. **Pre-solve là anti-pattern gốc.** Main tự định nghĩa bài toán, chọn giả thuyết, giới hạn phạm vi và format câu trả lời, nên sub gần như thành hàm `f(x) -> confirm / reject`.
2. **Quyền sửa và quyền chất vấn là hai quyền khác nhau.** Có thể giới hạn chặt quyền sửa (mỗi phạm vi một owner) mà vẫn mở quyền chất vấn tiền đề.
3. **Plan không thể hoàn hảo trước khi code.** Nhiều thứ chỉ là giả định cho tới khi đọc source, prototype, chạy thử. Sửa plan cần căn cứ, nhưng giữ plan cũng cần lý do.
4. **Test xanh chưa chứng minh thiết kế đúng.** Ở Quark, 47 test đều pass, nhưng 4 regression test bổ sung đều fail trên code cũ.
5. **Model càng mạnh càng giỏi đi đường vòng** để bảo vệ quyết định cũ. Quyền phản kháng có giá trị đúng tại thời điểm đó, nhưng chính đề xuất redesign cũng phải chịu chất vấn.
6. **Role là trách nhiệm và quyền hạn, không phải persona.** Đổi tên vai mà giữ nguyên phạm vi, luồng thông tin, quyền hạn và đường escalation thì SLP vẫn chạy.
7. **Quyền phản biện không phải nghĩa vụ phản biện.** Mục tiêu là để đúng phản biện đi tới đúng người và thay đổi công việc khi đáng thay đổi. Chính SLP cũng phải tự cải tiến (Better-SLP) theo outcome, không theo số lượng hoạt động.

**Kết luận của bản phân tích:** bài là một *position essay* dựa trên kinh nghiệm thực hành, không phải nghiên cứu thực nghiệm. Giá trị lớn nhất nằm ở việc gọi tên và tách bạch các khái niệm (pre-solve, quyền sửa và quyền chất vấn, brief ba phần, role theo quyền hạn, đo bằng chuỗi thay đổi). Bằng chứng định lượng duy nhất là ca 47/4 test của Quark. Hai nguồn học thuật được trích (Andrew Ng 2024; Feng và cộng sự 2026) chỉ được dùng làm bối cảnh, và tác giả nói rõ chúng không kiểm chứng SLP. Phần lớn mệnh đề của bài đã được hiện thực thành cơ chế trong Seatworks (mục 7).

## 2. Nguồn và phương pháp đọc

Bản phân tích dựa trên toàn văn bài do người dùng dán vào, vì mạng của môi trường phân tích chặn tên miền vhlam.com. Trích dẫn được giữ ngắn; phần còn lại là diễn giải và phân tích.

**Thông tin bài gốc**

| Trường | Giá trị |
| --- | --- |
| Tiêu đề | Bàn về multi-agent orchestration và mô hình SLP |
| Tác giả / trang | vhLam ([vhlam.com](https://vhlam.com/article/agent-orchestration-multi-agent-slp)), footer “© 2026 Devblue” |
| Ngày đăng | 27/09/2026, ghi “10 Min read” |
| Thể loại | Bài luận quan điểm (opinionated essay) dựa trên trải nghiệm, giọng văn cá nhân, có chủ đích hài hước |
| Cấu trúc | Phần mở đầu không tiêu đề + 10 mục có tiêu đề + 1 bình luận của độc giả |
| Nguồn được nêu tên | Andrew Ng (The Batch, 2024); preprint Feng và cộng sự (08/2026); Claude Code agent teams và cross-session messaging; Codex multi-agent v1/v2; Paseo; Iris (Unreal), NfE (Unity); blog/paper của Tencent, Amazon (không nêu cụ thể) |
| Tự khai của tác giả | Bài tự viết; hình minh họa do ChatGPT tạo |

**Phương pháp**

1. **Đọc tuần tự toàn văn**, chia theo đúng 11 đoạn của bài (mục 3), không đảo thứ tự.
2. **Tách từng mệnh đề và gắn loại:** trải nghiệm cá nhân, ví dụ kỹ thuật có thể kiểm chứng, ẩn dụ minh họa, khuyến nghị thiết kế, hay dẫn nguồn bên ngoài.
3. **Rút khái niệm** mà bài đặt tên hoặc dùng có hệ thống (pre-solve, ownership, vertical dependency, brief ba phần…) và định nghĩa lại chúng bằng lời của chính bài.
4. **Kiểm chứng nguồn:** mở từng nguồn được nêu tên, đối chiếu nguồn nói gì với cách bài sử dụng nó (mục 4).
5. **Phản biện:** xét giả định ngầm, loại bằng chứng, phạm vi áp dụng (mục 6).
6. **Đối chiếu với mã nguồn Seatworks** trong repo `sting9k/seatworks` để xem khái niệm nào đã thành cơ chế (mục 7).

**Giới hạn của bản phân tích:** không xem được hình minh họa trong bài. Các tên model (GPT-5.6 Sol, Astra, Opus 5.5) và “Jev” được ghi lại đúng như bài viết, không đánh giá năng lực của chúng. Nova, Quark và hệ thống CRM không có mã nguồn công khai để kiểm chứng các ví dụ kỹ thuật.

## 3. Phân tích từng đoạn, theo đúng thứ tự của bài

Mỗi đoạn của bài được đánh số (¶), ghi lại đủ mọi ý của từng câu bằng diễn giải sát nghĩa, kèm trích ngắn những cụm từ then chốt. Sau mỗi mục là phân tích: loại lập luận, khái niệm được đặt ra, và vai trò của mục trong toàn bài.

### 3.1. Phần mở đầu (không tiêu đề): bối cảnh và ca Nova

**¶0, sapo.** SLP là Supervisor – Lead – Peer. Trước đây tác giả không đặt tên; đặt tên chỉ để tiện trao đổi. Đây là một phương pháp phối hợp “có chủ kiến cá nhân (opinionated)”, hình thành quanh ba thứ của riêng tác giả: loại dự án, workflow và thói quen làm việc.

- *Phân tích:* ngay câu đầu, tác giả tự giới hạn phạm vi hiệu lực của mô hình. SLP không được đưa ra như một lý thuyết phổ quát. Điều này được nhắc lại ở mục cuối (3.12).

**¶1.** Tác giả mượn thành ngữ “cái kim trong bọc lâu ngày cũng lòi ra” để nói mình buộc phải viết bài này (ám chỉ SLP đã được dùng âm thầm từ lâu và giờ lộ ra). Câu thứ hai đặt giọng văn: muốn hiểu bài cần “thông minh hơn học sinh lớp 5”.

- *Phân tích:* “học sinh lớp 5” là một motif lặp lại (¶ mục 3.2, 3.10, 3.12). Nó vừa là giọng đùa, vừa báo trước cấu trúc bài: mỗi ý kỹ thuật sẽ được dịch sang một ẩn dụ đơn giản.

**¶2.** Trải nghiệm khiến tác giả bắt đầu nghi ngờ cách Codex điều phối sub-agent đến từ thời **multi-agent v1**, khi dùng trên dự án đòi hỏi tối ưu phần cứng cực đoan và có các subsystem chồng chéo phức tạp. Ba dự án được nêu:

- **Nova:** một MMORPG Networking Framework (Rust, C++ cho Unreal SDK).
- **Quark:** một low-level netcode runtime cho game multiplayer, tương tự Iris của Unreal hay NfE (Netcode for Entities) của Unity.
- **Hệ thống CRM** với nghiệp vụ đồ sộ của các chuỗi phòng khám, bệnh viện tại TP.HCM mà tác giả cộng tác.
- *Phân tích:* đối tượng phê bình được xác định rất cụ thể: Codex multi-agent **v1**, không phải multi-agent nói chung. Ba dự án trải từ hệ thống thời gian thực (Nova, Quark) tới hệ thống nghiệp vụ (CRM), nhưng toàn bộ ví dụ kỹ thuật về sau chỉ lấy từ Nova và Quark. CRM chỉ được nhắc đến, không có ca nào.

**¶3.** Đây là những codebase lớn, nơi một feature có thể chạm đồng thời nhiều module, kéo theo vấn đề về **ownership**, **lifecycle** và **các quyết định kiến trúc đã tồn tại từ trước**.

- *Phân tích:* ba từ khóa này là ba trục của toàn bài. Ownership dẫn tới “mỗi phạm vi một owner” (3.7). Lifecycle dẫn tới các lỗi “hai loại thông tin khác vòng đời” của Quark (3.4). Quyết định có sẵn dẫn tới cái dù (3.2).

**¶4, định nghĩa ownership.** GPT và Claude hay dùng từ này; tác giả thấy ổn vì nó thay được một đoạn dài mô tả quyền làm chủ và trách nhiệm. Hai nghĩa được phân biệt:

- **Agent ownership:** “Mỗi phạm vi có một agent chịu trách nhiệm chính và nắm quyền chỉnh sửa.”
- **State ownership:** “State này do thành phần nào quản lý?”
- *Phân tích:* đây là một phân biệt tinh và quan trọng. Agent ownership là khái niệm **tổ chức** (ai được sửa phạm vi nào); state ownership là khái niệm **thiết kế phần mềm** (thành phần nào quản lý trạng thái nào). Bài dùng cả hai: các lỗi Quark là lỗi state ownership; mô hình SLP là lời giải cho agent ownership. Ngầm ý: cấu trúc ownership của đội agent nên phản chiếu cấu trúc ownership của hệ thống (gần với định luật Conway).

**¶5, điều kiện biên.** Tác giả nêu bối cảnh vì: nếu bài toán chỉ là một web service vài trăm API CRUD, lifecycle đã rõ, các phần việc tương đối độc lập và chia ngang để chạy song song được, thì trải nghiệm sẽ rất khác. Khi đó “main chia task, sub implement, gom kết quả” có thể chạy tốt; nhiều khi main tự làm tuần tự cũng xong, chưa cần cả một orchestration methodology.

- *Phân tích:* đây là điều kiện biên tường minh đầu tiên. Tiêu chí phân loại ngầm: (a) lifecycle đã biết hay chưa, (b) các phần độc lập hay phụ thuộc, (c) chia ngang hay chia dọc. Main/sub kiểu cổ điển được thừa nhận là phù hợp cho loại việc thứ nhất.

**¶6, vertical dependency.** Các dự án của tác giả có phụ thuộc dọc: slice sau phụ thuộc không chỉ vào code mà cả vào kiến trúc và thiết kế slice trước vừa tạo ra. Bắt đầu feature tiếp theo mới phát hiện bốn loại vấn đề: API cũ thiếu một khả năng; trách nhiệm đặt sai chỗ; lifecycle không hỗ trợ yêu cầu mới; một mechanism trong plan phải hoãn. Trong dự án do con người vận hành, lúc đó người thực hiện quay lại trao đổi với lead, yêu cầu owner module khác thay đổi, thậm chí đề nghị làm lại foundation.

- *Phân tích:* đây là định nghĩa vận hành của bài toán. Bốn loại phát hiện tương ứng bốn loại thay đổi: mở rộng interface, chuyển trách nhiệm, đổi lifecycle, sắp lại thứ tự. Ba hành động của con người (hỏi lead, nhờ owner khác, đề nghị làm lại nền) chính là ba “đường quay lại” mà SLP sẽ phải cung cấp cho agent.

**¶7, nỗi khó chịu với v1.** Main thường đã tự định nghĩa bài toán, chọn giả thuyết, giới hạn phạm vi, rồi quy định cả format câu trả lời trước khi sub bắt đầu. Phần cần một kỹ sư độc lập suy nghĩ bị “giải hộ gần hết”. Sub chỉ còn cố hoàn thành task trong cái khung đó, kể cả khi khung bảo nó xây tiếp trên một quyết định sai hay một foundation chưa thực sự ổn định.

- *Phân tích:* bốn hành động của main (định nghĩa, chọn giả thuyết, giới hạn, quy định format) là định nghĩa sớm của khái niệm “pre-solve”, được đặt tên ở 3.3.

**¶8, ca Nova: multi-cell seamless handoff (đã giản lược).** Một world khoảng 5 km mỗi chiều có thành phố, bãi farm và khu PvP. Thành phố đông người nhưng phần lớn chỉ AFK treo shop hoặc chat. Khu PvP ít người hơn vẫn tạo tải simulation lớn vì combat liên tục. Chia world thành nhiều cell là một cách phân bố các loại tải này, với yêu cầu người chơi đi qua ranh giới cell liền mạch, không loading.

- *Phân tích:* chi tiết “đông người ≠ tải cao” cho thấy lý do chia cell là tải simulation chứ không phải mật độ người chơi. Đây là ví dụ một yêu cầu phải được hiểu đúng trước khi chọn giải pháp.

**¶9.** Tác giả không “ngây thơ” giao một task siêu lớn, set goal rồi chờ. Ông nghiên cứu source code tương tự (vốn hiếm), thảo luận với AI và chuyên gia, đọc paper và blog kỹ thuật từ Tencent, Amazon. Từ kinh nghiệm, ông đã dự tính cần một **Edge Layer** giữ connection ổn định, tách kết nối của người chơi khỏi cell đang xử lý nhân vật.

- *Phân tích:* đoạn này chặn trước phản biện “do plan kém”. Plan đã được nghiên cứu kỹ, vậy mà vẫn còn lỗ (¶10–11). Nguồn Tencent, Amazon không được nêu cụ thể nên không kiểm chứng được.

**¶10.** Vẽ được Edge trên sơ đồ chưa giải quyết hết handoff. Năm câu hỏi còn mở:

1. Khi nhân vật rời cell A, input đang chờ nằm ở đâu?
2. Input nào đã được xử lý, input nào cell B phải tiếp tục nhận?
3. Cell mới bắt đầu có quyền xử lý (authority) từ tick nào?
4. Dữ liệu cell cũ chưa kịp gửi ra được tiếp nối ra sao?
5. Một người chơi thứ ba đứng gần ranh giới thấy nhân vật di chuyển liên tục, hay biến mất rồi xuất hiện lại?

- *Phân tích:* năm câu hỏi thuộc ba loại: **quyền** (câu 3), **trạng thái đang bay** (câu 1, 2, 4) và **quan sát của bên thứ ba** (câu 5). Không câu nào trả lời được bằng sơ đồ thành phần; chúng chỉ trả lời được khi hệ thống chạy.

**¶11, chi tiết thứ tự trong vòng tick.** Trong một vòng hoàn thiện handoff của Nova: bước nhận dữ liệu từ cell bên cạnh phải đặt **trước** bước setup trạng thái bàn giao và chạy simulation ở cell đích. Đặt bước nhận phía sau simulation sẽ tạo thêm **một tick trễ** ngay trong cấu trúc vòng chạy. Có Edge, có đường truyền, có dữ liệu handoff vẫn chưa đủ nếu dữ liệu đến đúng nơi nhưng “xử lý sai thời điểm”.

- *Phân tích:* đây là một lỗi về **thứ tự pha** (phase ordering) trong vòng lặp, một loại lỗi tích hợp theo thời gian. Mọi thành phần đều đúng khi xét riêng; sai nằm ở quan hệ thời gian giữa chúng. Đây là bằng chứng đầu tiên cho luận điểm “phát hiện chỉ xuất hiện khi làm”, và báo trước vấn đề thống nhất thời gian của Quark (3.4).

**¶12.** Loại vấn đề này rất dễ bị một task “implement chuyển nhân vật từ A sang B” che khuất. Người implement phải có quyền quay lại bàn về thứ tự chạy, quyền xử lý và trạng thái cần bàn giao. Những phần tưởng đã ổn định ở slice trước có thể phải mở ra sửa. Thêm một hàng đợi hay một lớp đồng bộ chưa chắc xử lý được nguyên nhân; đôi khi nó chỉ khiến hệ thống cố bù cho một tick trễ mà chính thiết kế đang tạo ra.

- *Phân tích:* xuất hiện lần đầu mô thức “**thêm cơ chế để bù cho lỗi thiết kế**” (hàng đợi, lớp đồng bộ). Mô thức này sẽ quay lại dưới dạng “làm cái dù to hơn” (3.4) và “đường vòng” (3.5).

**¶13, kết của phần mở đầu.** Tác giả muốn orchestration hỗ trợ cuộc trao đổi đó: nếu agent đang đụng code phát hiện tiền đề sai, phát hiện ấy phải có khả năng thay đổi plan.

- *Phân tích:* đây là **luận đề của cả bài**, phát biểu lần đầu. Mọi mục sau đều là biện minh hoặc cơ chế để thực hiện nó.

### 3.2. “Phần giải thích cho học sinh lớp 5”: ẩn dụ chiếc xe đạp và cái dù

**¶1.** Để bỏ bớt thuật ngữ netcode, tác giả đề nghị hình dung cả đội đang làm một chiếc xe đạp.

**¶2.** Tác giả giao agent thiết kế “một hệ thống giảm tốc hiện đại”. Theo trải nghiệm của ông, những model như GPT-5.6 Sol thường overengineering. Với yêu cầu đó, nó có thể thiết kế hẳn một **bộ dù giảm tốc** gồm bốn phần: cơ cấu bung dù, cảm biến vận tốc, bộ điều khiển và cơ chế thu hồi. Bản thiết kế trông rất công phu, và yêu cầu giảm tốc vẫn được đáp ứng.

**¶3.** Tác giả nhận xét xe quá nặng. Agent tiếp theo được giao tối ưu trọng lượng *của bộ dù*: thay vật liệu, làm nhẹ khung bung, tinh chỉnh cơ cấu thu hồi. Khi tác giả nói xe vẫn dừng quá chậm, một agent khác tăng diện tích dù rồi tối ưu khí động học. Mỗi agent đều giải quyết khá tốt vấn đề được giao. Chiếc xe ngày càng tinh xảo, còn cái dù thì “ngày càng khó bỏ”.

**¶4.** Câu hỏi tác giả cần nghe không bao giờ xuất hiện: vì sao chọn dù để giảm tốc cho xe đạp, và yêu cầu nào khiến một bộ phanh thông thường không đáp ứng được?

**¶5.** Đó là cách một lựa chọn thiết kế của agent đầu tiên **âm thầm trở thành constraint** cho các agent đến sau. Mong muốn của tác giả là xe nhẹ hơn và dừng tốt hơn. Qua bước phân rã task, nó biến thành “làm nhẹ cái dù” và “tăng hiệu quả cái dù”. Mục tiêu của user bị thu hẹp thành việc tối ưu phương án mà agent đã chọn.

**¶6.** Nếu người thực hiện chỉ được sửa bộ dù, chỉ đọc tài liệu về bộ dù, và được đánh giá bằng hiệu quả của bộ dù, thì thêm nhiều agent mạnh có thể chỉ giúp cả đội đi xa hơn trên cùng một quyết định sai. Giải pháp của slice trước đã thành yêu cầu của slice sau, dù user chưa từng yêu cầu phải giữ giải pháp đó.

**¶7.** Cái dù chỉ là tình huống minh họa. Điều tác giả muốn mô tả là **quá trình một phương án được miễn xét lại qua nhiều lần giao việc**. Trong phần mềm, quá trình ấy khó nhận ra hơn vì mỗi lớp bổ sung đều có thể mang một cái tên rất hợp lý.

**Phân tích mục 3.2**

- **Ba kênh thu hẹp ở ¶6** tương ứng ba thứ mà một hệ thống điều phối cấp cho agent: quyền sửa (write set), ngữ cảnh được đọc (context) và tiêu chí đánh giá (acceptance). Khóa cả ba vào cùng một phương án là khóa luôn khả năng thấy phương án khác.
- **Chỗ mất mát là bước dịch phản hồi.** Phản hồi của user ở ¶3 nằm ở tầng mục tiêu (“xe nặng”, “dừng chậm”), nhưng được dịch thành task ở tầng giải pháp (“làm nhẹ dù”, “tăng diện tích dù”). Nghĩa là ngay cả khi Human can thiệp, can thiệp đó vẫn bị hấp thụ vào phương án cũ. Điểm này sẽ quay lại ở mục về quyền kiểm soát (3.6).
- **Các khái niệm lân cận trong văn liệu:** goal displacement (mục tiêu bị thay bằng phương tiện), path dependence, escalation of commitment. Bài không dùng các thuật ngữ này, nhưng mô tả đúng cơ chế của chúng.
- **Câu ¶7 là định nghĩa thật sự của anti-pattern:** “miễn xét lại qua nhiều lần giao việc”. Nó không nói phương án đầu sai; nó nói phương án đầu không còn được hỏi lại. Ý “mỗi lớp có một cái tên hợp lý” giải thích vì sao review từng lớp riêng lẻ không bắt được nó.
- **Chi tiết model:** việc gán xu hướng overengineering cho một model cụ thể là quan sát cá nhân, không có số liệu đi kèm.

### 3.3. “Main đã giải hộ phần đáng lẽ cần được tranh luận”: pre-solve và nhận thức luận của plan

**¶1.** Trong trải nghiệm sub-agent v1 của Codex, tác giả thường gặp kiểu initial prompt: “Kiểm tra xem phương án A có đúng không. Tập trung vào khía cạnh X, không bàn lại khía cạnh Y. Trả lời PASS/FAIL và tối đa 5 bullet.”

**¶2.** Mỗi vế của prompt đã khóa một thứ: A đã là phương án trung tâm; X đã là tiêu chí chính; Y được miễn xét lại; câu trả lời phải hội tụ nhanh. Sub có thể rất giỏi tìm lỗi trong A, nhưng không còn nhiều không gian để hỏi liệu A có phải thứ cần xây hay không.

**¶3, đặt tên.** Tác giả gọi đó là **pre-solve**: main định nghĩa bài toán, dựng giả thuyết, chọn tiêu chí, giới hạn phạm vi, rồi gọi thêm một agent đến xử lý phần còn lại. Trường hợp cực đoan, sub gần như thành một hàm `f(x) -> confirm / reject`.

**¶4.** Với chiếc xe đạp, brief sẽ là: đánh giá vật liệu dù, không thay đổi cơ chế giảm tốc, chỉ báo vấn đề ảnh hưởng trọng lượng. Một chuyên gia về phanh nhận task ấy cũng bị kéo thành chuyên gia làm nhẹ cái dù.

**¶5, hai loại công việc.** Brief hẹp vẫn hữu ích khi thực sự cần kiểm tra một **invariant** hoặc implement một **contract đã được xác lập**. Nhưng **discovery** cần quyền mở lại giả thuyết. Nếu hai loại việc này được giao theo cùng một kiểu, sự gọn gàng của task sẽ che mất phần thiết kế chưa được giải quyết.

**¶6, tách hai quyền.** Giới hạn quyền sửa và giới hạn quyền chất vấn là hai việc khác nhau. Agent chịu trách nhiệm bộ phanh không được tự ý cắt khung xe của người khác. Nhưng nó vẫn phải được đọc thiết kế khung và báo rằng vị trí bắt phanh hiện tại không chịu được lực cần thiết.

**¶7.** Với vertical plan, điều này càng quan trọng. Phần sau phụ thuộc cả code lẫn quyết định thiết kế phần trước vừa tạo. Ba ví dụ: một API đủ dùng hôm nay có thể thiếu khả năng cho feature sau; một cách quản lý state tưởng hợp lý có thể lộ vấn đề khi mất kết nối hoặc khi nhiều thao tác cùng lúc; có những vấn đề chỉ lộ ra khi các phần thực sự chạy cùng nhau.

**¶8, phản biện dự kiến.** Sẽ có người nói: do plan chưa tốt. Tác giả thừa nhận có những lỗi đáng lẽ phải phát hiện từ lúc planning. Nhưng cho rằng plan đủ tốt sẽ khiến implement luôn trơn tru từ đầu đến cuối là “một kỳ vọng ngây thơ”, nhất là với hệ thống phức tạp.

**¶9.** Trước khi code, nhiều thứ vẫn chỉ là giả định: thư viện có hỗ trợ thứ mình cần không; hai module ghép lại có chạy đúng không; cách đồng bộ đã chọn có quá chậm không. Đọc source, làm prototype và chạy thử trả lời những câu đó, và đôi khi câu trả lời buộc đổi thiết kế. Không thể vừa yêu cầu người implement tìm ra điều chưa biết, vừa coi mọi phát hiện làm đổi plan là lỗi của planning.

**¶10.** Ngay trong Nova, việc đã tính trước Edge Layer không có nghĩa handoff đã giải xong. Giữ connection ổn định là một chuyện; cell mới tiếp quản lúc nào, input đang chờ xử lý ở đâu, người đứng gần có thấy nhân vật khựng lại không là những chuyện khác. Vẽ đủ các thành phần trên sơ đồ chưa bảo đảm chúng phối hợp đúng khi chạy.

**¶11.** Bắt main hoạch định hoàn hảo mọi trách nhiệm, quan hệ phụ thuộc, vòng đời dữ liệu và tình huống lỗi ngay từ đầu gần như là yêu cầu nó implement cả hệ thống trong file plan. Muốn biết plan đó đúng không, nó vẫn phải viết code, thử thư viện, chạy test và đo đạc, tức là làm trước chính phần việc định giao cho agent khác.

**¶12, plan cần gì.** Plan cần nói rõ bốn thứ: **mục tiêu**, **những giới hạn phải giữ**, **những điều còn chưa chắc** và **cách kiểm chứng chúng**. Khi người làm feature sau phát hiện thiết kế trước không đáp ứng được, họ phải có đường quay lại: trao đổi, yêu cầu sửa module liên quan hoặc đổi thứ tự triển khai. Câu then chốt: **“việc sửa plan cần có căn cứ, nhưng giữ nguyên plan cũng phải có lý do.”**

**¶13.** Quay lại chiếc xe: nếu chạy thử mới phát hiện cơ chế giảm tốc không đáp ứng yêu cầu, người làm phải được xét lại lựa chọn cái dù. Nếu chỉ được tăng kích thước dù để giữ plan, từng task vẫn hoàn thành trong khi cả thiết kế tiếp tục đi sai.

**¶14.** Một plan tốt vẫn có thể phải sửa nhiều lần. Điều tác giả cần là phát hiện từ người đang làm có thể khiến cả đội sửa hướng, thay vì bị ép thành một workaround để bảo vệ plan cũ.

**¶15.** Ở một đội kỹ thuật, người làm feature sau có lúc yêu cầu lead đổi thứ tự, yêu cầu owner khác thêm API, thay dependency hoặc hoãn một mechanism. Tác giả cần agent có cùng con đường trao đổi ấy.

**¶16, nghịch lý.** Sub-agent dùng cùng model và effort vốn có năng lực nền ngang main, nhưng orchestration lại ép nó hành xử như “một model RLCD chuyên phán định như Jev”: nhận đầu vào, đánh giá trong khung tiêu chí có sẵn, trả về một đáp án định trước. Khả năng phân tích sâu và mở lại bài toán vẫn còn, chỉ là không được dùng. Câu chốt: tác giả cần một kỹ sư hỏi tại sao xe đạp phải gắn dù, nhưng lại nhận được “một Jev đắt tiền để chấm điểm cái dù”.

**Phân tích mục 3.3**

- **Giải phẫu pre-solve (¶1–3).** Bốn thành phần của một prompt pre-solve: giả thuyết được mặc định (A), tiêu chí tiêu điểm (X), vùng được miễn (Y), đầu ra bị nén (PASS/FAIL, 5 bullet). Mỗi thành phần đều có lý do hợp lý khi đứng một mình (tiết kiệm token, đầu ra dễ tổng hợp); gộp lại thì xóa quyền đặt câu hỏi.
- **Phân loại công việc (¶5).** Bài không chống brief hẹp; bài chống việc dùng brief hẹp cho công việc discovery. Phân loại hai nhóm, **verification** (invariant, contract đã có) và **discovery** (giả thuyết còn mở), là đóng góp khái niệm quan trọng của mục này.
- **Tách quyền (¶6).** Đây là nguyên tắc thiết kế cốt lõi của toàn bài: *write authority* (hẹp, một owner) tách khỏi *voice* (rộng, ai cũng được đọc và nêu vấn đề). Nó cho phép giữ an toàn khi ghi mà không đánh đổi tính độc lập khi nghĩ.
- **Nhận thức luận của plan (¶8–12).** Plan được xem là một tập giả thuyết, không phải một đặc tả. Lập luận ở ¶11 là một *reductio*: plan hoàn hảo tương đương implement trước, nên không thể là yêu cầu hợp lý.
- **Nguyên tắc gánh nặng chứng minh đối xứng (¶12).** “Sửa cần căn cứ, giữ cần lý do” đảo ngược mặc định thông thường (plan đúng cho tới khi bị chứng minh sai). Đây có lẽ là mệnh đề mới và có thể vận hành hóa nhất trong bài.
- **Brief bốn phần (¶12)** (mục tiêu, ràng buộc, điều chưa chắc, cách kiểm chứng) sẽ được rút gọn thành ba phần ở 3.9 (mục tiêu, constraint bắt buộc, lựa chọn thiết kế hiện tại).
- **“RLCD” và “Jev” (¶16).** Bài không định nghĩa hai từ này. Ngữ cảnh cho thấy Jev là một model nhỏ, rẻ, chuyên phán định theo tiêu chí cho sẵn. Trong Seatworks, Jev chính là “brain” cảm biến của W, một model nhỏ gọi qua OpenRouter (mục 7). RLCD nhiều khả năng chỉ phương pháp huấn luyện của model đó; bài không nói rõ (xem mục 4). Ý của nghịch lý là một lập luận về **chi phí cơ hội**: trả giá một model mạnh nhưng chỉ dùng nó như một bộ phân loại.

### 3.4. “Khi green test chỉ chứng minh cái dù bung được”: bằng chứng từ Quark

**¶1, số liệu.** Quark cho một ví dụ cụ thể về test xanh trong khi thiết kế vẫn có vấn đề. Trong vòng review trước một đợt rework, cả **47 test Rust** ban đầu đều pass. Bổ sung **bốn regression test** cho những tình huống bị bỏ sót thì **cả bốn đều fail** trên code cũ. Các lỗi sau đó đã được sửa. Điều đáng nói là bộ test ban đầu chưa chạm tới những tình huống khiến các giả định trong thiết kế không còn đúng.

**¶2, lỗi 1: lệch state khi mất ACK.** Client đã xác nhận state A, sau đó nhận state B nhưng ACK gửi về server bị mất. World trên server quay lại A, và các packet gửi để đưa client về A cũng tiếp tục bị mất. Lúc này server ở A, client vẫn ở B.

**¶3.** Server có giữ history của các packet đã gửi, nhưng history có giới hạn. Khi packet chứa B bị loại khỏi history, server mất dấu việc client có thể đang giữ B. State cuối được xác nhận là A, state hiện tại trên server cũng là A, nên server có thể tưởng không còn gì cần đồng bộ và ngừng gửi correction. Client cứ thế giữ B.

**¶4, cách vá sai.** Nếu task được đóng khung là “history quá ngắn, cần lưu nhiều packet hơn”, hướng vá dễ nghĩ tới là tăng giới hạn từ **128** lên một con số lớn hơn. Nhưng tăng history chỉ đẩy tình huống lỗi ra xa hơn và tốn thêm bộ nhớ. Packet bị xóa khỏi history không có nghĩa state của client đã được xác nhận.

**¶5, cách sửa đúng.** Đây chính là “làm cái dù to hơn”. Cách sửa trong vòng đó: giữ thông tin về **state transition cần được xác nhận** cho tới khi có ACK bao phủ nó. History của packet có thể được thu hồi, nhưng server vẫn phải nhớ mình còn cần đồng bộ gì cho client. Hai loại thông tin này liên quan với nhau nhưng không thể mặc nhiên có cùng vòng đời.

**¶6, lỗi 2: entity ma.** Lỗi này cũng xuất phát từ việc gộp những trách nhiệm tưởng gần nhau. Client đã nhận lệnh spawn một entity. Sau đó entity ra khỏi vùng quan tâm (interest area) của client, nên server cần gửi despawn. Nhưng thao tác **reset baseline** lại xóa luôn thông tin cần để biết client có thể vẫn đang giữ entity ấy. (Baseline là state tham chiếu dùng để tính phần dữ liệu thay đổi cần gửi, tức delta.)

**¶7.** Kết quả: cache trên server đã được dọn sạch, còn entity ma vẫn có thể nằm trên client vì không nhận được despawn. Sửa đúng: trạng thái chuyển tiếp của entity phải được giữ **độc lập với ACK cache**. Việc bỏ dữ liệu phục vụ tính delta không được làm mất trách nhiệm thông báo rằng entity đã rời khỏi thế giới mà client cần nhìn thấy.

**¶8.** Hai lỗi này cho thấy vì sao người implement cần được quay lại chất vấn thiết kế. Task ban đầu có thể chỉ là mở rộng replication hoặc giảm bộ nhớ. Nhưng khi đọc code và viết test, họ phát hiện cách quản lý state hiện tại đang gộp những thứ có vòng đời khác nhau. Phát hiện ấy có thể buộc cả đội sửa phần nền trước khi tiếp tục feature.

**¶9, giới hạn của bằng chứng (tác giả tự nêu).** Nếu main đã chốt sẵn nguyên nhân trong brief, ví dụ “tăng history để xử lý mất gói”, agent nhận việc rất dễ tối ưu theo hướng đó. Nếu nó được giao điều tra vì sao client không về đúng state và được mở lại các giả định liên quan, cơ hội tìm ra vấn đề gốc sẽ khác. Tác giả nói rõ: những bug này **tự chúng chưa chứng minh orchestration gây ra lỗi**; chúng cho thấy loại phát hiện mà orchestration phải có khả năng tiếp nhận và biến thành thay đổi thiết kế.

**¶10, vấn đề cấp ghép module.** Clock, input, prediction và replication từng tồn tại tương đối tách biệt, trong khi game mẫu giữ thêm một phần logic riêng. Có đủ các thành phần chưa có nghĩa chúng đã tạo thành một runtime thống nhất.

**¶11.** Bốn câu hỏi xuyên module: input này thuộc tick nào; prediction đang chạy trước server bao xa; snapshot vừa nhận mô tả state ở thời điểm nào; client phải dùng nó để sửa phần dự đoán nào. Mỗi phần có thể pass test riêng nhưng vẫn phối hợp sai nếu chúng không thống nhất cách hiểu **thời gian và state**. Thêm feature vào từng module không tự giải quyết được sự lệch nhau ấy.

**¶12.** Quay lại chiếc xe: có thể kiểm tra dây kéo không đứt, dù bung đúng lệnh, cảm biến báo đúng tốc độ. Từng bộ phận đều đúng. Nhưng người đi xe cần cả hệ thống giúp họ dừng lại trong điều kiện sử dụng thực tế. Nếu cảm biến báo đúng mà cơ cấu bung phản ứng quá muộn, hoặc cái dù vốn không hợp với tốc độ đang chạy, thì kết quả kiểm tra từng bộ phận vẫn chưa trả lời yêu cầu đó.

**¶13.** Tác giả cần có agent nhìn xuyên ranh giới task để chỉ ra vấn đề, rồi có đường trao đổi với các owner liên quan để sửa. Nếu chỉ được chứng minh phần mình phụ trách đã pass, cả đội có thể kiểm tra cái dù rất kỹ, tối ưu nó qua nhiều vòng, mà vẫn bỏ sót câu hỏi chiếc xe có thực sự dừng được hay không.

**Phân tích mục 3.4**

- **Đây là bằng chứng định lượng duy nhất của bài:** 47/47 pass, 4/4 test mới fail. Nó chứng minh một mệnh đề hẹp nhưng chắc: một test suite xanh đo độ phủ trên không gian các giả định mà người viết test đã có, không đo độ phủ trên không gian các giả định có thể sai. Cỡ mẫu là một vòng review, không có nhóm đối chứng.
- **Hai lỗi cùng một gốc: gộp cache với nghĩa vụ.** Lỗi 1 gộp “lưu packet đã gửi” (cache, thu hồi được) với “còn nợ client một xác nhận” (nghĩa vụ, không được thu hồi). Lỗi 2 gộp “baseline tính delta” (cache) với “client có thể đang giữ entity nào” (nghĩa vụ despawn). Nguyên tắc rút ra có tính tổng quát: **dữ liệu phục vụ hiệu năng có thể bị dọn; dữ liệu ghi một cam kết chưa hoàn thành thì không**. Đây chính là một lỗi *state ownership* theo định nghĩa ở 3.1.
- **“Tăng 128 lên” là phiên bản kỹ thuật của cái dù to hơn:** một tham số được nới ra để làm hiếm đi một lỗi cấu trúc, đổi lại chi phí bộ nhớ, trong khi lỗi vẫn còn. Test với tải nhẹ sẽ xanh hơn, nên cách vá này còn làm yếu đi tín hiệu phát hiện lỗi.
- **¶9 là một điểm trung thực về phương pháp.** Tác giả không dùng bug để kết tội orchestration; bug chỉ chứng minh *loại phát hiện* mà hệ thống phải tiếp nhận được. Lập luận vì vậy là về **năng lực tiếp nhận** của quy trình, không phải về nguyên nhân gây lỗi. Đồng thời nó chỉ ra cách viết brief: giao **triệu chứng** (“vì sao client không về đúng state”) thay vì giao **nguyên nhân đã chốt** (“tăng history”).
- **¶10–11 và Nova ¶11 cùng một loại lỗi:** mô hình thời gian (tick) không được chia sẻ giữa các module. Đây là vấn đề “xanh cục bộ, đỏ toàn cục”: tính đúng của hệ thống không phải là hợp của tính đúng từng module.
- **Hệ quả cho việc phân vai:** cần một người có trách nhiệm với yêu cầu ở tầng người dùng (“xe có dừng được không”). Trong SLP, đó là Lead (integration, acceptance); ở mục 3.8, tác giả thêm vai Auditor để điều tra chất lượng TDD và e2e proof.

### 3.5. “Model càng mạnh, đường vòng càng đáng lo”

**¶1.** Với các model mạnh như Sol 5.6 và hiện tại là Astra hay Opus 5.5, điều khiến tác giả lo là chúng **quá giỏi tìm đường vòng**. Viết hàng nghìn, thậm chí hàng chục nghìn dòng code để ép mọi thứ chạy đúng expectation có thể nằm trong khả năng của chúng. Nếu task chỉ yêu cầu giữ nguyên quyết định cũ và hoàn thành feature mới, năng lực ấy có thể được dùng để **bảo vệ chính những quyết định cần thay đổi**.

**¶2, chuỗi đường vòng.** Reconnect ngầm chưa đủ thì thêm bảng ánh xạ ID, thêm state trung gian, thêm một lớp đồng bộ để giữ các lớp trước không lệch nhau. Đó là những kiểu đường vòng tác giả lo khi giao bài toán seamless handoff trong một scope quá chặt. Từng cơ chế đều có ứng dụng hợp lý; điều đáng ngờ là phải **liên tục bổ sung** chúng để bù cho **cùng một mâu thuẫn nền tảng** mà không ai được mở lại.

**¶3, ẩn dụ Guam.** Tác giả đùa: đưa cho nó hai cái bánh xe rồi bảo muốn tới đảo Guam, nó sẽ ráp một chiếc thủy xe đạp trông rất sang và đạp thẳng tới đó. Điều tác giả cần ở một kỹ sư độc lập là nó hỏi lại: tại sao phải dùng hai cái bánh này, mình đang cần một con thuyền mà?

**¶4.** Quyền phản kháng có giá trị đúng ở thời điểm ấy. Agent phải được chỉ ra rằng phương tiện đang không phù hợp với mục tiêu, trình bày bằng chứng, đề nghị đổi thiết kế hoặc mở lại scope. Nếu chỉ được tối ưu để hoàn thành task, **model càng mạnh đôi khi càng khiến một quyết định sai sống lâu hơn**.

**¶5, đối trọng.** Câu “cần redesign” cũng phải chịu chất vấn. Agent có thể overengineering ngay trong phương án thay cái dù. Main phải hỏi bốn câu: lỗi xảy ra ở điều kiện nào; sửa nhỏ có đủ không; phương án mới bỏ được trách nhiệm nào; và tạo thêm trách nhiệm nào. Phản kháng có ích khi nó giúp đội ra quyết định tốt hơn.

**Phân tích mục 3.5**

- **Một nghịch đảo quan trọng:** trong một khung task cố định, năng lực lớn hơn không cải thiện outcome mà tăng “độ bền” của quyết định sai. Đây là họ hàng của *specification gaming* trong văn liệu an toàn AI (hệ thống thỏa mãn chữ của nhiệm vụ thay vì ý định), nhưng ở đây không có hành vi gian lận: agent làm đúng yêu cầu, và chính yêu cầu đã khóa sai hướng.
- **Một tín hiệu có thể quan sát được (¶2):** không phải từng cơ chế bù, mà *chuỗi* cơ chế bù cùng nhắm vào một mâu thuẫn. Đây là một heuristic có thể tự động phát hiện, và Seatworks có mẫu tương tự trong watch (xây “stand-in” cho thứ còn thiếu; xem mục 7).
- **Ẩn dụ Guam** khác ẩn dụ cái dù: cái dù là một lựa chọn của agent trước; hai cái bánh là một tiền đề được trao sẵn từ đầu vào. Agent mạnh không hỏi lại tiền đề được trao, kể cả khi tiền đề đó mâu thuẫn với mục tiêu.
- **¶5 là một bộ tiêu chí đánh giá đề xuất redesign**, gồm bốn câu: điều kiện kích hoạt, tính đủ của bản sửa tối thiểu, trách nhiệm bị bỏ, trách nhiệm được thêm. Nó cân bằng lại một rủi ro mà bài sẽ phát triển ở 3.9: quyền phản kháng trở thành công cụ cho overengineering.

### 3.6. “V2 đã cải thiện, quyền kiểm soát của user vẫn là điều tôi concern”

**¶1, giới hạn phạm vi phê bình.** Các phê bình đầu bài đến từ trải nghiệm multi-agent v1. Codex hiện đã có cải thiện trong multi-agent v2. Tác giả không muốn lấy trải nghiệm đời trước để khẳng định sub-agent hiện nay không thể hỏi ngược hoặc trao đổi với main.

**¶2.** Khả năng gửi message hai chiều đã mở đường để sub báo blocker, bổ sung evidence và phản bác brief. Tuy nhiên, có đường truyền chưa giải quyết hết chuyện **user kiểm soát đội agent như thế nào**.

**¶3, main là bộ lọc.** Main vẫn có thể chọn ngữ cảnh truyền xuống, biến yêu cầu “xe nhẹ hơn” thành task “làm nhẹ dù”, rồi chỉ báo lại rằng đội đã giảm được bao nhiêu gram. Sub có thể từng hỏi về bộ phanh, nhưng nếu câu hỏi ấy bị bỏ qua khi tổng hợp, user vẫn chỉ thấy một tiến trình tối ưu cái dù rất hiệu quả.

**¶4, bốn thứ user cần biết.** Tác giả cần biết: agent đang làm theo **brief nào**; **constraint nào thực sự đến từ mình**; **quyết định nào do main tự chọn**; và **bất đồng nào còn chưa được giải quyết**. Khi tác giả sửa hướng, thay đổi ấy phải tới được người đang thực hiện và cập nhật vào kế hoạch chung.

**¶5, giám sát khác kiểm soát.** Đọc được transcript giúp giám sát, nhưng tác giả vẫn mất quyền kiểm soát sub agent. Kiểm soát thực tế đòi hỏi hai thứ: biết sự can thiệp đã làm thay đổi công việc hay chưa, và được chủ động steering khi cần. Tác giả không muốn thành dispatcher duyệt từng method, nhưng cũng không muốn giao việc đồng nghĩa với mất đường tiếp cận sub agent đang implement.

**Phân tích mục 3.6**

- **Tính công bằng của phê bình (¶1):** tác giả giới hạn mệnh đề vào đúng thế hệ công cụ đã dùng. Từ đây, trọng tâm chuyển từ **năng lực kỹ thuật** (có kênh hay không) sang **quản trị** (ai kiểm soát, ai biết gì).
- **Kênh không phải quản trị (¶2–3).** Khi mọi thông tin về user đều đi qua main, main là một điểm nén có mất mát (lossy). Phản biện của sub có tồn tại trong transcript vẫn có thể biến mất trong bản tổng hợp. Đây là lập luận cho một **bản ghi chung độc lập với main**.
- **Bốn thứ ở ¶4 là một đặc tả provenance:** phiên bản brief, nguồn gốc của từng ràng buộc (user hay main), tác giả của từng quyết định, và danh sách bất đồng còn mở. Cả bốn đều là dữ liệu có thể ghi lại bằng máy, không cần phán đoán.
- **Quan sát được khác điều khiển được (¶5).** Tương tự cặp khái niệm observability và controllability trong lý thuyết điều khiển: đọc transcript cho observability; kiểm soát cần thêm một vòng phản hồi xác nhận can thiệp đã có hiệu lực. Yêu cầu “biết can thiệp đã làm đổi công việc chưa” là yêu cầu đo hiệu lực của can thiệp.
- **Hai cực cần tránh:** dispatcher duyệt từng method (quá nhiều kiểm soát) và giao rồi mất dấu (quá ít). SLP được đặt giữa hai cực này.

### 3.7. “SLP là cách tôi tổ chức công việc quanh những vấn đề đó”

**¶1, nền tảng.** Nhắc lại định nghĩa và tính opinionated của SLP, thêm lời tự giễu rằng đặt tên cho “nghe nguy hiểm và hào nhoáng”. Thông tin mới: tác giả dùng **Paseo** làm lớp duy trì **room, session và truyền message**. SLP là cách tổ chức công việc trên các primitive mà Paseo cung cấp, và **không dùng các orchestration skill mà Paseo đưa sẵn**.

**¶2, hai nhu cầu đồng thời.** Vẫn cần một người giữ trạng thái chung và chịu trách nhiệm tích hợp. Đồng thời, người trực tiếp làm việc phải sở hữu cả phán đoán kỹ thuật trong phạm vi của mình. Giao một module nhưng giữ toàn bộ quyền suy nghĩ ở main thì khó kỳ vọng xuất hiện góc nhìn độc lập.

**¶3, bảng vai trò (theo bài).**

| Vai | Trách nhiệm tác giả cần |
| --- | --- |
| Human | Giữ mục tiêu, ưu tiên và những đánh đổi thuộc quyền mình; có đường tiếp cận và sửa hướng công việc |
| Supervisor | Trao đổi với human về kiến trúc và hướng đi; theo dõi vấn đề xuyên phạm vi; phát hiện lệch hướng và can thiệp trong quyền được giao |
| Lead | Giữ trạng thái chung của room; phân chia ownership; xử lý dependency; đánh giá evidence; chịu trách nhiệm integration và acceptance |
| Peer | Chịu trách nhiệm chuyên môn cho việc được giao; điều tra, thiết kế, implement hoặc review; được chất vấn tiền đề và đề nghị thay đổi phạm vi |

**¶4, cái dù đi qua SLP.** Peer phụ trách giảm tốc có thể báo cái dù là lựa chọn không phù hợp. Lead phải xét bằng chứng và phối hợp với owner của khung xe nếu cần gắn bộ phanh. Nếu thay đổi tác động tới **mục tiêu hoặc chi phí** mà tác giả chưa chấp thuận, Supervisor đưa quyết định đó về trao đổi với tác giả.

**¶5, can thiệp trực tiếp.** Supervisor có thể nói trực tiếp với Peer khi cần, và tác giả cũng muốn tiếp cận được agent đang thực hiện. Nhưng những can thiệp làm đổi hướng phải quay về trạng thái chung mà Lead quản lý. Nếu một người được bảo giữ dù, người khác được bảo tháo dù, còn Lead không biết gì, thì chỉ vừa tạo thêm một nguồn conflict.

**¶6, invariant vận hành.** Một phạm vi đang thay đổi có **một owner cho tới khi bàn giao rõ ràng**. Ba hệ quả được nêu: Lead không vừa giao Peer sửa phanh vừa tự chỉnh cùng bộ phanh để “hỗ trợ”; Reviewer phải biết mình đang review phiên bản nào; Peer phát hiện vấn đề ở khung xe có quyền yêu cầu sửa, nhưng không tự nhiên có quyền ghi đè công việc của owner khung.

**¶7.** Độc lập trong phán đoán cần đi cùng trách nhiệm phối hợp. Nếu mọi agent đều tự mở scope và tự sửa mọi thứ, chiếc xe sẽ có rất nhiều người cầm cờ lê chọc ngoáy và không ai biết hình dạng cuối cùng của nó.

**Phân tích mục 3.7**

- **Kiến trúc hai tầng (¶1):** Paseo cung cấp cơ chế (room, session, message); SLP cung cấp tổ chức. Việc tác giả không dùng orchestration skill có sẵn cho thấy SLP được đặt *thay* cho các công thức điều phối đóng gói. Đây chính là ranh giới mà Seatworks ghi thành luật: plugin chỉ quyết định vòng đời phiên, vận chuyển, định tuyến, thông báo, trạng thái bền vững và nguồn gốc.
- **Mỗi vai là một trục thẩm quyền riêng (¶3):** Human giữ mục tiêu và đánh đổi; Supervisor giữ tầm nhìn xuyên phạm vi; Lead giữ tích hợp và chấp nhận; Peer giữ phán đoán kỹ thuật. Không vai nào chứa vai kia, nên đây không phải chuỗi mệnh lệnh.
- **Tiêu chí escalation lên Human được nêu rõ (¶4):** thay đổi chạm **mục tiêu** hoặc **chi phí** chưa được chấp thuận. Đây là một tiêu chí hẹp và kiểm chứng được; mọi thứ khác được giải bên dưới.
- **Ràng buộc duy nhất trên đường tắt (¶5):** Supervisor được nói thẳng với Peer, nhưng can thiệp phải quay về trạng thái chung của Lead. Lý do là chống chuỗi lệnh ngầm tạo conflict, không phải tôn ti trật tự.
- **Bốn invariant có thể cơ giới hóa (¶6):** một writer trên mỗi phạm vi; người giao việc không làm song song cùng phạm vi; review gắn với một phiên bản xác định; quyền yêu cầu khác quyền ghi đè. Cả bốn đều là loại luật máy kiểm được, không cần phán đoán.
- **Căng thẳng cốt lõi (¶7):** độc lập và phối hợp. ¶2 đẩy về độc lập; ¶7 kéo về phối hợp. Lời giải của bài chính là tách quyền ở 3.3: độc lập về *tiếng nói*, phối hợp về *quyền ghi*.

### 3.8. “SLP không phải role-play cho agent”

**¶1.** Tác giả muốn nói rõ một điểm: SLP không phải role-play cho agent.

**¶2.** Supervisor, Lead và Peer không phải ba personality prompt kiểu “bạn là một kiến trúc sư khó tính”, “bạn là senior engineer thích phản biện” hay “Hãy hành xử như engineering manager”. Tác giả không quan tâm chúng nói chuyện giống một team người đến mức nào. **Role trong SLP mô tả trách nhiệm vận hành và quyền hạn, không mô tả tính cách.**

**¶3, định nghĩa vận hành của từng vai.**

- **Lead:** giữ trạng thái chung nào, được quyết định điều gì, khi nào phải escalation.
- **Peer:** sở hữu phạm vi nào, được sửa gì, được chất vấn những giả định nào, và phải trả evidence về đâu.
- **Supervisor:** quan sát những vấn đề xuyên phạm vi nào, lúc nào nên can thiệp, và quyết định nào phải đưa lại cho human.
- Những thứ đó mới tạo thành role.

**¶4, các kiểu Peer.** Lead có thể tạo một Peer là **Implementer**, **Reviewer**, **System Architect** (để hỏi ý kiến về một quyết định design khó), hoặc **Auditor** (để điều tra chất lượng TDD cũng như các e2e proof).

**¶5, phép thử đổi tên.** Nếu bỏ tên Supervisor, Lead, Peer, thay bằng “DCM”, mà phạm vi trách nhiệm, luồng thông tin, quyền hạn và escalation path vẫn giữ nguyên, thì SLP về cơ bản vẫn hoạt động như cũ. Ngược lại, cho ba agent system prompt mô tả chức danh rất chi tiết nhưng cả ba cùng đọc một context, cùng được sửa mọi file, cùng có quyền đổi plan và không ai chịu trách nhiệm integration, thì đó không phải SLP, chỉ là “3 agent đang role-play một engineering team”. Tác giả nói có thể sẽ viết chi tiết hơn về cách setup SLP và cung cấp case study thực tế nếu có thời gian hoặc bị trigger đủ mạnh, nhưng tự nhận mình lười nên chắc không có.

**¶6.** Tác giả dùng tên các vai vì đó là cách ngắn nhất để diễn đạt cấu trúc trách nhiệm. SLP là mô hình tổ chức công việc và trao đổi, không diễn lại sơ đồ tổ chức của con người.

**Phân tích mục 3.8**

- **Định nghĩa role theo cấu trúc (¶3).** Mỗi role là một bộ thuộc tính vận hành: trạng thái được giữ, quyền quyết định, điều kiện escalation, phạm vi sửa, phạm vi chất vấn, nơi trả evidence, phạm vi quan sát, thời điểm can thiệp, và loại quyết định thuộc về human. Không thuộc tính nào là tính cách.
- **Phép thử đổi tên là một tiêu chí bất biến (¶5).** SLP được định nghĩa bởi cấu trúc, không bởi nhãn. Phản ví dụ liệt kê bốn điều kiện cần: context tách biệt, quyền sửa tách biệt, quyền đổi plan không chia đều cho tất cả, và có người chịu trách nhiệm integration. Thiếu một trong bốn là không còn SLP.
- **Đặt trong văn liệu:** các framework như ChatDev và MetaGPT dựng đội agent quanh vai trò mô phỏng công ty phần mềm (CEO, CTO, product manager, engineer…). Bài không nhắc tên các framework này, nhưng lập trường “không diễn lại sơ đồ tổ chức của con người” đối lập trực tiếp với hướng đó (xem mục 5).
- **Peer là một lớp năng lực, không phải một chức danh (¶4).** Implementer, Reviewer, Architect, Auditor là các biến thể của cùng một vai, khác nhau ở loại nhiệm vụ. Seatworks hiện thực đúng ý này: `architect` và `auditor` trong `roles.json` đều là `like: reviewer`.
- **Tính chất của bằng chứng:** tác giả thừa nhận chưa công bố cách setup hay case study. Vì vậy mọi đánh giá hiệu quả của SLP trong bài đều dựa trên lời kể.

### 3.9. “Một cuộc phản biện phải thực sự đưa ra 1 outcome hữu ích”

**¶1, vòng phối hợp đầy đủ.** Vòng phối hợp có giá trị phải đi đủ từ phát hiện tới quyết định. Peer chỉ ra thiết kế hiện tại có vấn đề, đưa test tái hiện hoặc evidence cụ thể. Lead xem xét, đối chiếu với mục tiêu và constraint, phối hợp với owner liên quan rồi điều chỉnh công việc nếu cần. Sau khi sửa, evidence mới phải chứng minh vấn đề đã được xử lý **trên chính trạng thái code sẽ được chấp nhận**.

**¶2, không có prompt thần kỳ.** Đây là chỗ instruction cho Lead, Peer và Supervisor cần đủ tinh tế. Tác giả cố tình không đưa ra một system prompt thần kỳ nào cho SLP, vì cách viết instruction phụ thuộc rất nhiều vào model, loại công việc và mức độ trưởng thành của codebase. Ai adapt mô hình này sẽ phải tự thử và tinh chỉnh.

**¶3, nguyên tắc.** Đừng biến **quyền phản biện** thành **nghĩa vụ phải phản biện**.

**¶4, cơ chế hỏng.** Nếu prompt liên tục nhấn mạnh “hãy tìm lỗ hổng”, “hãy thách thức mọi giả định”, “đừng tin Lead”, agent dễ học ra một hành vi khác: muốn chứng minh mình đang làm tốt vai trò thì phải tìm ra thứ để phản đối. Với model reasoning mạnh, vấn đề này càng rõ. Sol/Astra có thể bẻ gần như bất kỳ luận điểm nào nếu trả đủ token. Một thiết kế đang ổn vẫn luôn có thể được nhìn từ bốn góc: một giả định khác, một failure mode hiếm khi xảy ra, một abstraction “sạch” hơn, hoặc một kiến trúc tổng quát nhiều abstraction trông elegant hơn (mà tác giả không cần).

**¶5.** Lúc ấy chúng ta không còn trả token để tìm lỗi đáng sửa nữa, mà đang **trả token để thưởng cho sự tranh biện**.

**¶6, vị thế của Peer và Lead.** Peer không cần chứng minh Lead sai; nó cần có quyền nói Lead sai **khi evidence buộc phải nói như vậy**. Lead cũng không cần bảo vệ plan. Lead cần phân biệt ba loại: phát hiện làm thay đổi quyết định; một phương án khác cũng hợp lý; và một cuộc tranh luận không đủ giá trị để làm gián đoạn công việc.

**¶7, brief ba phần.** Brief nên phân biệt rõ: **mục tiêu**, **constraint thực sự bắt buộc** và **lựa chọn thiết kế hiện đang được dùng**. “Xe phải dừng được trong điều kiện X” là requirement. “Xe phải dùng dù để dừng” chỉ là requirement nếu đang thực sự làm một thí nghiệm về dù. Nếu cái dù chỉ là phương án agent trước nghĩ ra, Peer sau phải biết nó được phép đặt câu hỏi về cái dù.

**¶8, tính hợp lệ của phép đo.** Trong các vòng benchmark Quark so với Iris (Unreal) và NfE (Unity), mà tác giả đùa là làm “để tự sướng”, các lượt đo trước và sau phải chạy trong điều kiện so sánh được. Ba tình huống phá hỏng phép đo: hai agent cùng chiếm CPU; một agent compile project khác trong lúc agent của Quark benchmark; workload bị sửa giữa hai lượt đo. Khi đó con số vẫn hoàn toàn “thật” nhưng kết luận từ chúng không còn đáng tin.

**¶9.** Chiếc xe đạp: một người đang đo sức đạp, người khác chạy phía sau đẩy xe, rồi cả đội công bố hiệu suất truyền động đã tăng. Đồng hồ không nói dối, nhưng điều kiện thí nghiệm đã thay đổi nên kết quả không đáng tin.

**¶10, Supervisor xuyên workspace.** Trao đổi cross-workspace, nơi một Supervisor có góc nhìn xuyên suốt các project, có thể dùng cho việc rất thực dụng: ai đang giữ máy để benchmark, tiến trình nặng nào phải dừng, khi nào người khác được chạy lại. Nhưng một message “tôi sẽ nhường CPU” **chưa phải evidence** rằng CPU thực sự đã rảnh. Cuối cùng vẫn phải kiểm tra trạng thái thật.

**¶11, bắt đầu đơn giản.** Tác giả ví chính SLP với một chiếc xe đạp. Muốn adapt: bắt đầu đơn giản, dùng trong công việc thật rồi tinh chỉnh dần. Thấy agent chỉ biết làm theo thì mở thêm không gian chất vấn. Thấy chúng tranh luận mọi thứ thì chỉnh instruction để phản biện phải gắn với một vấn đề cụ thể và một quyết định đáng xem xét. Không có lý do gì phải dựng sẵn cả một bộ máy điều phối chỉ vì trên giấy nó trông đầy đủ.

**¶12, hai thái cực.** Từ một đội agent phục tùng mọi brief, rất dễ đi sang thái cực còn lại: agent nào cũng muốn chứng minh mình có tư duy độc lập, còn cả đội chìm trong những cuộc phản biện chồng chéo. SLP cũng cần được điều chỉnh để tránh điều đó. Tác giả muốn chiếc xe chạy được, và người đang sửa nó biết lúc nào cần lên tiếng.

**¶13, mục tiêu của orchestration.** Không phải tạo ra càng nhiều phản biện càng tốt, mà là để **đúng phản biện đi tới đúng người và thực sự thay đổi công việc khi nó đáng để thay đổi**.

**Phân tích mục 3.9**

- **Vòng bốn bước có điều kiện đóng (¶1):** phát hiện có evidence → Lead đối chiếu mục tiêu và constraint → phối hợp owner, điều chỉnh → evidence mới **gắn với đúng phiên bản sẽ được chấp nhận**. Điều kiện cuối chặn một lỗi rất phổ biến: test chạy trên một phiên bản, merge một phiên bản khác. Nó khớp với invariant “Reviewer phải biết mình review phiên bản nào” ở 3.7.
- **Prompt là một hệ khuyến khích (¶4–5).** Khi vai trò được đo bằng việc phản đối, agent tối ưu việc phản đối: một dạng của định luật Goodhart áp vào prompt. Đây là hình ảnh đối xứng của sycophancy (chiều theo người dùng): *bất đồng trình diễn*. Cách sửa của bài không phải bỏ phản biện, mà gắn nó với evidence (¶6).
- **Lead phân loại ba nhóm (¶6):** thay đổi quyết định / phương án thay thế ngang giá / tranh luận không đáng. Nhóm giữa quan trọng nhất: một phương án khác hợp lý **không đủ** để đổi plan. Điều này cân bằng lại nguyên tắc “giữ plan cũng cần lý do” ở 3.3.
- **Brief ba phần (¶7) là cơ chế chống cái dù:** nó gắn nhãn nguồn gốc cho mỗi dòng của brief (đây là mục tiêu, đây là ràng buộc thật, đây chỉ là lựa chọn hiện tại). Nhờ vậy quyền chất vấn có phạm vi rõ: được hỏi về lựa chọn thiết kế, không cần hỏi lại mục tiêu. Seatworks hiện thực đúng ba phần này: “what must hold, what it chose and what nobody knows yet”.
- **Tính hợp lệ nội tại của phép đo (¶8–9):** đây là khái niệm *biến gây nhiễu* (confounder) trong thiết kế thí nghiệm. Trong một đội agent chạy song song, tài nguyên máy dùng chung là biến gây nhiễu mặc định. Đây là một vấn đề riêng của multi-agent mà ít tài liệu nhắc tới.
- **“Message không phải evidence” (¶10)** là phiên bản cụ thể của nguyên tắc *evidence, not claims*: một lời hứa của agent về trạng thái thế giới phải được kiểm tra bằng trạng thái thật. Seatworks hiện thực bằng công cụ `machine` và `MachineHold`: khi Peer đo, desk không khởi động gate hay setup nào.
- **Phương pháp điều chỉnh hai chiều (¶11–12):** phục tùng thì mở, tranh luận quá thì siết. Đây là một vòng điều khiển có phản hồi, không phải một cấu hình cố định. Nó dẫn trực tiếp vào Better-SLP (3.10).
- **¶13 là phát biểu cô đọng nhất của luận đề**, gồm ba điều kiện: đúng phản biện, đúng người nhận, thay đổi có thật. Đây là một tiêu chí routing, không phải một tiêu chí số lượng.

### 3.10. “Better SLP”: đánh giá và tự cải tiến chính phương pháp

**¶1, thước đo.** Tác giả đánh giá orchestration bằng **chuỗi thay đổi**, gồm sáu điểm kiểm: Lead biết gì khi giao việc; Lead có can thiệp đúng lúc không; Peer phát hiện thêm điều gì; evidence ấy có đủ để sửa nhận định không; quyết định mới được truyền tới những owner nào; và kết quả cuối cùng đã thay đổi ra sao. Không đo bằng số lần các agent phản biện lẫn nhau hay số lần plan bị thay đổi.

**¶2, tự áp dụng nguyên tắc.** Nếu đã yêu cầu agent không được bảo vệ một thiết kế chỉ vì nó đang tồn tại, hay vì một doctrine có sẵn, thì bản thân orchestration methodology cũng không nên được miễn nguyên tắc đó.

**¶3, SLP là một thiết kế đang được kiểm chứng.** SLP không phải bộ luật viết xong rồi bắt mọi project tuân theo. Bốn lỗi tác giả đã từng nhận ra: Lead ôm quá nhiều trách nhiệm; Supervisor can thiệp quá muộn; Peer báo vấn đề đúng nhưng message không đủ context để người khác hành động; một bước review tạo nhiều ceremony hơn giá trị nó mang lại. Những vấn đề đó không nên được giải bằng cách thêm một role, một checklist hay một vòng approval chỉ để giữ nguyên SLP.

**¶4.** Better-SLP ra đời từ lý do đó: một framework để quan sát chính SLP, sửa và đơn giản hóa dần từ những failure mode gặp khi sử dụng.

**¶5, cải tiến bằng phép trừ.** Better-SLP không phải “SLP phiên bản tốt hơn” theo nghĩa vài tuần lại thêm feature. Nhiều cải tiến tốt nhất của orchestration có thể là: bỏ bớt một cơ chế; giảm một vòng message; chuyển một trách nhiệm về đúng owner; hoặc nhận ra một loại task vốn không cần Supervisor tham gia.

**¶6, bốn luật chẩn đoán.**

| Triệu chứng | Chỗ hỏng khả dĩ theo bài | Hướng xử lý |
| --- | --- | --- |
| Peer liên tục escalation cùng một loại vấn đề | Instruction của Lead | Sửa instruction của Lead |
| Lead luôn phải đọc lại toàn bộ transcript mới hiểu Peer nói gì | Protocol báo cáo thiếu context | Sửa định dạng báo cáo |
| Supervisor cứ phải cứu những quyết định lẽ ra Lead tự xử lý được | Ranh giới giữa hai role sai | Vẽ lại ranh giới |
| Một reviewer peer hiếm khi thay đổi kết quả nhưng luôn tốn nhiều token | Reviewer đó không tạo giá trị | Reviewer phải chứng minh vì sao còn tồn tại; không chứng minh được thì bỏ |

**¶7, telemetry.** Tác giả muốn SLP tự cải tiến từ telemetry của chính quá trình làm việc, gồm năm tín hiệu: conflict nào lặp lại; escalation nào thực sự dẫn tới thay đổi; review nào bắt được lỗi có giá trị; intervention nào đến quá muộn; ceremony nào chỉ tạo thêm “traffic rác ngốn token”.

**¶8, cảnh báo tối ưu nhầm metric.** Một orchestration thấy ba lần Peer bắt lỗi thành công rồi kết luận “hãy tăng phản biện lên gấp đôi” rất dễ tối ưu nhầm metric. Giống benchmark, thứ cần quan tâm không phải activity tăng bao nhiêu mà outcome thay đổi thế nào. Ví dụ xe đạp: tay phanh quá xa thì chỉnh tay phanh; xích hay tuột thì sửa truyền động; nhưng đừng vì ba lần sửa xe hữu ích mà kết luận cứ mỗi kilômét phải dừng lại tháo xe kiểm tra toàn bộ (tác giả đùa chỉ ai kém hơn học sinh lớp 5 mới làm thế).

**¶9, trạng thái trưởng thành.** Một methodology tốt phải học được cả khi nào nên thêm cơ chế và khi nào nên thôi can thiệp. Trạng thái trưởng thành hơn: không chỉ cho phép plan thay đổi khi có evidence mới, mà chính cách lập plan, chia ownership, review và escalation cũng được phép thay đổi theo evidence.

**Phân tích mục 3.10**

- **Đo bằng dấu vết nhân quả, không bằng đếm hoạt động (¶1).** Sáu điểm kiểm tạo thành một chuỗi nhân quả từ thông tin ban đầu đến kết quả. Trong khoa học xã hội, cách làm này gọi là *process tracing*. Nó tránh được bẫy “nhiều phản biện = tốt” hoặc “ít thay đổi plan = tốt”.
- **Tính phản thân (¶2, ¶9).** Methodology tự áp nguyên tắc của mình lên mình. Khái niệm gần nhất là *double-loop learning* của Argyris và Schön: vòng đơn sửa hành động (plan), vòng kép sửa chính các quy tắc sinh ra hành động (cách lập plan, chia ownership, review, escalation).
- **Ưu tiên phép trừ (¶3, ¶5).** Bài cảnh báo rõ xu hướng sửa lỗi quy trình bằng cách thêm quy trình. Đây là cùng mô thức “thêm cơ chế bù” ở 3.1 và 3.5, nhưng áp vào chính tổ chức. SLP thêm checklist để giữ SLP chính là cái dù ở tầng phương pháp.
- **Bảng chẩn đoán (¶6) quy triệu chứng về một chỗ sửa cụ thể** (instruction, protocol, ranh giới, sự tồn tại của một vai). Cả bốn triệu chứng đều đo được từ bản ghi, nên có thể tự động hóa việc phát hiện.
- **Telemetry (¶7) là tỷ lệ, không phải số đếm:** escalation *dẫn tới thay đổi*, review *bắt được lỗi có giá trị*. Mỗi tín hiệu đo hiệu quả của một cơ chế, không đo lượng dùng cơ chế đó. Seatworks hiện thực ý này trong report card: đếm bao nhiêu review đã thay đổi công việc “so one that seldom does can be dropped”, và bao nhiêu challenge đã thay đổi plan.
- **Cảnh báo cỡ mẫu (¶8).** Ví dụ “ba lần thành công” là một cảnh báo về khái quát từ cỡ mẫu nhỏ, kết hợp với Goodhart. Nó áp ngược lại chính cơ chế tự cải tiến: telemetry không được tự động biến thành luật.

### 3.11. “Những hướng tiếp cận đang gặp nhau”

**¶1, Andrew Ng.** Nhiều hướng tiếp cận đang cùng chú ý tới cấu trúc phối hợp. Andrew Ng đã bàn về multi-agent collaboration từ năm 2024: các agent có vai trò, workflow, bộ nhớ riêng và có thể nhờ nhau hỗ trợ. Ông cũng lưu ý chất lượng đầu ra khó dự đoán khi agent tương tác tự do và dùng nhiều tool. Bài của Ng trên The Batch được tác giả coi là một nền tảng hữu ích để bàn tiếp.

**¶2, Feng và cộng sự (2026).** Preprint tháng 8/2026 *Graph Engineering in the Era of LLM Agents: From Individual Intelligence to System Intelligence* của Yuyuan Feng và các đồng tác giả xem task, agent và trạng thái hệ thống qua những cấu trúc đồ thị có thể biến đổi. Trọng tâm mở rộng từ năng lực của một agent sang cách tổ chức cả hệ thống. Tác giả nói rõ đây là một bài tổng quan riêng, không phải paper của Andrew Ng.

**¶3.** Sự tương đồng với SLP nằm ở nhu cầu biểu diễn rõ quan hệ phụ thuộc, đường trao đổi, và cách cấu trúc phối hợp thay đổi khi có bằng chứng mới. Tác giả nhấn mạnh đó là phần *ông* đối chiếu; bài tổng quan **không phải một kiểm chứng cho SLP**.

**¶4, cây và đồ thị.** Một sơ đồ cây cho biết ai spawn ai. Trong công việc của tác giả còn phải biết bốn quan hệ khác: ai sở hữu module; ai cần dữ liệu của ai; ai có quyền sửa quyết định; ai phải được thông báo. Các quan hệ đó không nhất thiết trùng với quan hệ cha–con giữa session, và chúng thay đổi khi feature sau làm lộ một dependency chưa biết.

**¶5, công cụ.** Agent teams của Claude Code cho phép các session phối hợp, teammate trao đổi trực tiếp và user tương tác với từng teammate; tính năng này hiện được mô tả là experimental. Claude Code còn có cross-session messaging. Trong môi trường Codex tác giả dùng, các tool trao đổi giữa agent và giữa những chat riêng cũng tạo thêm đường phối hợp. Những khả năng đó làm các workflow như báo blocker hay nhường tài nguyên để benchmark khả thi hơn.

**¶6, cạnh không phải quyền.** Có thêm cạnh trên đồ thị chưa bảo đảm quyết định tốt hơn. Nếu mọi message vẫn xoay quanh việc làm cái dù nhẹ hơn, một đội giao tiếp rất sôi nổi vẫn có thể bỏ qua bộ phanh. Điều tác giả quan tâm là bằng chứng có đi tới đúng người không, và người đó có quyền thay đổi quyết định không. Thêm một lý do: tác giả vẫn dùng Paseo-SLP vì nó cho phép phối hợp điểm mạnh của mỗi model.

**Phân tích mục 3.11**

- **Cách dẫn nguồn thận trọng:** tác giả phân biệt hai nguồn (“không phải paper của Andrew Ng”) và tự giới hạn tuyên bố (“không phải kiểm chứng cho SLP”). Nguồn được dùng để đặt SLP vào bối cảnh, không để chứng minh. Mục 4 kiểm chứng hai nguồn này.
- **Đồ thị đa quan hệ (¶4).** Bài liệt kê năm loại cạnh khác nhau: spawn, ownership, phụ thuộc dữ liệu, quyền sửa quyết định, nghĩa vụ thông báo. Đây là một *multi-relational dynamic graph*, và là lập luận mạnh nhất trong bài chống lại mô hình cây cha–con của hầu hết công cụ sub-agent. Seatworks gọi đúng tên ý này: SLP là “a federated governance graph, not a tree”.
- **Tách topo giao tiếp khỏi quyền quyết định (¶6).** Thêm kênh (cạnh) chỉ tăng khả năng thông tin đi lại; không tăng khả năng thông tin đó được hành động. Đây là lý do agent teams hay v2 messaging chưa đủ theo tác giả: chúng giải bài toán kênh, chưa giải bài toán quyền.
- **Lý do cuối (¶6) là tính đa model:** SLP trên Paseo cho phép mỗi vai ngồi trên một model khác. Đây là một lợi thế thực dụng mà công cụ của một nhà cung cấp khó có. Seatworks dùng đúng ý này cho vai “Second reviewer”, một Reviewer trên model khác để hai lăng kính review không phải một model đọc hai lần.

### 3.12. “SLP phù hợp với bài toán của tôi, có thể không hợp với bạn” và phần bình luận

**¶1.** Tác giả chia sẻ SLP để những người gặp vấn đề tương tự lấy các pain point này để đối chiếu, rồi adapt cách phối hợp cho công việc của họ. SLP không phải north star cho mọi team dùng AI.

**¶2, khi không dùng SLP.** Với một thay đổi nhỏ, một agent làm từ đầu tới cuối có thể tốt hơn cả một room. Với những task cần feedback liên tục từ human như game feel, combat feel, UI/UX, tác giả thường không dùng SLP.

**¶3, bài tiếp theo.** Cái dù là một trong những anti-pattern tác giả muốn viết kỹ hơn trong bài tiếp theo về agent-driven development. Ba tình huống khác được hẹn trước, cũng qua chiếc xe đạp: nhiều người cùng chỉnh một bộ phanh; kiểm tra xe trên giá rồi kết luận chạy ngoài đường ổn; thêm một cơ cấu mới chỉ để giữ lời hứa của cơ cấu cũ.

**¶4, lời kết và tuyên bố về động cơ.** Tác giả muốn một đội agent đủ năng lực làm ra chiếc xe, đủ độc lập để hỏi vì sao nó cần cái dù, và phối hợp đủ tốt để thực sự thay đổi thiết kế. Phần còn lại là giọng đùa và tuyên bố động cơ: tác giả không khuếch đại pain point để bán giải pháp; ai không cùng pain point thì không cần quan tâm; bài được viết để cộng tác với chủ một “hội kín” tác giả đang tham gia (và đùa mong người đọc đừng vào); thuật ngữ khó thì copy cho ChatGPT giải thích, và tác giả đùa rằng mình dùng thuật ngữ một phần “cho sang cái mồm”.

**¶5, tuyên bố tác giả.** Bài tự viết; ai cho rằng ChatGPT viết thì tác giả thách một kèo nghị luận xã hội tại TP.HCM. Hình minh họa thì do ChatGPT làm.

**Bình luận duy nhất.** Độc giả “Bigboy” (27/9/2026, 8:37 PM): cùng là dùng AI mà “Quỷ” (cách gọi đùa dành cho tác giả) dùng nó khác người thường. Bình luận không có nội dung kỹ thuật.

**Phân tích mục 3.12**

- **Điều kiện biên được nêu tường minh (¶1–2),** cùng với CRUD ở 3.1 ¶5. Gộp lại, SLP chỉ dành cho công việc: đủ lớn để chạm nhiều module; có phụ thuộc dọc; và có tiêu chí chấp nhận kiểm chứng được bằng máy (test, benchmark). Việc loại trừ game feel và UI/UX hợp lý: tiêu chí chấp nhận ở đó nằm trong cảm nhận của con người, nên mọi vòng đều phải đi qua Human.
- **Ba anti-pattern được hẹn trước (¶3)** tương ứng ba khái niệm kỹ thuật: xung đột ghi (nhiều writer trên một phạm vi, trái invariant ở 3.7); chênh lệch giữa môi trường kiểm tra và môi trường thật (liên quan 3.4); và cơ chế bù để giữ cam kết cũ (3.5). Seatworks đã có `docs/ANTIPATTERNS.md` cho nhóm này (mục 7).
- **Giọng văn:** phần kết chủ đích hài hước và phủ nhận động cơ thương mại. Điều này phù hợp với thể loại bài luận cá nhân và không ảnh hưởng tới nội dung kỹ thuật. Các tuyên bố về tác giả và động cơ không kiểm chứng được và cũng không cần cho việc đánh giá lập luận.

## 4. Các research paper và nguồn được đề cập

Bài nêu tên hai nguồn học thuật, hai tài liệu sản phẩm của Claude Code, một hệ công cụ (Codex), một nền tảng (Paseo) và hai hệ thống netcode để so sánh. Không nguồn nào được dùng làm bằng chứng cho SLP; tác giả tự nói rõ điều này.

**Mức kiểm chứng:** *Đã mở* = đã đọc trang gốc. *Nguồn phụ* = trang gốc bị mạng chặn, đã đọc một trang khác mô tả nó. *Chưa mở* = chỉ có kết quả tìm kiếm; nội dung ghi lại là gần đúng và cần đối chiếu.

| Nguồn | Bài dùng nó thế nào | Nguồn thực sự nói gì | Mức kiểm chứng | Đánh giá cách dùng |
| --- | --- | --- | --- | --- |
| [Andrew Ng, “Agentic Design Patterns Part 5, Multi-Agent Collaboration”, The Batch (04/2024)](https://www.deeplearning.ai/the-batch/agentic-design-patterns-part-5-multi-agent-collaboration) | Nền tảng để bàn về điều phối: agent có vai trò, workflow, bộ nhớ riêng, nhờ nhau hỗ trợ; chất lượng đầu ra khó dự đoán khi tương tác tự do với nhiều tool | Bài thứ 5 (cuối) trong loạt bốn mẫu thiết kế agentic: Reflection, Tool use, Planning, Multi-agent collaboration. Chia việc phức tạp cho các agent đóng vai khác nhau (kỹ sư, PM, designer, QA) | Chưa mở (tên miền bị chặn); đối chiếu qua kết quả tìm kiếm | Khớp về thời gian và chủ đề. Lưu ý: mô hình của Ng dựa trên đóng vai (role-playing), đúng hướng mà bài phản đối ở 3.8. Bài dùng Ng làm “nền tảng” nhưng không nêu điểm khác biệt này |
| Feng, Xiang, Yang, Ma, Chen, Zhang, Huang, Wu, Liu, Wang và cộng sự, [*Graph Engineering in the Era of LLM Agents: From Individual Intelligence to System Intelligence*, arXiv:2608.21156 (08/2026)](https://arxiv.org/abs/2608.21156) | Xem task, agent và trạng thái hệ thống qua cấu trúc đồ thị biến đổi được; trọng tâm chuyển từ năng lực một agent sang tổ chức hệ thống | Survey. Chuỗi mô thức: Prompt → Context → Harness → Loop → Graph Engineering, thêm Ontology Engineering. Ba cấp trí tuệ: Model, Individual, System Intelligence. Graph Engineering xây cấu trúc đồ thị tường minh, động, tiến hóa được cho task, agent và trạng thái | Nguồn phụ: [repo Awesome-Graph-Engineering](https://github.com/DEEP-JLU/Awesome-Graph-Engineering) và kết quả tìm kiếm; arxiv.org bị chặn | Mô tả trong bài chính xác. Tác giả phân biệt đúng đây không phải paper của Ng và không phải kiểm chứng cho SLP |
| [Claude Code: Orchestrate teams of Claude Code sessions (agent teams)](https://code.claude.com/docs/en/agent-teams) | Cho phép session phối hợp, teammate trao đổi trực tiếp, user tương tác với từng teammate; hiện là experimental | Experimental, tắt mặc định (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). Một lead, các teammate có context riêng, task list chung, mailbox; user nhắn trực tiếp cho bất kỳ teammate nào. Lead cố định, không có team lồng nhau | Đã mở | Chính xác. Xem phân tích bên dưới về một điểm đối lập với bài |
| [Claude Code: cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging) | Một đường phối hợp bổ sung giữa các session | Gửi text giữa các session của cùng một người, cục bộ hoặc qua máy khác và cloud. Message từ session khác không bao giờ được tính là sự đồng ý của user, không được đổi cấu hình; người nhận có thể chọn accept, hold hoặc refuse | Đã mở | Chính xác. Thiết kế “message không mang thẩm quyền” khớp với ý “message không phải evidence” ở 3.9 |
| OpenAI Codex multi-agent v1 và v2 | Đối tượng phê bình chính (v1: pre-solve); v2 có message hai chiều nhưng chưa giải bài toán quyền kiểm soát của user | V2 thay định danh thread bằng địa chỉ theo đường dẫn, thêm công cụ message có cấu trúc, giữ “task identity, graph state, wait, follow-up, completion”; phiên bản được chọn ở lượt đầu của parent và lan xuống cả cây agent | Nguồn phụ: [openai/codex issue #33551](https://github.com/openai/codex/issues/33551); tài liệu chính thức bị chặn | Phê bình v1 là trải nghiệm cá nhân, không kiểm chứng được. Cách tác giả tự giới hạn phê bình vào v1 (3.6 ¶1) là thỏa đáng |
| Paseo | Lớp duy trì room, session, truyền message; SLP xây trên primitive của Paseo, không dùng orchestration skill có sẵn | Không mở được trang paseo.sh. Mã nguồn Seatworks xác nhận Paseo cung cấp agent, hook vòng đời (`agent.create`…), timeline, plugin API, heartbeat, worktree setup | Đối chiếu qua repo này (`AGENTS.md`, `plugin/server/runtime/`) | Khớp với kiến trúc Seatworks (mục 7) |
| [Iris, Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/introduction-to-iris-in-unreal-engine) | Mốc so sánh cho Quark; đối thủ trong benchmark | Hệ thống replication opt-in của Unreal, xây từ kinh nghiệm Fortnite, hướng tới world lớn hơn, nhiều người chơi hơn, chi phí server thấp hơn | Chưa mở (tên miền bị chặn); theo kết quả tìm kiếm | Phù hợp làm mốc. Kết quả benchmark không được công bố |
| [Netcode for Entities (NfE), Unity](https://docs.unity3d.com/Packages/com.unity.netcode@1.10/manual/index.html) | Như trên | Thuộc DOTS; khung server-authoritative có client prediction | Chưa mở (tên miền bị chặn); theo kết quả tìm kiếm | Như trên |
| Paper và blog kỹ thuật của Tencent, Amazon | Nguồn nghiên cứu trước khi thiết kế Edge Layer của Nova | Không nêu tên cụ thể | Không thể kiểm chứng | Chỉ có giá trị bối cảnh |
| “RLCD” và “Jev” | So sánh sub-agent bị pre-solve với “một model RLCD chuyên phán định như Jev” | RLCD phổ biến nhất là [Yang, Klein, Celikyilmaz, Peng, Tian, *RLCD: Reinforcement Learning from Contrastive Distillation for Language Model Alignment*, arXiv:2307.12950, ICLR 2024](https://github.com/facebookresearch/RLCD): tạo cặp ưu tiên từ prompt tích cực và tiêu cực để huấn luyện preference model rồi RL. “Jev” không có nguồn công khai; trong Seatworks, Jev là brain cảm biến của W | Nguồn phụ (repo facebookresearch/RLCD) | Không chắc tác giả dùng RLCD theo nghĩa paper này. Ý so sánh vẫn rõ: một bộ phán định nhỏ, huấn luyện để chấm theo tiêu chí |
| Tên model: GPT-5.6 Sol, Sol 5.6, Astra, Opus 5.5 | Ví dụ cho xu hướng overengineering, tìm đường vòng và bẻ luận điểm khi được trả đủ token | Không có số liệu đi kèm | Không áp dụng | Quan sát cá nhân; không nên khái quát thành đánh giá model |

**Phân tích nguồn**

- **Một điểm đối lập đáng chú ý.** Tài liệu agent teams của Claude Code có ví dụ “investigate with competing hypotheses”, trong đó prompt chủ động yêu cầu các teammate bác bỏ giả thuyết của nhau “như một cuộc tranh luận khoa học” để chống hiệu ứng mỏ neo (anchoring). Bài của vhLam cảnh báo đúng kiểu prompt này: biến quyền phản biện thành nghĩa vụ sẽ khiến agent trả token cho tranh biện (3.9 ¶4–5). Hai lập trường có thể dung hòa theo loại việc: với **discovery có nhiều giả thuyết cạnh tranh**, tranh luận có cấu trúc là công cụ chống mỏ neo; với **implement và review thường xuyên**, nghĩa vụ phản biện tạo ra bất đồng trình diễn. Đây chính là phân loại verification và discovery ở 3.3 ¶5, áp vào phản biện.
- **Agent teams đáp ứng một phần yêu cầu ở 3.6:** user nhắn trực tiếp được cho teammate, và có task list chung. Phần còn thiếu theo tiêu chí của bài: không có bản ghi nào tách constraint của user khỏi lựa chọn của lead; không có danh sách bất đồng còn mở; và can thiệp trực tiếp của user vào teammate không tự động báo cho lead. Điểm cuối trái với ràng buộc “quay về trạng thái chung của Lead” ở 3.7 ¶5. Tài liệu cũng khuyên “avoid file conflicts” bằng cách chia file cho từng teammate, cùng ý với invariant một owner.
- **Survey của Feng và cộng sự cung cấp từ vựng**, không cung cấp bằng chứng. SLP có thể được mô tả trong khung của survey là một dạng Graph Engineering do con người thiết kế, với đồ thị đa quan hệ (ownership, phụ thuộc, quyền quyết định, thông báo) được lưu trong một bản ghi chung thay vì suy ra từ cây spawn.
- **Khoảng trống nguồn:** bài không dẫn các nghiên cứu trực tiếp về thất bại của hệ đa agent, cũng như các framework đóng vai như ChatDev hay MetaGPT mà bài đối lập về khái niệm. Mục 5 và 6 bàn thêm.

## 5. Mô hình SLP và các khái niệm điều phối

SLP là một đồ thị thẩm quyền, không phải cây mệnh lệnh. Mỗi vai giữ một trục quyết định riêng, và điểm hội tụ là trạng thái chung do Lead giữ. Sơ đồ dưới đây dựng lại mô hình đúng theo mô tả trong bài (3.7, 3.8).

&#91;embedded content: SLP theo bài · 4 vai, 4 biến thể Peer, 1 trạng thái chung\]

Đường nét đứt là đường tắt duy nhất được phép: Supervisor nói thẳng với Peer, nhưng can thiệp đổi hướng phải quay về trạng thái chung của Lead. Human cũng muốn tiếp cận trực tiếp agent đang làm, với cùng điều kiện đó.

### 5.1. Bảng khái niệm

| Khái niệm | Định nghĩa theo bài | Nơi xuất hiện |
| --- | --- | --- |
| Agent ownership | Mỗi phạm vi có một agent chịu trách nhiệm chính và nắm quyền chỉnh sửa | 3.1 ¶4; 3.7 ¶6 |
| State ownership | Thành phần nào quản lý state nào | 3.1 ¶4; lỗi Quark 3.4 |
| Vertical dependency | Slice sau phụ thuộc cả code lẫn kiến trúc và thiết kế slice trước vừa tạo | 3.1 ¶6; 3.3 ¶7 |
| Pre-solve | Main tự định nghĩa bài toán, giả thuyết, tiêu chí, phạm vi và format câu trả lời trước khi giao; sub thành hàm `f(x) -> confirm / reject` | 3.1 ¶7; 3.3 ¶1–3 |
| Phương án được miễn xét lại (cái dù) | Lựa chọn thiết kế của agent trước âm thầm thành constraint của agent sau | 3.2 |
| Quyền sửa / quyền chất vấn | Hai quyền tách biệt: sửa hẹp (một owner), chất vấn rộng (được đọc và báo) | 3.3 ¶6; 3.7 ¶6 |
| Verification / discovery | Brief hẹp hợp với kiểm tra invariant hay contract đã có; discovery cần quyền mở lại giả thuyết | 3.3 ¶5 |
| Plan bốn phần | Mục tiêu, giới hạn phải giữ, điều chưa chắc, cách kiểm chứng | 3.3 ¶12 |
| Gánh nặng chứng minh đối xứng | Sửa plan cần căn cứ; giữ plan cũng cần lý do | 3.3 ¶12 |
| Đường vòng | Liên tục thêm cơ chế để bù cho cùng một mâu thuẫn nền tảng không ai được mở lại | 3.1 ¶12; 3.5 ¶2 |
| Role | Trách nhiệm vận hành và quyền hạn, không phải tính cách; bất biến khi đổi tên | 3.8 |
| Vòng phản biện đầy đủ | Phát hiện có evidence → xét → điều chỉnh → evidence mới trên đúng phiên bản sẽ được chấp nhận | 3.9 ¶1 |
| Quyền khác nghĩa vụ phản biện | Phản biện khi evidence buộc phải nói; không phải để chứng minh vai trò | 3.9 ¶3–6 |
| Brief ba phần | Mục tiêu, constraint bắt buộc, lựa chọn thiết kế hiện tại | 3.9 ¶7 |
| Message không phải evidence | Lời hứa của agent về trạng thái thế giới phải được kiểm bằng trạng thái thật | 3.9 ¶10 |
| Chuỗi thay đổi | Thước đo orchestration: sáu điểm kiểm từ thông tin ban đầu đến kết quả | 3.10 ¶1 |
| Better-SLP | Framework quan sát, sửa và đơn giản hóa chính SLP từ failure mode và telemetry | 3.10 |

### 5.2. Vòng đời của một phát hiện trong SLP

Ghép các đoạn rời rạc trong bài, một phát hiện đi qua sáu bước:

1. **Peer phát hiện tiền đề sai** khi đọc code, viết test hay đo đạc. Brief ba phần cho biết điều đó thuộc mục tiêu, ràng buộc hay chỉ là lựa chọn hiện tại (3.9 ¶7).
2. **Peer gửi evidence cho Lead**: test tái hiện hay số liệu. Peer không sửa phạm vi của owner khác (3.7 ¶6).
3. **Lead phân loại**: đổi quyết định, phương án thay thế ngang giá, hay tranh luận không đáng (3.9 ¶6). Với đề xuất redesign, Lead hỏi bốn câu ở 3.5 ¶5.
4. **Lead phối hợp owner liên quan** và cập nhật trạng thái chung. Nếu thay đổi chạm mục tiêu hoặc chi phí chưa duyệt, Supervisor đưa về Human (3.7 ¶4).
5. **Sửa và chứng minh lại** trên đúng phiên bản code sẽ được chấp nhận (3.9 ¶1).
6. **Ghi lại chuỗi thay đổi** để Better-SLP đánh giá xem phát hiện có thực sự đổi kết quả không (3.10 ¶1, ¶7).

### 5.3. So sánh với các mô hình điều phối khác

Bảng dùng đúng các tiêu chí mà bài đặt ra. Dòng Codex lấy theo mô tả của tác giả; dòng agent teams theo tài liệu đã mở; dòng role-play là bổ sung của bản phân tích, không có trong bài.

| Mô hình | Ai định nghĩa bài toán | Quyền chất vấn tiền đề | Quyền sửa | Trạng thái chung | Human tới agent đang làm | Hợp khi |
| --- | --- | --- | --- | --- | --- | --- |
| Một agent làm hết | Agent đó | Không áp dụng | Một writer | Trong context của agent | Trực tiếp | Thay đổi nhỏ; việc cần Human phản hồi liên tục |
| Main/sub, Codex v1 (theo tác giả) | Main (pre-solve) | Gần như không | Theo brief | Trong context của main | Qua main | CRUD, việc độc lập chia ngang |
| Main/sub có message hai chiều, Codex v2 (theo tác giả) | Main | Có kênh, nhưng main lọc khi tổng hợp | Theo brief | Trong context của main | Đọc transcript; khó steering | Khi cần sub báo blocker |
| Claude Code agent teams | Lead | Có; teammate nhắn nhau trực tiếp | Khuyến nghị chia file theo teammate | Task list chung | Nhắn trực tiếp, nhưng lead không tự được báo | Research, review, module tách biệt |
| Framework đóng vai ([ChatDev](https://arxiv.org/abs/2307.07924), [MetaGPT](https://arxiv.org/abs/2308.00352)) | Quy trình mô phỏng công ty | Theo quy trình định sẵn | Theo vai | Tài liệu trung gian giữa các bước | Thường không | Dựng nhanh sản phẩm nhỏ theo quy trình chuẩn |
| SLP | Human (mục tiêu) và Supervisor; Lead chia lane; Peer có phán đoán trong task | Có, gắn với evidence; không phải nghĩa vụ | Một owner mỗi phạm vi | Lead giữ, tách khỏi context từng agent | Có, can thiệp quay về trạng thái chung | Dự án lớn, phụ thuộc dọc, tiêu chí kiểm bằng máy |

Điểm khác biệt cốt lõi: các mô hình khác chủ yếu giải bài toán **kênh** (ai nói được với ai). SLP giải bài toán **thẩm quyền và nguồn gốc** (ai được đổi quyết định nào, và mỗi ràng buộc đến từ đâu).

## 6. Đánh giá phản biện

Bài mạnh về khái niệm và trung thực về giới hạn, nhưng yếu về bằng chứng: không có so sánh có đối chứng nào giữa SLP và các cách điều phối khác. Một số giả định ngầm cần được nói ra và kiểm tra.

### 6.1. Điểm mạnh

1. **Khái niệm chính xác và dùng được ngay.** Pre-solve, quyền sửa tách khỏi quyền chất vấn, verification tách khỏi discovery, brief ba phần, gánh nặng chứng minh đối xứng. Mỗi khái niệm đều chuyển được thành một quy tắc cụ thể cho prompt hoặc cho code.
2. **Ví dụ ở mức cơ chế.** Thứ tự pha trong tick của Nova, vòng đời history và ACK, baseline và despawn của Quark đều đủ chi tiết để một kỹ sư netcode kiểm tra lại lập luận.
3. **Nhận thức luận tự giới hạn.** Tác giả giới hạn phê bình vào Codex v1 (3.6 ¶1), nói bug không chứng minh orchestration gây lỗi (3.4 ¶9), nói survey không kiểm chứng SLP (3.11 ¶3), và nói SLP không phải north star (3.12 ¶1).
4. **Tự cân bằng luận đề.** Bài chống cả hai thái cực: phục tùng brief và tranh biện vô tận. Đề xuất redesign cũng phải qua bốn câu hỏi (3.5 ¶5).
5. **Phản thân.** Chính methodology cũng phải chịu evidence, và ưu tiên cải tiến bằng cách bỏ bớt (3.10).

### 6.2. Giả định ngầm

| Giả định | Vì sao đáng ngờ | Hệ quả nếu sai |
| --- | --- | --- |
| Peer có đủ ngữ cảnh để nhận ra tiền đề sai | Peer chủ đích được giao một task hẹp và một context riêng. Tiền đề sai thường nằm ở ranh giới giữa các task | Phát hiện xuyên module (Quark ¶10–11) vẫn bị bỏ lọt, còn Peer chỉ bắt được lỗi cục bộ |
| Lead đủ trung lập để phân loại phản biện | Lead cũng là một LLM và chính là tác giả của plan. Hiện tượng cái dù áp vào chính Lead: nó có thể pre-solve khi viết brief và bảo vệ plan của mình | Lead lọc mất phản biện đúng, giống main của Codex v2 ở 3.6 ¶3 |
| “Trạng thái chung” do Lead giữ là đáng tin | Với một agent, trạng thái nằm trong context window, có thể bị nén hoặc mất khi agent khởi động lại | Ai làm gì, ai được báo gì bị lệch; invariant một owner không còn được giữ |
| Evidence có thể kiểm bằng máy | Đúng với netcode và benchmark; sai với UI/UX, game feel (tác giả đã loại trừ) | Phạm vi dùng được hẹp hơn cách bài gợi ý |
| Chi phí phối hợp nhỏ hơn lợi ích | Bài không nêu số token hay thời gian nào. Tài liệu agent teams của Claude Code cảnh báo đội agent tốn token nhiều hơn đáng kể so với một session | Không biết điểm hòa vốn của SLP |

### 6.3. Khoảng trống bằng chứng

- **Không có đối chứng.** Không có so sánh cùng task giữa SLP, Codex v1/v2 hay agent teams. Mọi so sánh đều là lời kể của một người thực hành.
- **Ca 47/4 không quy được cho SLP.** Đó là số liệu trước và sau trong một vòng review; bài không nói ai viết bốn test mới, và cũng không nói SLP có dẫn đến việc viết chúng không.
- **Không tái lập được.** Tác giả cố tình không công bố prompt và setup (3.9 ¶2, 3.8 ¶5). Lý do hợp lý (prompt phụ thuộc model và codebase), nhưng người khác không kiểm chứng được kết quả.
- **Nhận định về model là giai thoại.** Overengineering, tìm đường vòng, bẻ mọi luận điểm đều không có số liệu.
- **Không có số liệu outcome.** Bài định nghĩa thước đo “chuỗi thay đổi” (3.10 ¶1) nhưng không báo cáo một giá trị nào của nó.

### 6.4. Rủi ro của chính SLP

- **Lead là nút cổ chai.** Mọi evidence, phân loại, phối hợp và acceptance đều đi qua Lead. Tác giả đã thấy lỗi “Lead ôm quá nhiều trách nhiệm” (3.10 ¶3).
- **Độ trễ escalation.** Mỗi vòng Peer → Lead → Supervisor → Human tốn thời gian thực; bài không bàn Peer làm gì trong lúc chờ.
- **Chất vấn tiền đề thành lối thoát.** Một Peer gặp task khó có thể đề xuất đổi scope thay vì giải nó. Bốn câu hỏi ở 3.5 ¶5 giảm rủi ro này nhưng không loại bỏ nó.
- **Chiều ngược của bất đồng trình diễn là sycophancy.** LLM có xu hướng đồng ý với người giao việc. Chỉ trao “quyền” phản biện có thể không đủ để Peer dám dùng quyền đó, trong khi ép thành “nghĩa vụ” lại gây tranh biện. Bài thừa nhận việc cân chỉnh phải làm thủ công (3.9 ¶11).
- **Phân hoạch ownership thay đổi liên tục.** Invariant một owner cần ranh giới rõ, nhưng phụ thuộc dọc làm ranh giới dịch chuyển khi dependency mới lộ ra (3.11 ¶4).

### 6.5. Câu hỏi mở và một thiết kế thí nghiệm đề xuất

Bài đặt ra các mệnh đề kiểm chứng được. Dưới đây là một thiết kế thí nghiệm tối thiểu để kiểm tra mệnh đề trung tâm: tách quyền chất vấn khỏi quyền sửa giúp phát hiện tiền đề sai mà không gây tranh biện.

1. **Bộ task có tiền đề cài sẵn.** Một nửa số task mang một tiền đề sai đã biết (một “cái dù”, ví dụ “tăng history để xử lý mất gói”); nửa còn lại có tiền đề đúng.
2. **Ba điều kiện:** brief pre-solve (A/X/Y, PASS/FAIL); brief ba phần với quyền chất vấn; và brief ba phần với nghĩa vụ phản biện (“thách thức mọi giả định”).
3. **Đo:** tỷ lệ phát hiện tiền đề sai (true positive); tỷ lệ phản biện vô căn trên task có tiền đề đúng (false positive); tỷ lệ Lead chấp nhận phản biện đúng và bác phản biện sai; tổng token; và chất lượng kết quả bằng test độc lập ở tầng người dùng.
4. **Giả thuyết của bài dự đoán:** điều kiện hai có true positive cao hơn điều kiện một, và false positive thấp hơn điều kiện ba.
5. **Biến cần kiểm soát:** model và effort giống nhau giữa các điều kiện; chạy tuần tự hoặc giữ máy riêng khi đo hiệu năng, đúng theo cảnh báo của chính bài ở 3.9 ¶8.

Các câu hỏi mở khác:

- Ai kiểm tra cách Lead đóng khung task? Trong bài, Supervisor “phát hiện lệch hướng”, nhưng không nói bằng cách nào.
- Có thể tự động phân loại một task là verification hay discovery để chọn kiểu brief không?
- Dùng model khác nhau cho từng vai có giúp giảm điểm mù chung không, như tác giả gợi ý ở 3.11 ¶6?
- Nghiên cứu về tổ chức con người có áp dụng được không: an toàn tâm lý (psychological safety) cho việc lên tiếng, định luật Conway cho quan hệ giữa cấu trúc đội và cấu trúc hệ thống, double-loop learning cho Better-SLP.

## 7. Liên hệ với Seatworks

Seatworks hiện thực gần như mọi mệnh đề của bài, nhiều chỗ gần như dịch nguyên văn sang prompt, luật của desk và mẫu của watch. Nó còn đi xa hơn bài ở ba chỗ: chuyển trạng thái chung từ context của Lead sang sổ sách bền vững của desk; thêm W để theo dõi chính cách Lead viết brief; và biến Better-SLP thành số liệu trên report card. Đối chiếu dưới đây dựa trên mã nguồn repo `sting9k/seatworks` tại thời điểm phân tích.

### 7.1. Từ khái niệm trong bài đến cơ chế trong code

| Khái niệm trong bài | Cơ chế trong Seatworks | Nơi hiện thực | Loại |
| --- | --- | --- | --- |
| Pre-solve (3.3) | Lead không đưa câu trả lời tự tìm vào brief, hỏi câu mở chứ không “A hay B”. Watch hỏi hai mẫu: “A brief that tells the Peer how”, “Offering the Peer a fixed set of options”; desk bắt dạng `brief-prewritten` | `plugin/content/prompts/LEAD.md` (mục Briefs); `plugin/catalog/patterns.json`; `docs/ANTIPATTERNS.md` §Pre-solve delegation | Prompt + watch |
| Brief ba phần (3.9 ¶7) | “Keep apart what must hold, what was chosen and what nobody knows yet”; mỗi lựa chọn ghi ai chọn và vì sao; “A choice written as a constraint becomes a requirement nobody asked for” | `LEAD.md`; README | Prompt |
| Verification và discovery (3.3 ¶5) | Task “settled” khi xây theo contract đã có hay kiểm invariant, nên brief hẹp được; để “open” khi còn phải tìm xem xây gì | `LEAD.md` | Prompt |
| Quyền chất vấn tiền đề (3.3 ¶6) | Peer `ask` trước khi xây khi code trái tiền đề; tiền đề, ràng buộc hay lựa chọn không khớp với evidence thì ghi vào disputes (ask loại challenge). Watch hỏi mẫu “Doing what it thinks is wrong because it was told” | `plugin/content/prompts/PEER.md`; `patterns.json`; `ANTIPATTERNS.md` §Authority gradient | Tool + prompt + watch |
| Gánh nặng chứng minh đối xứng (3.3 ¶12) | “Change the plan when the evidence holds, and keep it only for a reason the Peer can argue with. A plan kept because it exists is how a wrong choice becomes the next task's requirement.” | `LEAD.md` (mục While Peers work) | Prompt |
| Lead phân loại ba nhóm (3.9 ¶6) | “Weigh it as one of three”: đổi quyết định, phương án khác không cần theo, điểm không đáng dừng việc | `LEAD.md` | Prompt |
| Bốn câu hỏi cho đề xuất redesign (3.5 ¶5) | Điều kiện lỗi hiện ra, sửa nhỏ có đủ không, trách nhiệm bị bỏ và được thêm | `LEAD.md` | Prompt |
| Quyền khác nghĩa vụ phản biện (3.9 ¶3–5) | Anti-pattern “Reflexive contrarianism” và “Sycophancy”; desk bắt `rework-unrun` (gửi task trả lại dựa trên một review không chạy gì) | `ANTIPATTERNS.md` | Watch + desk |
| Cái dù, đường vòng (3.2, 3.5) | “Brake Pattern” (`patched-not-fixed`: nhiều lần gửi lại trong một lane), “Balloon Pattern” (mẫu `wrapper`), “Architecture Fog” (mẫu `stand-in`), “Architecture lock-in” (`no-pushback`: lane báo ready sau nhiều task mà không có ask nào) | `ANTIPATTERNS.md`; `patterns.json` | Watch + desk |
| Một owner mỗi phạm vi (3.7 ¶6) | Mỗi task một branch và một copy riêng; các task chạy song song không được giữ cùng path; một writer mỗi copy; git shim chặn pull, checkout, push | `AGENTS.md`; `plugin/bin/git-shim.mjs`; `plugin/server/desk/tasks/add-tasks.ts` | Code (desk) |
| Reviewer biết mình review phiên bản nào (3.7 ¶6) | Reviewer làm trong một copy riêng gắn với commit được review | README; `roles.json` | Code |
| Evidence trên đúng phiên bản được chấp nhận (3.9 ¶1) | Gate chạy khi merge task; khi land lane, desk merge base vào rồi chạy gate trên kết quả. Gate đỏ chỉ giữ lại cho tới khi Lead `accept` kèm lý do | README; `plugin/server/desk/lanes/landing.ts` | Code |
| Can thiệp quay về trạng thái chung (3.7 ¶5) | Supervisor được nói với Peer, nhưng desk luôn báo Lead trước: ràng buộc duy nhất mà plugin áp thay cho khái niệm | `AGENTS.md` (What the plugin may decide) | Code |
| Human biết ràng buộc nào của mình, quyết định nào do agent chọn (3.6 ¶4–5) | Report card đọc từ sổ sách: những gì “decided for you”, từng challenge mà plan được giữ bất chấp và vì sao, lời Human nói với Lead hay Peer và liệu nó có tới được plan không. Human gõ vào chat của Lead hay Peer thì desk báo cho Supervisor | README; `plugin/server/desk/views/report*.ts` | Code |
| Message không phải evidence; giữ máy khi benchmark (3.9 ¶8–10) | Công cụ `machine` và `MachineHold`: khi Peer đo, desk không khởi động gate hay setup nào. Luật thiết kế số 4: “Evidence, not claims” | `plugin/server/desk/machine/`; `AGENTS.md` | Code |
| Better-SLP, telemetry (3.10) | Report card đếm bao nhiêu review đã thay đổi công việc “so one that seldom does can be dropped”, bao nhiêu challenge đã đổi plan, ask theo loại. Luật: bỏ ràng buộc thì xóa nó, không thêm công tắc | README; `AGENTS.md` | Code + quy ước |
| Role là trách nhiệm, không phải persona (3.8) | Role là dữ liệu trong `roles.json` với capability (`supervise`, `lead`, `work`, `write`, `review`, `watched`, `judge`); “Nothing in `server/` compares a role to a name”; thay `roles.json` là có mô hình khác | `plugin/roles.json`; `plugin/server/catalog/kit/roles.ts` | Code (dữ liệu) |
| Các kiểu Peer (3.8 ¶4) | `reviewer`, `architect`, `auditor`, `second-reviewer`; ba vai sau đều `like: reviewer` | `roles.json` | Dữ liệu |
| Đồ thị, không phải cây (3.11 ¶4) | “SLP is a federated governance graph, not a tree” | `AGENTS.md` | Nguyên tắc |
| Dùng primitive của Paseo, không dùng orchestration có sẵn (3.7 ¶1) | Plugin chỉ quyết vòng đời phiên, vận chuyển, định tuyến, thông báo, trạng thái bền vững và nguồn gốc; không bao giờ quyết acceptance | `AGENTS.md` | Kiến trúc |
| Đa model (3.11 ¶6) | Mỗi vai ngồi được trên một trong năm agent (Claude Code, Codex, Pi, Oh My Pi, OpenCode) với model riêng; Second reviewer dùng model khác | README; `roles.json` | Dữ liệu |

### 7.2. Những chỗ Seatworks đi xa hơn bài

1. **Trạng thái chung rời khỏi context của Lead.** Bài để Lead “giữ trạng thái chung của room”. Seatworks để desk giữ sổ sách bền vững (ledger, incident, event log) ngoài repo; Lead vẫn sở hữu lane và acceptance. Điều này trực tiếp giải giả định “trạng thái do Lead giữ là đáng tin” ở 6.2.
2. **W trả lời câu hỏi “ai kiểm tra Lead”.** Bài không có W. Seatworks có watch đọc suy nghĩ, lời và brief của Lead và Peer, hỏi từng mẫu (nhiều mẫu nhắm riêng vào Lead: brief chỉ cách làm, đưa lựa chọn đóng, quyết định kiến trúc bị bỏ khỏi report, review được brief hẹp hơn nghi ngờ của chính Lead) rồi báo Supervisor. Đây là lời đáp cơ giới cho rủi ro “Lead tự pre-solve” ở 6.2.
3. **R tách thành bằng chứng.** Bài coi Reviewer là một kiểu Peer. Seatworks giữ điều đó về cơ chế nhưng nói rõ verdict không quyết định gì; nó là evidence Lead cân nhắc.
4. **Human-in-the-loop là một công tắc** (`hitl.on`). Bài mô tả Human luôn có mặt; Seatworks cho phép Human rời đi, khi đó Supervisor quyết phần còn lại nhưng thay đổi về mục đích lane hay chi phí vượt appetite vẫn thuộc về Human, đúng tiêu chí escalation ở 3.7 ¶4.
5. **Anti-pattern đã thành danh mục.** Các anti-pattern mà bài hẹn viết (nhiều người chỉnh một phanh, thử trên giá, cơ cấu mới giữ lời hứa cũ) đã có dạng tương ứng trong `docs/ANTIPATTERNS.md`: suốt sáu nhóm, từ Architecture đến Harness and planning.

### 7.3. Khoảng cách còn lại

- **Chuỗi thay đổi chưa được truy vết theo từng phát hiện.** Report card đếm tỷ lệ (review đổi công việc, challenge đổi plan), nhưng sáu điểm kiểm ở 3.10 ¶1 (Lead biết gì khi giao, quyết định mới tới những owner nào…) chưa thành một dấu vết liền mạch cho mỗi phát hiện.
- **“Một reviewer phải chứng minh vì sao còn tồn tại”** mới dừng ở số liệu cho Supervisor đọc. Điều này đúng với cảnh báo Goodhart ở 3.10 ¶8: telemetry không tự biến thành luật.
- **Thí nghiệm ở 6.5 chưa có.** Theo quy ước của repo, không được khởi động seat thật để test; một thí nghiệm như vậy cần làm ngoài bộ test, với ngân sách riêng.

## 8. Tài liệu tham khảo

**Bài gốc**

- vhLam, [Bàn về multi-agent orchestration và mô hình SLP](https://vhlam.com/article/agent-orchestration-multi-agent-slp), 27/09/2026. Toàn văn do người dùng cung cấp.

**Nguồn được bài nêu tên**

- Andrew Ng, [Agentic Design Patterns Part 5, Multi-Agent Collaboration](https://www.deeplearning.ai/the-batch/agentic-design-patterns-part-5-multi-agent-collaboration), The Batch, 04/2024. Chưa mở được trang (mạng chặn).
- Yuyuan Feng và cộng sự, [Graph Engineering in the Era of LLM Agents: From Individual Intelligence to System Intelligence](https://arxiv.org/abs/2608.21156), arXiv:2608.21156, 08/2026. Đối chiếu qua [DEEP-JLU/Awesome-Graph-Engineering](https://github.com/DEEP-JLU/Awesome-Graph-Engineering).
- Anthropic, [Orchestrate teams of Claude Code sessions](https://code.claude.com/docs/en/agent-teams). Đã mở.
- Anthropic, [Message your other Claude Code sessions](https://code.claude.com/docs/en/cross-session-messaging). Đã mở.
- OpenAI Codex multi-agent v2: [openai/codex issue #33551](https://github.com/openai/codex/issues/33551). Đã mở; nguồn phụ.
- Epic Games, [Introduction to Iris in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/introduction-to-iris-in-unreal-engine). Chưa mở được trang.
- Unity, [Netcode for Entities](https://docs.unity3d.com/Packages/com.unity.netcode@1.10/manual/index.html). Chưa mở được trang.

**Nguồn bổ sung của bản phân tích**

- Kevin Yang, Dan Klein, Asli Celikyilmaz, Nanyun Peng, Yuandong Tian, [RLCD: Reinforcement Learning from Contrastive Distillation for Language Model Alignment](https://arxiv.org/abs/2307.12950), ICLR 2024; [mã nguồn](https://github.com/facebookresearch/RLCD).
- Chen Qian và cộng sự, [ChatDev: Communicative Agents for Software Development](https://arxiv.org/abs/2307.07924), 2023.
- Sirui Hong và cộng sự, [MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework](https://arxiv.org/abs/2308.00352), 2023.
- Các khái niệm được nhắc đến từ trí nhớ, chưa đối chiếu nguồn trong bản này: double-loop learning (Argyris và Schön), định luật Conway, định luật Goodhart, psychological safety (Edmondson), process tracing.

**Mã nguồn Seatworks được đối chiếu** (repo `sting9k/seatworks`)

- `AGENTS.md`, `README.md`, `docs/ANTIPATTERNS.md`
- `plugin/roles.json`, `plugin/catalog/patterns.json`
- `plugin/content/prompts/LEAD.md`, `PEER.md`, `REVIEWER.md`, `ARCHITECT.md`, `SUPERVISOR.md`
- `plugin/server/desk/desk.ts`, `plugin/server/desk/machine/`, `plugin/server/desk/lanes/landing.ts`, `plugin/server/runtime/runtime.ts`, `plugin/bin/git-shim.mjs`
