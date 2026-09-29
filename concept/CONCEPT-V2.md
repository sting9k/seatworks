# CONCEPT-V2 — Kim chỉ nam SLP cho Seatworks

Sep 28, 2026 · @LONG

CONCEPT-V2 là kim chỉ nam cho plugin, dựng hoàn toàn từ bài "Bàn về multi-agent orchestration và mô hình SLP" của vhLam. Plugin phải được đối chiếu và sửa theo tài liệu này, không phải ngược lại.

## 0. Cách dùng tài liệu

**Nguồn chuẩn duy nhất** là bài SLP của vhLam (27/09/2026), đọc qua bản phân tích "Agent Orchestration & SLP — Phân tích nghiên cứu chi tiết". Mọi luật ở đây trỏ về một đoạn của bài. Thiết kế cũ của plugin không phải nguồn: chỗ nào plugin khác tài liệu này thì plugin sai.

**Ký hiệu.** `A3.3¶12` là bài, mục 3.3, đoạn 12, theo cách đánh số của bản phân tích.

**Loại câu:**

- **Luật:** cấu trúc phải giữ, vi phạm là lỗi.
- **Nguyên tắc:** phán đoán cho prompt và cho người thiết kế, không kiểm bằng máy.
- **Ghi chú:** kinh nghiệm, đánh giá, feedback; không phải luật (§13).

**Đọc theo việc đang làm:**

| Bạn đang làm gì | Đọc |
| --- | --- |
| Thêm hay bỏ một ràng buộc của plugin | §1, §4, §11 |
| Sửa vai, quyền, luồng thông tin | §2, §3, §7 |
| Viết prompt cho Lead, Peer, Supervisor | §5, §6, §12 |
| Sửa review, accept, đo đạc | §8 |
| Thiết kế những gì Human thấy và điều khiển | §9 |
| Số liệu, report, tự cải tiến | §10 |
| So plugin hiện tại (dựng theo V1) với V2 | §15, nhất là 15.12 |

**Giới hạn của nguồn.** Bài là một position essay từ kinh nghiệm thực hành, không có so sánh đối chứng. Bằng chứng định lượng duy nhất là ca Quark: 47 test đều pass, 4 regression test mới đều fail trên code cũ (A3.4¶1). Tác giả cố ý không đưa system prompt nào: cách viết instruction phụ thuộc model, loại việc và độ trưởng thành của codebase, nên ai adapt phải tự thử và chỉnh (A3.9¶2). SLP là một thiết kế đang được kiểm chứng, không phải bộ luật viết xong (A3.10¶3).

## 1. Luận đề và phạm vi

**Luận đề:** nếu agent đang đụng code phát hiện tiền đề sai, phát hiện ấy phải có khả năng thay đổi plan (A3.1¶13). Mục tiêu của orchestration không phải tạo ra càng nhiều phản biện càng tốt, mà là để đúng phản biện đi tới đúng người và thực sự thay đổi công việc khi nó đáng thay đổi (A3.9¶13).

Tác giả muốn một đội agent đủ năng lực làm ra chiếc xe, đủ độc lập để hỏi vì sao nó cần cái dù, và phối hợp đủ tốt để thực sự thay đổi thiết kế (A3.12¶4).

### 1.1 Bài toán SLP giải

SLP sinh ra cho dự án có **phụ thuộc dọc**: slice sau phụ thuộc không chỉ vào code mà cả vào kiến trúc và thiết kế slice trước vừa tạo ra (A3.1¶6). Bắt đầu feature tiếp theo mới lộ ra bốn loại phát hiện, mỗi loại đòi một loại thay đổi:

| Phát hiện | Thay đổi cần có |
| --- | --- |
| API cũ thiếu một khả năng | Mở rộng interface |
| Trách nhiệm đặt sai chỗ | Chuyển trách nhiệm |
| Lifecycle không hỗ trợ yêu cầu mới | Đổi lifecycle |
| Một mechanism trong plan phải hoãn | Sắp lại thứ tự |

Trong đội người, lúc đó người làm quay lại trao đổi với lead, yêu cầu owner module khác thay đổi, thậm chí đề nghị làm lại foundation. **Luật:** agent phải có đủ ba đường quay lại đó (A3.1¶6; A3.3¶15).

Cái orchestration kiểu cũ làm sai: main tự định nghĩa bài toán, chọn giả thuyết, giới hạn phạm vi, quy định cả format câu trả lời. Sub chỉ còn cố hoàn thành task trong cái khung đó, kể cả khi khung bảo nó xây tiếp trên một quyết định sai (A3.1¶7). Các đội agent mạnh khi đó chỉ giúp cả đội đi xa hơn trên cùng một quyết định sai (A3.2¶6).

### 1.2 Khi nào dùng, khi nào không

**Dùng SLP** khi việc đủ lớn để chạm nhiều module, có phụ thuộc dọc, và có tiêu chí chấp nhận kiểm được bằng máy như test, benchmark (A3.1¶3, ¶6).

**Không dùng SLP** khi:

- Thay đổi nhỏ: một agent làm từ đầu tới cuối có thể tốt hơn cả một room (A3.12¶2).
- Web service vài trăm API CRUD, lifecycle đã rõ, các phần độc lập và chia ngang được: "main chia task, sub implement, gom kết quả" chạy tốt, nhiều khi main tự làm tuần tự cũng xong (A3.1¶5).
- Việc cần feedback liên tục từ Human như game feel, combat feel, UI/UX (A3.12¶2).

**Nguyên tắc.** SLP là phương pháp có chủ kiến, hình thành quanh một loại dự án, workflow và thói quen cụ thể (A3.1¶0). Nó không phải north star cho mọi team dùng AI (A3.12¶1). Plugin vì vậy không được ép SLP lên mọi việc: một việc nhỏ phải chạy được bằng một agent.

## 2. SLP là đồ thị, không phải cây

SLP là một đồ thị thẩm quyền, không phải cây mệnh lệnh: mỗi vai giữ một trục quyết định riêng, không vai nào chứa vai kia, và điểm hội tụ là trạng thái chung do Lead giữ (A3.7¶2–3; A3.11¶4).

&#91;embedded content: SLP theo bài · 4 vai, 4 kiểu Peer, 1 trạng thái chung, nền Paseo\]

Đường nét đứt là đường tắt duy nhất: Supervisor và Human được nói thẳng với Peer, nhưng can thiệp làm đổi hướng phải quay về trạng thái chung mà Lead quản lý (A3.7¶5).

### 2.1 Hai tầng: cơ chế và tổ chức

**Luật.** Paseo cung cấp cơ chế: duy trì room, session và truyền message. SLP là cách tổ chức công việc trên các primitive đó, và không dùng các orchestration skill Paseo đưa sẵn (A3.7¶1). SLP trên Paseo còn cho mỗi vai ngồi trên một model khác, để phối hợp điểm mạnh của từng model (A3.11¶6).

### 2.2 Năm loại quan hệ

Một sơ đồ cây chỉ cho biết ai spawn ai. Công việc thật còn cần bốn quan hệ khác, không nhất thiết trùng với quan hệ cha–con giữa session (A3.11¶4):

| Quan hệ | Câu hỏi nó trả lời |
| --- | --- |
| Spawn | Ai tạo ra ai |
| Ownership | Ai sở hữu module nào |
| Phụ thuộc dữ liệu | Ai cần dữ liệu của ai |
| Quyền sửa quyết định | Ai có quyền sửa quyết định nào |
| Nghĩa vụ thông báo | Ai phải được thông báo |

**Luật.** Các quan hệ này thay đổi khi feature sau làm lộ một dependency chưa biết (A3.11¶4). Chúng phải được ghi và cập nhật được, không suy ra từ cây spawn.

### 2.3 Cạnh không phải quyền

**Luật.** Có thêm cạnh trên đồ thị chưa bảo đảm quyết định tốt hơn. Nếu mọi message vẫn xoay quanh việc làm cái dù nhẹ hơn, một đội giao tiếp rất sôi nổi vẫn có thể bỏ qua bộ phanh. Cái cần là bằng chứng đi tới đúng người, và người đó có quyền thay đổi quyết định (A3.11¶6).

Các mô hình khác chủ yếu giải bài toán kênh (ai nói được với ai). SLP giải bài toán thẩm quyền và nguồn gốc: ai được đổi quyết định nào, và mỗi ràng buộc đến từ đâu.

## 3. Vai là trách nhiệm, không phải persona

Role trong SLP mô tả trách nhiệm vận hành và quyền hạn, không mô tả tính cách. Supervisor, Lead, Peer không phải ba personality prompt kiểu "bạn là một kiến trúc sư khó tính" hay "hãy hành xử như engineering manager" (A3.8¶2). SLP là mô hình tổ chức công việc và trao đổi, không diễn lại sơ đồ tổ chức của con người (A3.8¶6).

### 3.1 Bảng vai

| Vai | Trách nhiệm (A3.7¶3) | Định nghĩa vận hành: vai này phải trả lời được (A3.8¶3) |
| --- | --- | --- |
| Human | Giữ mục tiêu, ưu tiên và những đánh đổi thuộc quyền mình; có đường tiếp cận và sửa hướng công việc | — |
| Supervisor | Trao đổi với Human về kiến trúc và hướng đi; theo dõi vấn đề xuyên phạm vi; phát hiện lệch hướng và can thiệp trong quyền được giao | Quan sát những vấn đề xuyên phạm vi nào; lúc nào nên can thiệp; quyết định nào phải đưa lại cho Human |
| Lead | Giữ trạng thái chung của room; phân chia ownership; xử lý dependency; đánh giá evidence; chịu trách nhiệm integration và acceptance | Giữ trạng thái chung nào; được quyết định điều gì; khi nào phải escalate |
| Peer | Chịu trách nhiệm chuyên môn cho việc được giao; điều tra, thiết kế, implement hoặc review; được chất vấn tiền đề và đề nghị thay đổi phạm vi | Sở hữu phạm vi nào; được sửa gì; được chất vấn những giả định nào; phải trả evidence về đâu |

**Luật.** Hai nhu cầu phải có cùng lúc: một người giữ trạng thái chung và chịu trách nhiệm tích hợp, và người trực tiếp làm sở hữu cả phán đoán kỹ thuật trong phạm vi của mình. Giao một module nhưng giữ toàn bộ quyền suy nghĩ ở trên thì không thể có góc nhìn độc lập (A3.7¶2).

**Luật.** Tiêu chí escalate lên Human: thay đổi tác động tới mục tiêu hoặc chi phí mà Human chưa chấp thuận. Supervisor là người đưa quyết định đó về Human; mọi thứ khác được giải bên dưới (A3.7¶4).

### 3.2 Các kiểu Peer

Peer là một lớp năng lực, không phải một chức danh. Lead tạo Peer theo loại việc (A3.8¶4):

| Kiểu Peer | Lead tạo khi cần |
| --- | --- |
| Implementer | Làm một phạm vi: điều tra, thiết kế, implement |
| Reviewer | Review một phiên bản xác định của việc |
| System Architect | Hỏi ý kiến về một quyết định design khó |
| Auditor | Điều tra chất lượng TDD và các e2e proof |

**Luật.** Reviewer là một kiểu Peer, do Lead tạo và trả về Lead. Verdict của nó là evidence Lead đánh giá, vì đánh giá evidence và acceptance là của Lead (A3.7¶3).

### 3.3 Phép thử đổi tên

**Luật.** Bỏ tên Supervisor, Lead, Peer, thay bằng bất kỳ tên nào (ví dụ "DCM"), mà phạm vi trách nhiệm, luồng thông tin, quyền hạn và escalation path vẫn giữ nguyên, thì SLP vẫn hoạt động như cũ (A3.8¶5).

Ngược lại, ba agent có system prompt mô tả chức danh rất chi tiết nhưng cùng đọc một context, cùng được sửa mọi file, cùng có quyền đổi plan và không ai chịu trách nhiệm integration thì không phải SLP, chỉ là "3 agent đang role-play một engineering team" (A3.8¶5). Từ đó ra bốn điều kiện cần; thiếu một là không còn SLP:

1. Context tách biệt giữa các agent.
2. Quyền sửa tách biệt.
3. Quyền đổi plan không chia đều cho tất cả.
4. Có người chịu trách nhiệm integration.

**Hệ quả cho plugin.** Plugin không được gắn hành vi vào tên vai. Nó gắn hành vi vào thuộc tính vận hành (phạm vi, quyền sửa, luồng thông tin, đường escalate), để đổi tên hay đổi cách sắp xếp vai không cần sửa code.

## 4. Sở hữu

Quyền sửa hẹp, quyền chất vấn rộng: mỗi phạm vi một owner được ghi, nhưng ai cũng được đọc và nêu vấn đề. Đây là nguyên tắc giữ an toàn khi ghi mà không đánh đổi tính độc lập khi nghĩ (A3.3¶6).

### 4.1 Hai nghĩa của ownership

| Khái niệm | Câu hỏi | Thuộc về |
| --- | --- | --- |
| Agent ownership | Mỗi phạm vi có một agent nào chịu trách nhiệm chính và nắm quyền chỉnh sửa? | Tổ chức đội agent |
| State ownership | State này do thành phần nào quản lý? | Thiết kế phần mềm đang được xây |

Nguồn: A3.1¶4. SLP là lời giải cho agent ownership. Các lỗi Quark (§8.1) là lỗi state ownership: chúng chỉ lộ ra khi người làm được quyền chất vấn thiết kế.

### 4.2 Bốn invariant vận hành

**Luật.** Một phạm vi đang thay đổi có một owner cho tới khi bàn giao rõ ràng (A3.7¶6). Từ đó:

1. **Một writer mỗi phạm vi** cho tới khi bàn giao rõ ràng.
2. **Người giao việc không làm song song cùng phạm vi.** Lead không vừa giao Peer sửa phanh vừa tự chỉnh cùng bộ phanh để "hỗ trợ".
3. **Review gắn với một phiên bản xác định.** Reviewer phải biết mình đang review phiên bản nào.
4. **Quyền yêu cầu khác quyền ghi đè.** Peer phát hiện vấn đề ở khung xe có quyền yêu cầu sửa, nhưng không tự nhiên có quyền ghi đè công việc của owner khung.

Cả bốn là loại luật máy kiểm được, không cần phán đoán.

### 4.3 Quyền sửa và quyền chất vấn

**Luật.** Giới hạn quyền sửa và giới hạn quyền chất vấn là hai việc khác nhau. Agent chịu trách nhiệm bộ phanh không được tự ý cắt khung xe của người khác. Nhưng nó vẫn phải được đọc thiết kế khung và báo rằng vị trí bắt phanh hiện tại không chịu được lực cần thiết (A3.3¶6).

**Hệ quả cho plugin.** Ràng buộc về quyền ghi được phép chặt. Ràng buộc về quyền đọc và quyền nói thì không: một Peer phải đọc được code ngoài phạm vi của nó và gửi được yêu cầu tới owner liên quan, qua Lead.

### 4.4 Độc lập và phối hợp

**Nguyên tắc.** Độc lập trong phán đoán cần đi cùng trách nhiệm phối hợp. Nếu mọi agent đều tự mở scope và tự sửa mọi thứ, chiếc xe sẽ có rất nhiều người cầm cờ lê chọc ngoáy và không ai biết hình dạng cuối cùng của nó (A3.7¶7). Lời giải là 4.3: độc lập về tiếng nói, phối hợp về quyền ghi.

### 4.5 Bài học state ownership từ Quark

**Nguyên tắc.** Dữ liệu phục vụ hiệu năng có thể bị dọn; dữ liệu ghi một cam kết chưa hoàn thành thì không. Hai thứ liên quan với nhau nhưng không thể mặc nhiên có cùng vòng đời (A3.4¶5, ¶7). Nguyên tắc này áp cho code mà Peer viết, và cho chính sổ sách mà plugin giữ: một việc dọn dẹp không được xoá mất một nghĩa vụ còn nợ ai đó.

## 5. Plan và brief

Plan là một tập giả thuyết, không phải đặc tả. Brief phải tách điều bắt buộc khỏi điều chỉ là lựa chọn hiện tại, để người nhận biết mình được hỏi lại điều gì.

### 5.1 Plan không thể hoàn hảo trước khi code

**Nguyên tắc.** Trước khi code, nhiều thứ vẫn chỉ là giả định: thư viện có hỗ trợ thứ mình cần không, hai module ghép lại có chạy đúng không, cách đồng bộ đã chọn có quá chậm không. Đọc source, làm prototype và chạy thử trả lời những câu đó, và đôi khi câu trả lời buộc đổi thiết kế (A3.3¶9).

- Không thể vừa yêu cầu người implement tìm ra điều chưa biết, vừa coi mọi phát hiện làm đổi plan là lỗi của planning (A3.3¶9).
- Bắt main hoạch định hoàn hảo mọi trách nhiệm, phụ thuộc, vòng đời dữ liệu và tình huống lỗi ngay từ đầu gần như là bắt nó implement cả hệ thống trong file plan (A3.3¶11).
- Vẽ đủ các thành phần trên sơ đồ chưa bảo đảm chúng phối hợp đúng khi chạy (A3.3¶10). Ca Nova: đã tính trước Edge Layer, nhưng đặt bước nhận dữ liệu sau simulation vẫn tạo thêm một tick trễ ngay trong vòng chạy (A3.1¶11).
- Có những lỗi đáng lẽ phải bắt từ lúc planning; nhưng cho rằng plan đủ tốt sẽ khiến implement luôn trơn tru là một kỳ vọng ngây thơ (A3.3¶8).

### 5.2 Plan bốn phần

**Luật.** Plan nói rõ bốn thứ (A3.3¶12):

1. Mục tiêu.
2. Những giới hạn phải giữ.
3. Những điều còn chưa chắc.
4. Cách kiểm chứng chúng.

**Luật.** Khi người làm feature sau phát hiện thiết kế trước không đáp ứng được, họ phải có đường quay lại: trao đổi, yêu cầu sửa module liên quan, đổi thứ tự triển khai, thay dependency hoặc hoãn một mechanism (A3.3¶12, ¶15). Một plan tốt vẫn có thể phải sửa nhiều lần (A3.3¶14).

### 5.3 Brief ba phần

**Luật.** Brief phân biệt rõ (A3.9¶7):

| Phần | Ví dụ xe đạp | Peer được chất vấn không |
| --- | --- | --- |
| Mục tiêu | Xe nhẹ hơn, dừng tốt hơn | Không cần hỏi lại |
| Constraint thực sự bắt buộc | Xe phải dừng được trong điều kiện X | Được, khi evidence nói nó không giữ được |
| Lựa chọn thiết kế hiện đang dùng | Đang dùng dù để giảm tốc | Được, và phải biết là mình được |

"Xe phải dùng dù để dừng" chỉ là requirement nếu đang thực sự làm một thí nghiệm về dù. Nếu cái dù chỉ là phương án agent trước nghĩ ra, Peer sau phải biết nó được phép đặt câu hỏi về cái dù (A3.9¶7). Brief ba phần gắn nhãn nguồn gốc cho mỗi dòng: đây là mục tiêu, đây là ràng buộc thật, đây chỉ là lựa chọn hiện tại.

### 5.4 Verification và discovery

**Luật.** Hai loại việc không được giao theo cùng một kiểu (A3.3¶5):

| Loại việc | Khi nào | Brief |
| --- | --- | --- |
| Verification | Kiểm một invariant, hoặc implement một contract đã xác lập | Hẹp được, và hữu ích |
| Discovery | Còn phải tìm xem xây gì; giả thuyết còn mở | Phải cho quyền mở lại giả thuyết |

Nếu hai loại được giao cùng một kiểu, sự gọn gàng của task sẽ che mất phần thiết kế chưa được giải quyết (A3.3¶5).

### 5.5 Pre-solve

**Định nghĩa.** Main định nghĩa bài toán, dựng giả thuyết, chọn tiêu chí, giới hạn phạm vi, rồi gọi thêm một agent đến xử lý phần còn lại. Trường hợp cực đoan, sub gần như thành một hàm `f(x) -> confirm / reject` (A3.3¶3).

Mẫu brief pre-solve (A3.3¶1): "Kiểm tra xem phương án A có đúng không. Tập trung vào khía cạnh X, không bàn lại khía cạnh Y. Trả lời PASS/FAIL và tối đa 5 bullet." Mỗi vế khoá một thứ:

| Vế | Khoá gì |
| --- | --- |
| "Phương án A" | A đã là phương án trung tâm |
| "Tập trung vào X" | X đã là tiêu chí chính |
| "Không bàn lại Y" | Y được miễn xét lại |
| "PASS/FAIL, 5 bullet" | Câu trả lời phải hội tụ nhanh |

Sub có thể rất giỏi tìm lỗi trong A, nhưng không còn nhiều không gian để hỏi liệu A có phải thứ cần xây hay không (A3.3¶2). Một chuyên gia về phanh nhận brief "đánh giá vật liệu dù, không thay đổi cơ chế giảm tốc" cũng bị kéo thành chuyên gia làm nhẹ cái dù (A3.3¶4). Nghịch lý: sub cùng model, cùng effort với main nhưng bị dùng như "một Jev đắt tiền để chấm điểm cái dù" (A3.3¶16).

### 5.6 Giao triệu chứng, không giao nguyên nhân

**Nguyên tắc.** Nếu brief đã chốt nguyên nhân ("tăng history để xử lý mất gói"), agent nhận việc rất dễ tối ưu theo hướng đó. Nếu nó được giao điều tra vì sao client không về đúng state và được mở lại các giả định liên quan, cơ hội tìm ra vấn đề gốc sẽ khác (A3.4¶9).

### 5.7 Dịch phản hồi đúng tầng

**Nguyên tắc.** Phản hồi của Human nằm ở tầng mục tiêu ("xe nặng", "dừng chậm"). Khi được dịch thành task ở tầng giải pháp ("làm nhẹ dù", "tăng diện tích dù"), mục tiêu của Human bị thu hẹp thành việc tối ưu phương án agent đã chọn (A3.2¶3, ¶5). Khi giao lại việc sau phản hồi, giữ phản hồi ở tầng mục tiêu.

## 6. Phản biện

Một cuộc phản biện phải thực sự đưa ra một outcome hữu ích: nó đi đủ từ phát hiện tới quyết định, và kết thúc bằng evidence mới trên đúng phiên bản sẽ được chấp nhận (A3.9¶1).

### 6.1 Vòng đời của một phát hiện

**Luật.** Một phát hiện đi qua sáu bước:

1. Peer phát hiện tiền đề sai khi đọc code, viết test hay đo đạc. Brief ba phần cho biết điều đó thuộc mục tiêu, ràng buộc hay chỉ là lựa chọn hiện tại (A3.9¶7).
2. Peer gửi evidence cho Lead: test tái hiện hoặc số liệu cụ thể. Peer không sửa phạm vi của owner khác (A3.9¶1; A3.7¶6).
3. Lead xét evidence, đối chiếu với mục tiêu và constraint, phân loại theo 6.3. Với đề xuất redesign, Lead hỏi bốn câu ở 6.5.
4. Lead phối hợp với owner liên quan, điều chỉnh công việc và cập nhật trạng thái chung. Nếu thay đổi chạm mục tiêu hoặc chi phí chưa được duyệt, Supervisor đưa về Human (A3.7¶4).
5. Sau khi sửa, evidence mới phải chứng minh vấn đề đã được xử lý trên chính trạng thái code sẽ được chấp nhận (A3.9¶1).
6. Chuỗi thay đổi được ghi lại để Better-SLP xét phát hiện có thực sự đổi kết quả không (A3.10¶1; §10).

### 6.2 Quyền phản biện không phải nghĩa vụ phản biện

**Nguyên tắc.** Đừng biến quyền phản biện thành nghĩa vụ phải phản biện (A3.9¶3).

- **Cơ chế hỏng:** prompt liên tục nhấn "hãy tìm lỗ hổng", "hãy thách thức mọi giả định", "đừng tin Lead" thì agent học ra hành vi khác: muốn chứng minh mình làm tốt vai trò thì phải tìm ra thứ để phản đối (A3.9¶4).
- **Model mạnh làm nó rõ hơn:** một thiết kế đang ổn luôn có thể bị nhìn từ bốn góc: một giả định khác, một failure mode hiếm, một abstraction "sạch" hơn, hoặc một kiến trúc tổng quát trông elegant hơn mà không ai cần (A3.9¶4).
- **Giá:** khi đó ta không còn trả token để tìm lỗi đáng sửa, mà đang trả token để thưởng cho sự tranh biện (A3.9¶5).
- **Vị thế đúng:** Peer không cần chứng minh Lead sai; nó cần có quyền nói Lead sai khi evidence buộc phải nói như vậy. Lead cũng không cần bảo vệ plan (A3.9¶6).

### 6.3 Lead phân loại ba nhóm

**Luật.** Lead phân biệt (A3.9¶6):

| Nhóm | Lead làm gì |
| --- | --- |
| Phát hiện làm thay đổi quyết định | Đổi plan, phối hợp owner, cập nhật trạng thái chung |
| Một phương án khác cũng hợp lý | Giữ plan, ghi lý do; một phương án ngang giá không đủ để đổi |
| Tranh luận không đủ giá trị để gián đoạn công việc | Không dừng việc |

### 6.4 Gánh nặng chứng minh đối xứng

**Luật.** "Việc sửa plan cần có căn cứ, nhưng giữ nguyên plan cũng phải có lý do" (A3.3¶12). Plan không được mặc định là đúng cho tới khi bị chứng minh sai. Khi Lead giữ plan trước một phản biện, lý do phải được nói ra để người phản biện cãi lại được.

**Luật.** Phát hiện từ người đang làm phải có thể khiến cả đội sửa hướng, thay vì bị ép thành một workaround để bảo vệ plan cũ (A3.3¶14). Nếu chạy thử mới thấy cơ chế giảm tốc không đáp ứng yêu cầu, người làm phải được xét lại lựa chọn cái dù, không chỉ được tăng kích thước dù (A3.3¶13).

### 6.5 Bốn câu hỏi cho một đề xuất redesign

**Luật.** Câu "cần redesign" cũng phải chịu chất vấn: agent có thể overengineering ngay trong phương án thay cái dù (A3.5¶5). Người nhận đề xuất hỏi:

1. Lỗi xảy ra ở điều kiện nào?
2. Sửa nhỏ có đủ không?
3. Phương án mới bỏ được trách nhiệm nào?
4. Phương án mới tạo thêm trách nhiệm nào?

Phản kháng có ích khi nó giúp đội ra quyết định tốt hơn (A3.5¶5).

### 6.6 Quyền phản kháng đúng thời điểm

**Nguyên tắc.** Model càng mạnh càng giỏi tìm đường vòng: viết hàng nghìn, thậm chí hàng chục nghìn dòng code để ép mọi thứ chạy đúng expectation. Nếu task chỉ yêu cầu giữ quyết định cũ và hoàn thành feature mới, năng lực ấy bị dùng để bảo vệ chính quyết định cần thay đổi (A3.5¶1).

Quyền phản kháng có giá trị đúng ở thời điểm đó: agent phải được chỉ ra rằng phương tiện đang không phù hợp với mục tiêu, trình bày bằng chứng, đề nghị đổi thiết kế hoặc mở lại scope (A3.5¶4). Đưa nó hai cái bánh xe rồi bảo muốn tới đảo Guam, một kỹ sư độc lập phải hỏi lại: tại sao phải dùng hai cái bánh này, mình đang cần một con thuyền mà (A3.5¶3).

### 6.7 Chỉnh hai chiều

**Nguyên tắc.** Bắt đầu đơn giản, dùng trong công việc thật rồi tinh chỉnh (A3.9¶11):

- Thấy agent chỉ biết làm theo thì mở thêm không gian chất vấn.
- Thấy chúng tranh luận mọi thứ thì chỉnh instruction để phản biện phải gắn với một vấn đề cụ thể và một quyết định đáng xem xét.
- Không dựng sẵn cả một bộ máy điều phối chỉ vì trên giấy nó trông đầy đủ.

Hai thái cực cần tránh: một đội agent phục tùng mọi brief, và một đội mà agent nào cũng muốn chứng minh mình có tư duy độc lập, cả đội chìm trong phản biện chồng chéo (A3.9¶12).

## 7. Supervisor và can thiệp

Supervisor giữ tầm nhìn xuyên phạm vi: trao đổi với Human về kiến trúc và hướng đi, theo dõi vấn đề xuyên phạm vi, phát hiện lệch hướng và can thiệp trong quyền được giao (A3.7¶3).

### 7.1 Ba câu hỏi định nghĩa Supervisor

**Luật.** Vai Supervisor được định nghĩa bằng ba câu trả lời (A3.8¶3):

1. Quan sát những vấn đề xuyên phạm vi nào?
2. Lúc nào nên can thiệp?
3. Quyết định nào phải đưa lại cho Human?

### 7.2 Đường tắt tới Peer

**Luật.** Supervisor có thể nói trực tiếp với Peer khi cần, và Human cũng được tiếp cận agent đang thực hiện. Nhưng can thiệp làm đổi hướng phải quay về trạng thái chung mà Lead quản lý (A3.7¶5).

Lý do không phải tôn ti trật tự, mà là chống conflict: nếu một người được bảo giữ dù, người khác được bảo tháo dù, còn Lead không biết gì, thì chỉ vừa tạo thêm một nguồn conflict (A3.7¶5).

### 7.3 Escalation

**Luật.** Supervisor đưa về Human mọi thay đổi tác động tới mục tiêu hoặc chi phí mà Human chưa chấp thuận (A3.7¶4). Mọi thứ khác được giải ở Lead và Peer.

Ví dụ cái dù đi qua SLP (A3.7¶4): Peer phụ trách giảm tốc báo cái dù là lựa chọn không phù hợp. Lead xét bằng chứng và phối hợp với owner khung xe nếu cần gắn bộ phanh. Nếu thay đổi tác động tới mục tiêu hoặc chi phí chưa được chấp thuận, Supervisor đưa quyết định đó về Human.

### 7.4 Phối hợp xuyên workspace

**Nguyên tắc.** Một Supervisor có góc nhìn xuyên các project dùng được cho việc rất thực dụng: ai đang giữ máy để benchmark, tiến trình nặng nào phải dừng, khi nào người khác được chạy lại (A3.9¶10). Nhưng một message "tôi sẽ nhường CPU" chưa phải evidence rằng CPU thực sự đã rảnh; cuối cùng vẫn phải kiểm trạng thái thật (§8.4).

### 7.5 Những lỗi Supervisor tác giả đã gặp

**Ghi chú.** Supervisor can thiệp quá muộn (A3.10¶3). Supervisor cứ phải cứu những quyết định lẽ ra Lead tự xử lý được: triệu chứng của ranh giới giữa hai vai bị vẽ sai (A3.10¶6). Có loại task vốn không cần Supervisor tham gia (A3.10¶5).

## 8. Bằng chứng

Test xanh chưa chứng minh thiết kế đúng, và một lời hứa của agent chưa phải trạng thái thật. Evidence chỉ có giá trị khi đúng phiên bản, đúng điều kiện đo, và trả lời yêu cầu ở tầng người dùng.

### 8.1 Test xanh chỉ chứng minh cái dù bung được

Ca Quark (A3.4¶1): trong vòng review trước một đợt rework, cả **47** test Rust ban đầu đều pass. Bổ sung **4** regression test cho những tình huống bị bỏ sót thì cả 4 đều fail trên code cũ. Bộ test ban đầu chưa chạm tới những tình huống làm giả định của thiết kế không còn đúng.

| Lỗi | Chuyện gì xảy ra | Cách vá sai | Cách sửa đúng |
| --- | --- | --- | --- |
| Lệch state khi mất ACK (A3.4¶2–5) | Client ở B, server quay về A; packet chứa B rời khỏi history 128, server tưởng không còn gì cần đồng bộ và ngừng gửi correction | Tăng history từ 128 lên số lớn hơn: chỉ đẩy lỗi ra xa và tốn bộ nhớ | Giữ thông tin về state transition cần xác nhận cho tới khi có ACK bao phủ nó |
| Entity ma (A3.4¶6–7) | Entity rời vùng quan tâm, server cần gửi despawn, nhưng reset baseline xoá luôn thông tin client có thể đang giữ entity đó | — | Giữ trạng thái chuyển tiếp của entity độc lập với ACK cache |

Hai lỗi chung một gốc: gộp cache (thu hồi được) với nghĩa vụ (không được thu hồi). Tác giả tự nói rõ giới hạn: những bug này chưa chứng minh orchestration gây ra lỗi; chúng cho thấy loại phát hiện mà orchestration phải có khả năng tiếp nhận và biến thành thay đổi thiết kế (A3.4¶9).

**Luật.** "Done" của một task không phải là bằng chứng thiết kế đúng. Acceptance phải để chỗ cho phát hiện làm đổi nền trước khi feature tiếp tục (A3.4¶8).

### 8.2 Xanh cục bộ, đỏ toàn cục

**Nguyên tắc.** Clock, input, prediction và replication có thể mỗi phần pass test riêng mà vẫn phối hợp sai nếu chúng không thống nhất cách hiểu thời gian và state: input này thuộc tick nào, prediction chạy trước server bao xa, snapshot mô tả state ở thời điểm nào, client dùng nó để sửa phần dự đoán nào (A3.4¶10–11). Thêm feature vào từng module không tự giải quyết sự lệch đó.

**Luật.** Phải có người nhìn xuyên ranh giới task để chỉ ra vấn đề, và có đường trao đổi với các owner liên quan để sửa. Nếu ai cũng chỉ được chứng minh phần mình đã pass, cả đội có thể kiểm cái dù rất kỹ mà vẫn bỏ sót câu hỏi chiếc xe có thực sự dừng được không (A3.4¶12–13). Trách nhiệm đó thuộc Lead (integration, acceptance), với Auditor khi cần soi TDD và e2e proof.

### 8.3 Evidence trên đúng phiên bản

**Luật.** Evidence phải chứng minh vấn đề đã được xử lý trên chính trạng thái code sẽ được chấp nhận (A3.9¶1). Reviewer phải biết mình đang review phiên bản nào (A3.7¶6). Test chạy trên một phiên bản rồi chấp nhận một phiên bản khác là không có evidence.

### 8.4 Tính hợp lệ của phép đo

**Luật.** Lượt đo trước và sau phải chạy trong điều kiện so sánh được (A3.9¶8). Ba tình huống phá hỏng phép đo:

- Hai agent cùng chiếm CPU.
- Một agent compile project khác trong lúc agent kia benchmark.
- Workload bị sửa giữa hai lượt đo.

Khi đó con số vẫn hoàn toàn "thật" nhưng kết luận từ chúng không còn đáng tin. Một người đang đo sức đạp, người khác chạy phía sau đẩy xe: đồng hồ không nói dối, nhưng điều kiện thí nghiệm đã đổi (A3.9¶9). Trong một đội agent chạy song song, tài nguyên máy dùng chung là biến gây nhiễu mặc định.

### 8.5 Message không phải evidence

**Luật.** Lời hứa của agent về trạng thái thế giới phải được kiểm bằng trạng thái thật. "Tôi sẽ nhường CPU" chưa phải evidence rằng CPU đã rảnh (A3.9¶10). Cũng vậy, một agent nói "xong" là một lời tuyên bố cần kiểm.

## 9. Human

Human giữ mục tiêu, ưu tiên và những đánh đổi thuộc quyền mình, và phải có đường tiếp cận, sửa hướng công việc (A3.7¶3). Có kênh message hai chiều chưa giải quyết chuyện Human kiểm soát đội agent như thế nào (A3.6¶2).

### 9.1 Main là một bộ lọc có mất mát

**Nguyên tắc.** Khi mọi thông tin tới Human đều đi qua một agent tổng hợp, agent đó có thể chọn ngữ cảnh truyền xuống, biến yêu cầu "xe nhẹ hơn" thành task "làm nhẹ dù", rồi chỉ báo lại đội đã giảm được bao nhiêu gram. Sub có thể từng hỏi về bộ phanh, nhưng câu hỏi ấy bị bỏ qua khi tổng hợp, và Human chỉ thấy một tiến trình tối ưu cái dù rất hiệu quả (A3.6¶3). Đây là lý do cần một bản ghi chung độc lập với người tổng hợp.

### 9.2 Bốn thứ Human cần biết

**Luật.** Human phải biết được (A3.6¶4):

1. Agent đang làm theo brief nào.
2. Constraint nào thực sự đến từ Human.
3. Quyết định nào do agent tự chọn.
4. Bất đồng nào còn chưa được giải quyết.

Cả bốn là dữ liệu ghi được bằng máy: phiên bản brief, nguồn gốc từng ràng buộc, tác giả từng quyết định, danh sách bất đồng còn mở.

**Luật.** Khi Human sửa hướng, thay đổi ấy phải tới được người đang thực hiện và cập nhật vào kế hoạch chung (A3.6¶4).

### 9.3 Giám sát khác kiểm soát

**Luật.** Đọc được transcript giúp giám sát, nhưng chưa phải kiểm soát. Kiểm soát thực tế đòi hai thứ (A3.6¶5):

- Biết sự can thiệp đã làm thay đổi công việc hay chưa.
- Được chủ động steering khi cần.

**Nguyên tắc.** Hai cực cần tránh: Human thành dispatcher duyệt từng method, và giao việc đồng nghĩa với mất đường tiếp cận agent đang implement (A3.6¶5). SLP đứng giữa hai cực này.

### 9.4 Human tiếp cận trực tiếp

**Luật.** Human được nói thẳng với agent đang thực hiện, cùng điều kiện với Supervisor: can thiệp làm đổi hướng phải quay về trạng thái chung của Lead (A3.7¶5).

## 10. Better-SLP

SLP tự áp nguyên tắc của nó lên chính nó: nếu agent không được bảo vệ một thiết kế chỉ vì nó đang tồn tại, thì phương pháp orchestration cũng không được miễn nguyên tắc đó (A3.10¶2). Better-SLP là framework để quan sát, sửa và đơn giản hoá SLP từ failure mode thật (A3.10¶4).

### 10.1 Thước đo: chuỗi thay đổi

**Luật.** Orchestration được đánh giá bằng chuỗi thay đổi, không bằng số lần agent phản biện nhau hay số lần plan bị đổi (A3.10¶1). Sáu điểm kiểm:

1. Lead biết gì khi giao việc?
2. Lead có can thiệp đúng lúc không?
3. Peer phát hiện thêm điều gì?
4. Evidence ấy có đủ để sửa nhận định không?
5. Quyết định mới được truyền tới những owner nào?
6. Kết quả cuối cùng đã thay đổi ra sao?

### 10.2 Bảng chẩn đoán

| Triệu chứng | Chỗ hỏng khả dĩ | Hướng xử lý |
| --- | --- | --- |
| Peer liên tục escalate cùng một loại vấn đề | Instruction của Lead | Sửa instruction của Lead |
| Lead luôn phải đọc lại toàn bộ transcript mới hiểu Peer nói gì | Protocol báo cáo thiếu context | Sửa định dạng báo cáo |
| Supervisor cứ phải cứu những quyết định lẽ ra Lead tự xử lý được | Ranh giới giữa hai vai sai | Vẽ lại ranh giới |
| Một reviewer peer hiếm khi thay đổi kết quả nhưng luôn tốn nhiều token | Reviewer đó không tạo giá trị | Reviewer phải chứng minh vì sao còn tồn tại; không chứng minh được thì bỏ |

Nguồn: A3.10¶6.

### 10.3 Telemetry

**Luật.** SLP tự cải tiến từ telemetry của chính quá trình làm việc, gồm năm tín hiệu (A3.10¶7):

| Tín hiệu | Đo hiệu quả của |
| --- | --- |
| Conflict nào lặp lại | Phân chia ownership |
| Escalation nào thực sự dẫn tới thay đổi | Kênh escalation |
| Review nào bắt được lỗi có giá trị | Từng Reviewer |
| Intervention nào đến quá muộn | Supervisor |
| Ceremony nào chỉ tạo thêm "traffic rác ngốn token" | Quy trình |

Mỗi tín hiệu là một tỷ lệ đo hiệu quả của một cơ chế, không phải số đếm lượng dùng cơ chế đó.

### 10.4 Cải tiến bằng phép trừ

**Luật.** Better-SLP không phải "SLP phiên bản tốt hơn" theo nghĩa vài tuần lại thêm feature. Những cải tiến tốt nhất có thể là (A3.10¶5):

- Bỏ bớt một cơ chế.
- Giảm một vòng message.
- Chuyển một trách nhiệm về đúng owner.
- Nhận ra một loại task vốn không cần Supervisor tham gia.

**Luật.** Những lỗi của SLP không được giải bằng cách thêm một role, một checklist hay một vòng approval chỉ để giữ nguyên SLP (A3.10¶3). Thêm quy trình để giữ quy trình chính là cái dù ở tầng phương pháp.

### 10.5 Cảnh giác tối ưu nhầm metric

**Nguyên tắc.** Một orchestration thấy ba lần Peer bắt lỗi thành công rồi kết luận "hãy tăng phản biện lên gấp đôi" rất dễ tối ưu nhầm metric. Thứ cần quan tâm không phải activity tăng bao nhiêu mà outcome thay đổi thế nào. Tay phanh quá xa thì chỉnh tay phanh; xích hay tuột thì sửa truyền động; nhưng đừng vì ba lần sửa xe hữu ích mà kết luận cứ mỗi kilômét phải dừng lại tháo xe kiểm tra toàn bộ (A3.10¶8). Telemetry không tự biến thành luật.

### 10.6 Trạng thái trưởng thành

**Nguyên tắc.** Một methodology tốt học được cả khi nào nên thêm cơ chế và khi nào nên thôi can thiệp. Không chỉ plan được đổi khi có evidence mới, mà chính cách lập plan, chia ownership, review và escalation cũng được phép đổi theo evidence (A3.10¶9).

## 11. Yêu cầu concept đặt lên plugin

Plugin là lớp giúp SLP chạy trên Paseo. Nó cung cấp những gì concept cần mà kênh chat không cho, và không làm thay phần việc của bất kỳ vai nào. Mỗi dòng dưới đây rút từ một đoạn của bài; dòng nào plugin hiện chưa đáp ứng là việc phải làm.

### 11.1 Plugin phải cung cấp

| # | Yêu cầu | Vì sao | Nguồn |
| --- | --- | --- | --- |
| P1 | Chạy trên primitive của Paseo (room, session, message) và để SLP là cách tổ chức, không đóng gói một orchestration cố định | SLP là tổ chức trên cơ chế, không phải một skill điều phối đóng gói | A3.7¶1 |
| P2 | Vai gắn với thuộc tính vận hành (phạm vi, quyền sửa, luồng thông tin, đường escalate), không gắn với tên | Phép thử đổi tên | A3.8¶3, ¶5 |
| P3 | Context tách biệt cho mỗi agent | Điều kiện cần của SLP | A3.8¶5 |
| P4 | Mỗi phạm vi đang thay đổi có một writer cho tới khi bàn giao rõ ràng; người giao việc không ghi song song cùng phạm vi | Invariant vận hành | A3.7¶6 |
| P5 | Quyền đọc và quyền nói rộng: Peer đọc được thiết kế ngoài phạm vi và gửi được yêu cầu tới owner liên quan | Tách quyền sửa khỏi quyền chất vấn | A3.3¶6; A3.7¶6 |
| P6 | Đường quay lại: Peer có kênh đưa phát hiện và evidence về Lead; Lead đổi được plan, thứ tự, ownership, dependency | Luận đề của SLP | A3.1¶13; A3.3¶12, ¶15 |
| P7 | Một trạng thái chung của lane mà Lead sở hữu, được lưu bền và đọc được độc lập với context của bất kỳ agent nào | Người tổng hợp là bộ lọc có mất mát; context có thể bị nén hoặc mất | A3.7¶3; A3.6¶3 |
| P8 | Trong trạng thái chung: brief đang dùng, nguồn gốc từng ràng buộc, tác giả từng quyết định, bất đồng còn mở | Bốn thứ Human cần biết | A3.6¶4 |
| P9 | Brief có chỗ cho ba phần (mục tiêu, ràng buộc bắt buộc, lựa chọn hiện tại) và cho loại việc (verification hay discovery) | Chống cái dù và pre-solve | A3.9¶7; A3.3¶5 |
| P10 | Supervisor và Human nói thẳng được với Peer; Lead được báo, thay đổi quay về trạng thái chung | Chống command chain ngầm | A3.7¶5 |
| P11 | Human sửa hướng thì thay đổi tới được người đang làm và vào kế hoạch chung; Human thấy được can thiệp đã đổi công việc hay chưa | Giám sát khác kiểm soát | A3.6¶4–5 |
| P12 | Evidence gắn với phiên bản code; acceptance dựa trên evidence của đúng phiên bản sẽ được chấp nhận; review biết mình xem phiên bản nào | Vòng phản biện đóng trên đúng phiên bản | A3.9¶1; A3.7¶6 |
| P13 | Khi đo đạc: giữ điều kiện máy so sánh được, và kiểm trạng thái thật thay vì tin message | Tính hợp lệ của phép đo | A3.9¶8–10 |
| P14 | Ghi chuỗi thay đổi của từng phát hiện và năm tín hiệu telemetry, để người đọc; không tự biến chúng thành luật | Better-SLP | A3.10¶1, ¶7–8 |
| P15 | Mỗi vai chọn được model riêng | Phối hợp điểm mạnh của từng model | A3.11¶6 |
| P16 | Instruction của từng vai sửa được mà không sửa code | Không có prompt thần kỳ; phải thử và chỉnh theo model và codebase | A3.9¶2, ¶11 |
| P17 | Một việc nhỏ chạy được bằng một agent, không cần cả room | SLP không phải north star | A3.12¶1–2 |

### 11.2 Plugin không được

| # | Không được | Vì sao | Nguồn |
| --- | --- | --- | --- |
| N1 | Quyết acceptance, đánh giá evidence hay chọn kết quả kỹ thuật thay cho vai | Đó là trục của Lead và Peer | A3.7¶3 |
| N2 | Giới hạn quyền đọc hay quyền nêu vấn đề để đạt an toàn khi ghi | Hai quyền khác nhau | A3.3¶6 |
| N3 | Ép nghĩa vụ phản biện, hoặc đo vai bằng số lần phản biện | Trả token cho tranh biện | A3.9¶3–5; A3.10¶1 |
| N4 | Ép plan bất biến, hoặc coi phát hiện làm đổi plan là lỗi | Plan là giả thuyết | A3.3¶9, ¶12 |
| N5 | Coi message hay lời "xong" của agent là evidence | Message không phải evidence | A3.9¶10 |
| N6 | Sửa lỗi của SLP bằng cách thêm role, checklist hay vòng approval | Cải tiến bằng phép trừ | A3.10¶3, ¶5 |
| N7 | Dựng sẵn cơ chế điều phối chỉ vì trên giấy nó trông đầy đủ | Bắt đầu đơn giản | A3.9¶11 |
| N8 | Viết persona vào prompt của vai | Role không phải persona | A3.8¶2 |

## 12. Anti-pattern mà bài gọi tên

Mọi anti-pattern dưới đây quy về một gốc: một phương án, một tiền đề hay một quy trình được miễn xét lại, trong khi mỗi lớp bổ sung đều mang một cái tên rất hợp lý (A3.2¶7).

### 12.1 Khi giao việc

| Anti-pattern | Dấu hiệu | Cách gỡ | Nguồn |
| --- | --- | --- | --- |
| Pre-solve | Brief chốt sẵn phương án, tiêu chí, vùng miễn xét và format trả lời; sub thành `f(x) -> confirm / reject` | Brief ba phần; phân biệt verification và discovery | A3.3¶1–3 |
| Cái dù | Lựa chọn của agent trước âm thầm thành constraint của agent sau; task đều là "tối ưu cái dù" | Ghi lựa chọn là lựa chọn, không phải constraint; cho Peer quyền hỏi lại | A3.2¶5–7 |
| Khoá ba kênh vào một phương án | Người làm chỉ được sửa bộ dù, chỉ đọc tài liệu về bộ dù, và được chấm bằng hiệu quả bộ dù | Mở quyền đọc và tiêu chí ở tầng mục tiêu | A3.2¶6 |
| Chốt nguyên nhân trong brief | "Tăng history để xử lý mất gói" | Giao triệu chứng, mở lại giả định liên quan | A3.4¶9 |
| Dịch phản hồi sang tầng giải pháp | "Xe nặng" thành "làm nhẹ dù" | Giữ phản hồi ở tầng mục tiêu | A3.2¶3, ¶5 |

### 12.2 Khi làm việc

| Anti-pattern | Dấu hiệu | Cách gỡ | Nguồn |
| --- | --- | --- | --- |
| Đường vòng | Liên tục thêm cơ chế (bảng ánh xạ ID, state trung gian, một lớp đồng bộ) để bù cho cùng một mâu thuẫn nền tảng không ai được mở lại | Mở lại mâu thuẫn gốc | A3.5¶2; A3.1¶12 |
| Làm cái dù to hơn | Nới một tham số để làm hiếm đi một lỗi cấu trúc (history 128 lên số lớn hơn) | Sửa vòng đời của thứ bị gộp | A3.4¶4–5 |
| Tiền đề trao sẵn không ai hỏi | Đưa hai cái bánh, muốn tới Guam, nhận về một chiếc thuỷ xe đạp | Quyền phản kháng đúng thời điểm | A3.5¶3–4 |
| Redesign không bị chất vấn | Overengineering ngay trong phương án thay thế | Bốn câu hỏi cho redesign | A3.5¶5 |
| Tranh biện trình diễn | Agent tìm thứ để phản đối để chứng minh vai trò | Quyền, không phải nghĩa vụ; phản biện gắn với evidence | A3.9¶3–5 |
| Phục tùng mọi brief | Agent chỉ biết làm theo | Mở thêm không gian chất vấn | A3.9¶11–12 |
| Nhiều người cùng chỉnh một bộ phanh | Hai writer trên một phạm vi; Lead tự chỉnh cùng phạm vi đã giao | Một owner mỗi phạm vi | A3.12¶3; A3.7¶6 |
| Command chain ngầm | Một người được bảo giữ dù, người khác được bảo tháo dù, Lead không biết | Can thiệp quay về trạng thái chung | A3.7¶5 |
| Role-play | Ba agent có chức danh nhưng chung context, chung quyền sửa, chung quyền đổi plan, không ai chịu integration | Vai theo trách nhiệm | A3.8¶5 |

### 12.3 Khi nghiệm thu và báo cáo

| Anti-pattern | Dấu hiệu | Cách gỡ | Nguồn |
| --- | --- | --- | --- |
| Kiểm tra xe trên giá | Từng bộ phận pass, nhưng chưa ai kiểm xe có dừng được ngoài đường; test xanh chỉ phủ những giả định người viết đã có | Người chịu trách nhiệm yêu cầu tầng người dùng; regression test cho tình huống bị bỏ sót | A3.12¶3; A3.4¶1, ¶12–13 |
| Phép đo nhiễu | Hai agent cùng chiếm CPU, compile trong lúc benchmark, workload đổi giữa hai lượt | Giữ điều kiện so sánh được | A3.9¶8–9 |
| Message thay evidence | "Tôi sẽ nhường CPU" được coi là CPU đã rảnh | Kiểm trạng thái thật | A3.9¶10 |
| Người tổng hợp lọc mất phản biện | Human chỉ thấy "đã giảm bao nhiêu gram" | Bản ghi chung với bốn thứ Human cần biết | A3.6¶3–4 |

### 12.4 Khi cải tiến chính SLP

| Anti-pattern | Dấu hiệu | Cách gỡ | Nguồn |
| --- | --- | --- | --- |
| Cơ cấu mới để giữ lời hứa của cơ cấu cũ | Thêm role, checklist hay vòng approval chỉ để giữ nguyên SLP | Cải tiến bằng phép trừ | A3.12¶3; A3.10¶3 |
| Tối ưu nhầm metric | Ba lần bắt lỗi thành công → "tăng phản biện gấp đôi" | Đo outcome, không đo activity | A3.10¶8 |
| Ceremony | Một bước review tạo nhiều ceremony hơn giá trị; "traffic rác ngốn token" | Bỏ bước đó | A3.10¶3, ¶7 |
| Lead ôm quá nhiều trách nhiệm | Mọi thứ dồn về Lead | Chuyển trách nhiệm về đúng owner | A3.10¶3, ¶5 |
| Báo đúng nhưng thiếu context | Peer báo đúng vấn đề nhưng người khác không hành động được | Sửa định dạng báo cáo | A3.10¶3, ¶6 |

## 13. Kinh nghiệm thực chiến và feedback

**Ghi chú, không phải luật.** Mục này gom kinh nghiệm tác giả kể lại, đánh giá phản biện từ bản phân tích, đối chiếu với công cụ khác và feedback của người đọc. Dùng nó để biết chỗ nào SLP dễ vấp khi đưa vào plugin.

### 13.1 Kinh nghiệm của tác giả

- **Với multi-agent v1 của Codex:** main thường pre-solve; sub-agent cùng model và effort nhưng bị dùng như một bộ phán định (A3.1¶7; A3.3¶16). Tác giả tự giới hạn phê bình vào v1; v2 đã có message hai chiều nhưng chưa giải bài toán quyền kiểm soát của user (A3.6¶1–3).
- **Với model mạnh:** GPT-5.6 Sol hay overengineering; Sol, Astra, Opus 5.5 giỏi tìm đường vòng và bẻ gần như mọi luận điểm nếu trả đủ token (A3.2¶2; A3.5¶1; A3.9¶4). Đây là quan sát cá nhân, không có số liệu.
- **Ca Nova:** plan đã nghiên cứu kỹ (source tương tự, chuyên gia, paper Tencent, Amazon), đã dự tính Edge Layer, vẫn còn năm câu hỏi handoff và một lỗi thứ tự pha trong tick (A3.1¶9–11).
- **Ca Quark:** 47/47 test pass, 4/4 regression test mới fail; hai lỗi đều do gộp cache với nghĩa vụ (A3.4).
- **Bốn lỗi của chính SLP tác giả từng gặp:** Lead ôm quá nhiều trách nhiệm; Supervisor can thiệp quá muộn; Peer báo đúng nhưng message không đủ context; một bước review tạo nhiều ceremony hơn giá trị (A3.10¶3).
- **Không dùng SLP** cho thay đổi nhỏ và cho game feel, combat feel, UI/UX (A3.12¶2).

### 13.2 Điểm mạnh của bài

1. **Khái niệm chính xác và dùng được ngay:** pre-solve, quyền sửa tách khỏi quyền chất vấn, verification tách khỏi discovery, brief ba phần, gánh nặng chứng minh đối xứng. Mỗi khái niệm chuyển được thành một quy tắc cho prompt hoặc cho code.
2. **Ví dụ ở mức cơ chế:** thứ tự pha trong tick của Nova, vòng đời history và ACK, baseline và despawn của Quark đủ chi tiết để kỹ sư netcode kiểm lại.
3. **Tự giới hạn:** giới hạn phê bình vào Codex v1; nói bug không chứng minh orchestration gây lỗi; nói survey không kiểm chứng SLP; nói SLP không phải north star.
4. **Tự cân bằng:** chống cả phục tùng brief lẫn tranh biện vô tận; đề xuất redesign cũng phải qua bốn câu hỏi.
5. **Phản thân:** chính phương pháp cũng phải chịu evidence, và ưu tiên cải tiến bằng cách bỏ bớt.

### 13.3 Giả định ngầm cần kiểm

| Giả định | Vì sao đáng ngờ | Hệ quả nếu sai |
| --- | --- | --- |
| Peer có đủ ngữ cảnh để nhận ra tiền đề sai | Peer chủ đích được giao task hẹp và context riêng; tiền đề sai thường nằm ở ranh giới giữa các task | Phát hiện xuyên module vẫn bị bỏ lọt; Peer chỉ bắt được lỗi cục bộ |
| Lead đủ trung lập để phân loại phản biện | Lead cũng là một LLM và là tác giả của plan; nó có thể tự pre-solve khi viết brief và bảo vệ plan của mình | Lead lọc mất phản biện đúng, giống main của Codex v2 |
| Trạng thái chung do Lead giữ là đáng tin | Với một agent, trạng thái nằm trong context window, có thể bị nén hoặc mất khi agent khởi động lại | Ai làm gì, ai được báo gì bị lệch; invariant một owner không còn được giữ |
| Evidence kiểm được bằng máy | Đúng với netcode, benchmark; sai với UI/UX, game feel | Phạm vi dùng được hẹp hơn bài gợi ý |
| Chi phí phối hợp nhỏ hơn lợi ích | Bài không nêu số token hay thời gian; đội agent tốn token hơn một session đáng kể | Không biết điểm hoà vốn của SLP |

### 13.4 Khoảng trống bằng chứng

- **Không có đối chứng:** không có so sánh cùng task giữa SLP, Codex v1/v2 hay agent teams.
- **Ca 47/4 không quy được cho SLP:** bài không nói ai viết bốn test mới, cũng không nói SLP có dẫn tới việc viết chúng không.
- **Không tái lập được:** tác giả cố ý không công bố prompt và setup, và chưa có case study.
- **Nhận định về model là giai thoại.**
- **Không có số liệu outcome:** bài định nghĩa thước đo chuỗi thay đổi nhưng không báo cáo giá trị nào.

### 13.5 Rủi ro của chính SLP

- **Lead là nút cổ chai:** mọi evidence, phân loại, phối hợp và acceptance đều đi qua Lead.
- **Độ trễ escalation:** mỗi vòng Peer → Lead → Supervisor → Human tốn thời gian thật; bài không bàn Peer làm gì trong lúc chờ.
- **Chất vấn tiền đề thành lối thoát:** Peer gặp task khó có thể đề xuất đổi scope thay vì giải nó. Bốn câu hỏi cho redesign giảm rủi ro này, không loại bỏ nó.
- **Sycophancy là chiều ngược của tranh biện trình diễn:** chỉ trao quyền có thể chưa đủ để Peer dám dùng quyền; ép thành nghĩa vụ lại gây tranh biện. Việc cân chỉnh phải làm thủ công.
- **Ranh giới ownership dịch chuyển:** phụ thuộc dọc làm ranh giới đổi khi dependency mới lộ ra, trong khi invariant một owner cần ranh giới rõ.

### 13.6 Đối chiếu với công cụ khác

| Mô hình | Ai định nghĩa bài toán | Quyền chất vấn tiền đề | Trạng thái chung | Human tới agent đang làm | Hợp khi |
| --- | --- | --- | --- | --- | --- |
| Một agent làm hết | Agent đó | Không áp dụng | Trong context của agent | Trực tiếp | Thay đổi nhỏ; việc cần Human phản hồi liên tục |
| Main/sub, Codex v1 (theo tác giả) | Main (pre-solve) | Gần như không | Trong context của main | Qua main | CRUD, việc độc lập chia ngang |
| Main/sub có message hai chiều, Codex v2 | Main | Có kênh, nhưng main lọc khi tổng hợp | Trong context của main | Đọc transcript; khó steering | Khi cần sub báo blocker |
| Claude Code agent teams | Lead | Có; teammate nhắn nhau trực tiếp | Task list chung | Nhắn trực tiếp, nhưng lead không tự được báo | Research, review, module tách biệt |
| Framework đóng vai (ChatDev, MetaGPT) | Quy trình mô phỏng công ty | Theo quy trình định sẵn | Tài liệu trung gian | Thường không | Dựng nhanh sản phẩm nhỏ |
| SLP | Human (mục tiêu); Lead chia việc; Peer phán đoán trong task | Có, gắn với evidence; không phải nghĩa vụ | Lead giữ | Có, can thiệp quay về trạng thái chung | Dự án lớn, phụ thuộc dọc, tiêu chí kiểm bằng máy |

- **Tranh luận có cấu trúc vs tranh biện trình diễn.** Tài liệu agent teams của Claude Code có ví dụ yêu cầu teammate bác bỏ giả thuyết của nhau "như một cuộc tranh luận khoa học" để chống mỏ neo. Bài cảnh báo đúng kiểu prompt này. Hai lập trường dung hoà theo loại việc: với discovery có nhiều giả thuyết cạnh tranh, tranh luận có cấu trúc chống mỏ neo; với implement và review thường ngày, nghĩa vụ phản biện tạo bất đồng trình diễn.
- **Agent teams thiếu gì theo tiêu chí của bài:** không có bản ghi tách constraint của user khỏi lựa chọn của lead; không có danh sách bất đồng còn mở; user can thiệp trực tiếp vào teammate thì lead không tự được báo.
- **Andrew Ng (2024)** dựng multi-agent quanh đóng vai (kỹ sư, PM, designer, QA), đúng hướng bài phản đối ở §3. **Survey của Feng và cộng sự (2026)** cho từ vựng đồ thị, không cho bằng chứng về SLP.

### 13.7 Thiết kế thí nghiệm đề xuất

Mục tiêu: kiểm mệnh đề trung tâm, rằng tách quyền chất vấn khỏi quyền sửa giúp phát hiện tiền đề sai mà không gây tranh biện.

1. **Bộ task:** một nửa mang một tiền đề sai đã biết (một "cái dù", ví dụ "tăng history để xử lý mất gói"); nửa còn lại có tiền đề đúng.
2. **Ba điều kiện:** brief pre-solve (A/X/Y, PASS/FAIL); brief ba phần với quyền chất vấn; brief ba phần với nghĩa vụ phản biện ("thách thức mọi giả định").
3. **Đo:** tỷ lệ phát hiện tiền đề sai; tỷ lệ phản biện vô căn trên task có tiền đề đúng; tỷ lệ Lead chấp nhận phản biện đúng và bác phản biện sai; tổng token; chất lượng kết quả bằng test độc lập ở tầng người dùng.
4. **Dự đoán của bài:** điều kiện hai phát hiện nhiều hơn điều kiện một, và phản biện vô căn ít hơn điều kiện ba.
5. **Kiểm soát:** cùng model và effort giữa các điều kiện; chạy tuần tự hoặc giữ máy riêng khi đo hiệu năng (A3.9¶8).

### 13.8 Feedback của người đọc

Bình luận duy nhất dưới bài, của độc giả "Bigboy" (27/9/2026): cùng dùng AI mà tác giả dùng nó khác người thường. Bình luận không có nội dung kỹ thuật. Chỗ này dành để ghi thêm feedback từ những người đã dùng SLP.

## 14. Câu hỏi còn mở

Bài không trả lời những câu dưới đây. Câu nào đụng tới plugin thì owner chốt trước khi code.

1. **Ai kiểm tra cách Lead đóng khung task?** Bài nói Supervisor "phát hiện lệch hướng" (A3.7¶3), nhưng không nói bằng cách nào. Lead cũng có thể tự pre-solve (§13.3).
2. **Trạng thái chung của Lead sống sót thế nào** khi context của Lead bị nén hoặc Lead khởi động lại? Bài đặt trạng thái chung ở Lead (A3.7¶3) nhưng không nói nó nằm ở đâu.
3. **Peer làm gì trong lúc chờ** một escalation đi qua Lead, Supervisor, Human?
4. **Có thể tự động phân loại** một task là verification hay discovery để chọn kiểu brief không?
5. **Dùng model khác nhau cho từng vai** có giảm được điểm mù chung không, như tác giả gợi ý (A3.11¶6)?
6. **Điểm hoà vốn:** việc lớn tới đâu thì chi phí phối hợp của SLP đáng bỏ ra?
7. **Ranh giới ownership dịch chuyển** khi dependency mới lộ ra: ai vẽ lại, và invariant một owner được giữ ra sao trong lúc chuyển?
8. **Nghiên cứu về tổ chức con người** có áp dụng được không: an toàn tâm lý cho việc lên tiếng, định luật Conway cho quan hệ giữa cấu trúc đội và cấu trúc hệ thống, double-loop learning cho Better-SLP.

## 15. V1 cô đọng

Mục này tóm CONCEPT v1, bản mà plugin hiện tại đang dựng theo, để đối chiếu với V2. Đây là tham chiếu, không phải nguồn: chỗ nào V1 khác V2 thì theo V2 (15.12).

### 15.1 Luật chi phối

- **Plugin phục vụ SLP, không bó SLP** (lời owner). Mỗi thay đổi phải trả lời: gỡ hay thêm ràng buộc? Thêm thì cần owner đồng ý và ghi lý do; bỏ thì xoá, không thêm công tắc.
- **Code chỉ sở hữu khái niệm SLP.** Agent, harness, model, tool, MCP, ngưỡng là settings; tên vendor trong code là lỗi.
- **Phép thử DCM:** bỏ SLP thì plugin vẫn sống; người không theo SLP vẫn dùng được.
- **Ràng buộc duy nhất concept tự xin:** Supervisor được chạm thẳng Peer, desk luôn báo Lead trước.
- **Concept chưa trả lời thì hỏi owner** trước khi code.
- **Plugin chỉ được quyết** vòng đời session, vận chuyển, định tuyến, thông báo, trạng thái bền vững và nguồn gốc. Không bao giờ quyết acceptance.

### 15.2 Vai và cạnh

V1 chia **lõi SLP** (Supervisor, Lead, Peer) và **hai phần quanh lõi**: R (review) và W (watcher).

| Vai | Sở hữu | Nói với |
| --- | --- | --- |
| Human | Intent, ưu tiên, cam kết bên ngoài; concept; push và release khi đang trong vòng lặp | Supervisor |
| Supervisor | Diễn giải intent; quan sát và can thiệp xuyên ranh giới; land lane | Human, các Lead; Peer khi Lead được báo trước |
| Lead | Một lane: topology, thứ tự, ownership, integration, acceptance | Supervisor, Peer và Reviewer của mình |
| Peer | Một task và phán đoán kỹ thuật trong đó; được từ chối framing của Lead | Lead |
| R · Reviewer | Không gì: verdict là bằng chứng Lead cân | Lead |
| W · Watcher | Không gì: báo Supervisor *khi nào* cần nhìn | Supervisor |
| Paseo | Vòng đời session, vận chuyển, định tuyến, thông báo | — |
| Desk | Trạng thái bền vững, nguồn gốc, phần cơ học của git | Seat, qua thư và lời đáp tool |

- Thẩm quyền là trục, không phải tầng: Supervisor rộng theo không gian, Lead sâu theo lane và acceptance, Peer sâu theo task.
- **Một cửa tới Human:** chỉ Supervisor hỏi Human. Human gõ vào chat Lead hay Peer thì desk báo Supervisor.
- Không có Critic. Mỗi project một Supervisor.

### 15.3 Team và đời seat

- **Một lane là một team:** Lead, các Peer, các Reviewer. Supervisor mở lane bằng `open_lane` (outcome, acceptance, `writeSet`). Nhiều lane và nhiều Peer chạy song song miễn không xung đột.
- **Không xung đột bằng cấu trúc:** task song song khai `holds` và chạy trong copy riêng; task trong copy của lane chạy lần lượt; path một-người-ghi (`serialOnly`) là mặc định, project đè được. Desk đối chiếu file thật sự đổi rồi ghi chú, không chặn.
- **Mỗi seat một nhiệm vụ:** Peer một task, Lead một lane. Rework về đúng Peer đó. Cấp trên kết thúc seat (Lead `release` Peer); desk không tự tắt. Lead có thể `reseat` một task.
- **Nhánh rẽ giữa chừng** là Lead mới, không nới lane cũ.
- **Tên seat theo việc:** `L1 · Lead · <lane>`, `L1-T3 · Peer · <task>`, `L1-R1 · Review L1-T3`.

### 15.4 Supervisor

- **Điều phối sự chú ý, không tự quét.** *Khi nào* cần nhìn là việc của W; *có* can thiệp không và *thế nào* là của Supervisor.
- **Hành động:** một câu hỏi mở, một council, một hold, hoặc đưa lên Human. Câu hỏi mở, không đóng khung, vì câu đóng khiến model cố tìm lỗi để chiều lòng.
- **Không bao giờ** viết code hay quyết kết quả kỹ thuật. Chạy theo sự kiện, giữ context sạch. Lời khuyên gửi Lead; tới thẳng Peer chỉ khi Lead không mang được.

### 15.5 W: một con mắt, hai bộ não

- **Mắt** (code): đọc phần mới trong thinking, lời nói và brief của mỗi Lead, Peer, mỗi 5 phút khi seat chạy và khi hết lượt; cửa sổ 80 mục; thứ đếm được thì code tự tính thành fact.
- **Não:** sensor (model rẻ, hỏi từng mục mỗi câu một điều kiện) và seat Watcher (model xét ý định nhiều bước). `attention.brain` là `off | sensor | seat | both`.
- **Tiêu chí là data:** danh mục anti-pattern và bốn khoảnh khắc (Lead ra quyết định kiến trúc, Peer vật lộn với khái niệm mơ hồ, đổi hướng đột ngột, agent tự nhận sai).
- **Báo:** mọi thứ W thấy mở incident và tới Supervisor; không công tắc từng tín hiệu, không shadow. W không quyết, không can thiệp, không nói với seat nó canh.

### 15.6 R: review là bằng chứng

- Lead gọi `start_review`; desk dựng seat Reviewer chỉ đọc, con của Lead. Hai role `reviewer` và `second-reviewer` cùng harness, khác model.
- Brief mang câu hỏi mở và `reviewQuestion` của risk rule; verdict không trả lời câu đó thì bị từ chối.
- Verdict `changes` không tự chặn gì; Lead cân nó. Lane chưa review cả lane trước READY là fact cho người land, không phải lời từ chối.
- J1–J5: câu hỏi một điều kiện do sensor rẻ hỏi lúc hand-back, làm bằng chứng cho Lead khi accept.

### 15.7 Human và cờ HITL

|  | HITL `off` (mặc định) | HITL `on` |
| --- | --- | --- |
| Human quyết | Chỉ concept, qua grilling của Supervisor; đổi mục đích lane hay chi phí vượt appetite | Concept, câu hỏi trên hàng `ask_human` (tối đa 3 câu mỗi ngày), landing chạm `askFirst` |
| Permission của seat | Supervisor trả bằng `permit` | Human trả |
| Push, release | Supervisor ra lệnh `push`, desk chạy, không force | Human |

- **Lệnh thường trực** ở `project.json`: `riskRules`, `askFirst`, `laneHome`. `CONTEXT.md` giữ khái niệm Human đã chốt, chỉ Supervisor ghi.
- **Human im lặng** thì theo ba lớp, không bao giờ tự duyệt theo timeout: đảo được thì chạy và ghi "đã quyết thay bạn"; đảo được nhưng tốn công thì chạy tới checkpoint rồi dừng; không đảo được thì dừng.
- Supervisor có `hold_lane`, `resume_lane`, `withdraw_question`. Báo cáo luôn có trên panel, desk dựng không qua model.

### 15.8 Git và landing

- **Desk giữ phần cơ học, seat phán đoán.** Desk tạo mọi nhánh và copy; mỗi task ghi file có nhánh `task/<id>-<slug>`; nhánh lane chỉ tiến bằng merge của desk.
- **Git shim** trên mọi seat từ chối `pull`, `checkout`, `switch`, `stash`, `update-ref`, `push`, `worktree`, xoá hay đổi nhánh, và git ngoài copy của chính seat. Seat viết code được `merge`, `rebase`, `reset`, `cherry-pick` trên nhánh task; seat không viết bị deny rule của harness chặn bốn lệnh đó. Desk chạy git không hook.
- **Task vào lane:** Peer `done` → desk ghép lane vào nhánh task, conflict để Peer gỡ → Lead `accept` → hàng merge của lane, chạy gate → đỏ là MERGE RED (Lead `rework` hoặc `accept` lại với `overGate` kèm lý do), xanh là MERGED.
- **Lane lên base** (`land_lane`): chạm `askFirst` thì chờ Human → ghép base, conflict thì huỷ và Supervisor chọn Lead gỡ → gate và `rehearse` trên đúng head sẽ land → land theo `landAs` (squash, merge, ff) → lane khác giờ xung đột nhận BASE MOVED.
- **Conflict:** trong lane là việc của Lead, giữa các lane là việc của Supervisor; người viết nhánh gỡ conflict nhánh mình.

### 15.9 Plugin mở

- **Vai là data** trong `roles.json` với capability (`supervise`, `lead`, `work`, `write`, `review`, `watched`, `judge`); không chỗ nào trong code so vai với tên.
- **File catalog** cùng tên trong thư mục state thay bản ship; role riêng lấy sandbox và rules từ `own/harness/<agent>/` hoặc `like` một role có sẵn.
- **Paseo là control plane duy nhất:** seat không tự sinh agent; subagent native bị tắt.

### 15.10 Tám luật thiết kế

1. Code chỉ sở hữu khái niệm SLP.
2. Một cửa tới Human.
3. Chạy theo sự kiện; thư chỉ báo tin không đánh thức ai.
4. Bằng chứng, không lời tuyên bố: accept, ready, land luôn kèm gate, review, rehearse.
5. Phân lớp theo mức đảo ngược được.
6. Code kiểm được thì là code; prompt chỉ giữ phán đoán; chỉ dẫn theo tình huống nằm ở dòng `Next:` của thư.
7. Không công tắc tắt ràng buộc, trừ lệnh thường trực và cờ HITL của Human.
8. W báo thẳng những gì nó thấy.

### 15.11 Những thứ V1 khoá chặt

- **KEEP list:** 35 dòng phải giữ theo chữ, test `keep.test.ts` giữ. Nhóm theo thứ chúng bảo vệ: brief không mang đáp án và hỏi mở (keep-01, 02); chống test đúc API (keep-03, 04); chữ đọc được là dữ liệu, không phải lệnh (keep-07, 14); mỗi message của Supervisor một quyết định hoặc một câu hỏi (keep-08); council không phòng chung (keep-09); Lead không có cạnh tới Human (keep-10); MCP không mang tên vai (keep-12, 13, 19, 20); outbox không chèn thư vào lượt đang chạy (keep-15); cách dựng seat (keep-16, 17, 18); không subagent native (keep-21).
- **Refuted:** task chung copy lane chạy lần lượt; desk không chiếm working copy có thay đổi chưa commit của Human; `serialOnly` của project; Peer và Reviewer bị tắt tool riêng của Paseo; Watcher chỉ đọc.
- **Giới hạn Paseo** (P1–P13) mà thiết kế đi quanh: settings chỉ scope host; plugin không đăng ký được tool vào MCP của Paseo nên mỗi seat có server `team` riêng; `mcpServers` và `systemPrompt` chỉ đặt lúc tạo; `before('agent.create')` không thấy `labels`; không có API notify; không cancel, chỉ interrupt hoặc steer; history luôn projected; output shell cắt ở 64 KiB.

### 15.12 Chỗ V1 lệch V2

| Chủ đề | V1 (plugin hiện tại) | V2 (theo bài) |
| --- | --- | --- |
| Trạng thái chung | Desk giữ sổ (ledger, incident); Lead sở hữu lane | Lead giữ trạng thái chung; plugin lưu bền cho Lead (P7) |
| Reviewer | R nằm ngoài lõi SLP | Reviewer là một kiểu Peer do Lead tạo (§3.2) |
| Ai phát hiện lệch hướng | W (mắt + sensor + seat) báo Supervisor | Supervisor phát hiện lệch hướng; bài không nói bằng cách nào (§14.1) |
| Human trong vòng lặp | Cờ HITL `on` hoặc `off`, mặc định `off` | Human luôn giữ mục tiêu; escalate khi đổi mục tiêu hoặc chi phí chưa duyệt (§7.3) |
| Human tiếp cận Peer | Desk báo Supervisor | Thay đổi quay về trạng thái chung của Lead (§9.4) |
| Brief | Luật nằm trong prompt của Lead | Brief ba phần và loại việc là cấu trúc plugin cung cấp (P9) |
| Đo SLP | Report card đếm tỷ lệ | Chuỗi thay đổi theo từng phát hiện, năm tín hiệu telemetry (P14) |
| Git | Cơ chế chi tiết của desk | Chỉ đòi một writer mỗi phạm vi và evidence đúng phiên bản (P4, P12); cơ chế là lựa chọn của plugin |

## 16. Nguồn

**Nguồn chuẩn**

- vhLam, *Bàn về multi-agent orchestration và mô hình SLP*, vhlam.com, 27/09/2026. Toàn văn do người dùng cung cấp.
- [Agent Orchestration & SLP — Phân tích nghiên cứu chi tiết](https://claude.ai/code/artifact/b74aa723-1ada-48ad-8329-4f5b9f5c4e0a): bản phân tích từng đoạn; nguồn của ký hiệu `A`.

**Nguồn bài nêu tên** (bối cảnh, không kiểm chứng SLP)

- **Andrew Ng, *Agentic Design Patterns Part 5, Multi-Agent Collaboration*, The Batch, 04/2024.**
  - **Multi-agent theo Ng:** chia việc lớn thành subtask, mỗi agent một vai (kỹ sư, PM, designer, QA), giống một công ty; mỗi agent có workflow, bộ nhớ riêng và có thể nhờ agent khác. Lý do: nó chạy tốt, model làm tốt hơn khi tập trung một việc, và vai là một cách phân rã cho người thiết kế.
  - **Cảnh báo của chính Ng:** chất lượng đầu ra "hard to predict, especially when allowing agents to interact freely"; Reflection và Tool Use đáng tin hơn.
  - **Khớp SLP:** phân rã, mỗi agent một việc và một context riêng.
  - **Lệch SLP:** với Ng, vai là persona prompt ("You are an expert in…") và quản lý là cây giao việc từ trên xuống. SLP coi vai là trách nhiệm và quyền hạn (§3), và trả lời câu Ng bỏ ngỏ: ai được quyết gì, bằng chứng đi tới ai.
  - Mức kiểm chứng: đọc toàn văn qua bản sao trên GitHub; trang gốc bị chặn.
- **Yuyuan Feng và cộng sự, *Graph Engineering in the Era of LLM Agents*, arXiv:2608.21156, 08/2026.**
  - **Multi-agent theo survey:** một agent đơn gặp giới hạn khi việc cần chuyên môn khác nhau, subtask phụ thuộc nhau, chạy song song, kiểm chứng độc lập và trạng thái bền. Lời giải là tổ chức ở cấp hệ thống: Prompt → Context → Harness → Loop → Graph Engineering.
  - **Ba loại đồ thị:** đồ thị task (phân rã, phụ thuộc); đồ thị phối hợp agent (năng lực, cấu trúc team động, topo giao tiếp đổi theo thời gian); đồ thị trạng thái runtime (gắn vai, view theo vai, cập nhật trạng thái phải qua kiểm quyền và invariant, escalate lên Human khi hỏng).
  - **Khớp SLP:** spawn và phụ thuộc dữ liệu có tương đương rõ; trạng thái chung của Lead gần với "governed state updates"; Better-SLP gần với "system evolution".
  - **Survey thiếu đúng chỗ SLP nhấn:** không mô hình hoá ownership module, quyền sửa quyết định hay nghĩa vụ thông báo; governance chỉ là "thách thức mở". Survey cho từ vựng, không chứng minh SLP. Có một paper được liệt kê còn chủ trương bỏ hẳn vai và phân cấp: một phản biện đáng ghi.
  - Mức kiểm chứng: đọc README và hình của repo DEEP-JLU/Awesome-Graph-Engineering; abstract qua kết quả tìm kiếm; chưa đọc thân paper (arXiv bị chặn).
- **Anthropic, *Orchestrate teams of Claude Code sessions* (agent teams) và cross-session messaging.**
  - **Multi-agent theo agent teams:** một lead, các teammate có context riêng, task list chung và mailbox; teammate nhắn thẳng nhau; user nói thẳng với bất kỳ teammate nào. Tài liệu khuyên chia file cho từng teammate vì hai teammate sửa cùng file sẽ ghi đè nhau. Đội tốn token hơn hẳn một session; nên bắt đầu với 3–5 teammate.
  - **Khớp SLP:** context tách biệt, mỗi phạm vi một owner (dưới dạng lời khuyên), Human tiếp cận trực tiếp. Cross-session messaging có luật gần "message không phải evidence": message từ session khác không bao giờ tính là sự đồng ý của user và không đổi được cấu hình.
  - **Thiếu so với SLP:** user nói thẳng với teammate thì lead không được báo, nên thay đổi không quay về trạng thái chung; không có bản ghi tách ràng buộc của user khỏi lựa chọn của lead; không có danh sách bất đồng còn mở; review không gắn phiên bản; lead cố định, một cấp, không có Supervisor trên nhiều lead.
  - **Điểm đối lập với bài:** ví dụ prompt "disprove each other's theories, like a scientific debate" là biến phản biện thành nghĩa vụ. Hợp cho discovery nhiều giả thuyết; không hợp cho implement và review thường ngày (§6.2).
  - Mức kiểm chứng: đã đọc toàn văn [agent teams](https://code.claude.com/docs/en/agent-teams) và [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging).
- **OpenAI Codex multi-agent v1 và v2.**
  - **v1:** parent spawn con, gửi input, chờ, đóng; con chỉ trả về kết quả cuối, không nhắn ngược lại được giữa chừng. Prompt spawn của Codex tự dặn parent "do this planning step before delegating" và "narrow the delegated ask to the concrete output you need next": đây là bằng chứng trực tiếp cho phê bình pre-solve của bài.
  - **v2:** địa chỉ agent theo đường dẫn task, con được spawn tiếp, con nhắn được cho cha và cho agent khác. Nhưng user bị chặn nói thẳng với sub-agent ("This sub-agent is controlled by its parent. Direct input is disabled"), chỉ xem được transcript.
  - **So với SLP:** v2 thêm kênh, không thêm quyền: chỉ parent quyết theo dõi, ngắt hay chuyển tiếp gì. Đúng ý bài: giám sát được, kiểm soát không (§9.3), và user không biết brief nào, ràng buộc nào của mình đã tới, quyết định nào do agent chọn, bất đồng nào còn mở (§9.2).
  - Mức kiểm chứng: đọc mã nguồn [openai/codex](https://github.com/openai/codex) và [issue #33551](https://github.com/openai/codex/issues/33551); tài liệu chính thức bị chặn.
- **Paseo: lớp duy trì room, session và truyền message.**
  - **Vai trò trong multi-agent:** daemon tự host bọc các agent CLI có sẵn (Claude Code, Codex, Copilot, OpenCode, Pi) thành provider; tạo agent với bất kỳ provider và model nào đã cấu hình. Đây là thứ cho phép mỗi vai SLP ngồi trên một model khác.
  - **Orchestration Paseo đưa sẵn** mà SLP không dùng: skill handoff (chuyển việc sang agent mới), committee (hai agent tương phản phân tích nguyên nhân và viết plan), advisor (một agent cho ý kiến thứ hai), agent tự spawn agent, schedule, heartbeat. Chúng không có acceptance của Lead và không ghi nguồn gốc, nên đúng là "orchestration đóng gói" mà bài chọn không dùng (A3.7¶1).
  - **Những giới hạn định hình SLP trên Paseo:** prompt và tool của một agent chỉ đặt lúc tạo, nên đổi vai hay đổi quyền là tạo agent mới; không có API thông báo cho plugin; subscription mất sự kiện khi kết nối lại, nên trạng thái chung không được dựa vào luồng sự kiện.
  - Mức kiểm chứng: đọc [getpaseo/paseo](https://github.com/getpaseo/paseo) (README, orchestration, skills) và type của SDK 0.9.2 trên npm; paseo.sh bị chặn.
- **Iris (Unreal Engine) và Netcode for Entities (Unity): mốc so sánh benchmark của Quark.**
  - **Liên quan tới SLP chỉ ở hai bài học**, không phải ở netcode.
  - **Cache khác nghĩa vụ:** cả hai engine giữ "client có thể còn giữ X" trong trạng thái riêng cho tới khi có xác nhận, tách khỏi cache có thể bị dọn. Đúng với cách sửa hai lỗi Quark và với §4.5: sổ sách của đội agent cũng không được để việc dọn dẹp xoá mất một nghĩa vụ còn nợ.
  - **Phép đo phải cô lập:** benchmark so với Iris hay NfE chỉ có nghĩa khi máy không bị agent khác chiếm, đúng với §8.4.
  - Mức kiểm chứng: NfE qua bản sao tài liệu của package trên GitHub; Iris chỉ qua kết quả tìm kiếm, trang gốc bị chặn.
