/** The languages a tab's fields are described in; every other word of the surface is English. */
export type Lang = "en" | "vi";
export const LANGS: readonly { readonly id: Lang; readonly label: string }[] = [
  { id: "en", label: "English" },
  { id: "vi", label: "Tiếng Việt" },
];

/** A tab whose fields are described. */
export type InfoTab =
  "projects" | "templates" | "classifier" | "cleanup" | "updates" | "overview" | "agents" | "settings";

/** One field as the tab names it, and what it is, in each language. */
type Entry = { readonly field: string } & Readonly<Record<Lang, string>>;

export const INFO: Readonly<Record<InfoTab, readonly Entry[]>> = {
  projects: [
    {
      field: "A project's line",
      en: "A folder a team is attached to. The first tag is the template it runs, the second where its team stands: stuck, needs you, held, working, all landed or idle. Press the line to open the project's own page.",
      vi: "Một folder đã gắn team. Tag đầu là template nó chạy, tag sau là tình trạng team: stuck (kẹt), needs you (chờ bạn), held (đang giữ), working, all landed (đã xong hết) hoặc idle. Bấm vào dòng để mở trang riêng của project.",
    },
    {
      field: "Attach a team to",
      en: "Every project you have in Paseo with no team yet. Attach with a template seats that template's first agent there.",
      vi: "Mọi project trong Paseo chưa có team. Bấm Attach with <template> để đặt agent đầu tiên của template đó vào project.",
    },
    {
      field: "no git yet · Set up git",
      en: "The folder is no git repository yet. Set up git makes it one and commits what it holds, after saying how many files that is.",
      vi: "Folder chưa là git repository. Set up git sẽ khởi tạo git và commit những gì đang có, sau khi báo trước số file.",
    },
    {
      field: "part of …",
      en: "A folder inside another repository, or a worktree of one. A team is attached to a repository whole, so it is not attached by itself.",
      vi: "Folder nằm trong một repository khác, hoặc là worktree của nó. Team gắn vào nguyên một repository, nên folder này không gắn riêng được.",
    },
    {
      field: "Path of a folder",
      en: "For a folder Paseo does not list: give its path and press Add.",
      vi: "Dành cho folder Paseo chưa liệt kê: nhập đường dẫn rồi bấm Add.",
    },
  ],
  templates: [
    {
      field: "A template's line",
      en: "A way of working installed on this machine: how many agent profiles its roles name, and the projects that run it.",
      vi: "Một cách làm việc đã cài trên máy: các role của nó dùng bao nhiêu agent profile, và project nào đang chạy nó.",
    },
    {
      field: "Agent profile",
      en: "A name the template gives to what a role runs. It stands for an agent profile of yours in Paseo; the roles that use it are beside it.",
      vi: "Tên mà template đặt cho thứ một role chạy. Nó ứng với một agent profile của bạn trong Paseo; các role dùng nó ghi bên cạnh.",
    },
    {
      field: "Provider · Model · Effort",
      en: "What that profile runs: the coding agent, its model, and how hard the model thinks. Set here, it is the default for every project; a project changes it for itself on its Agents tab.",
      vi: "Thứ profile đó chạy: coding agent nào, model nào, và model suy nghĩ kỹ đến đâu. Chọn ở đây là mặc định cho mọi project; từng project đổi riêng ở tab Agents của nó.",
    },
    {
      field: "Create the … in Paseo on",
      en: "Makes in Paseo the agent profiles this template names that you do not have yet, all on the provider, model and effort picked. Nothing you already have is touched.",
      vi: "Tạo trong Paseo những agent profile mà template cần nhưng bạn chưa có, tất cả theo provider, model và effort đang chọn. Profile bạn đã có không bị đụng tới.",
    },
    {
      field: "⋯ at the end of a line",
      en: "Runs that name on another agent profile of yours, in place of the one of its own name.",
      vi: "Cho tên đó chạy trên một agent profile khác của bạn, thay cho profile trùng tên với nó.",
    },
    {
      field: "not in Paseo · Pick a model",
      en: "Paseo has no profile of that name yet; or the profile names no model, and Paseo starts no agent without one.",
      vi: "Paseo chưa có profile tên đó; hoặc profile chưa có model, mà Paseo không khởi động agent khi thiếu model.",
    },
    {
      field: "Add a template",
      en: "Read shows what a template would bring before you install it. Make one in the editor opens the gallery, where templates are made and shared.",
      vi: "Read cho xem template sẽ mang theo những gì trước khi cài. Make one in the editor mở gallery, nơi tạo và chia sẻ template.",
    },
  ],
  classifier: [
    {
      field: "Ask the classifier",
      en: "Whether this machine asks the small model a template names to notice things as a team works: a brief that carries its own answer, a hand-back that deletes tests. Off, the team works the same and those notices are not made.",
      vi: "Máy này có hỏi model nhỏ mà template chỉ định để phát hiện vấn đề khi team làm việc hay không: brief chứa sẵn đáp án, hand-back xoá test... Tắt thì team vẫn làm việc bình thường, chỉ không có các cảnh báo đó.",
    },
    {
      field: "Host",
      en: "The one host your key is sent to. A template's classifier is asked only where it is served at this host.",
      vi: "Host duy nhất mà key của bạn được gửi tới. Classifier của template chỉ được hỏi khi nó chạy ở đúng host này.",
    },
    {
      field: "Key",
      en: "Your key for that host. It is kept on this machine, sent to that host alone, and never shown again.",
      vi: "Key của bạn cho host đó. Nó được lưu trên máy này, chỉ gửi tới host đó, và không bao giờ hiện lại.",
    },
  ],
  cleanup: [
    {
      field: "Safe to remove",
      en: "Worktrees, branches and agents no open work uses, with nothing to lose: they come picked.",
      vi: "Worktree, nhánh và agent không còn việc nào dùng, xoá không mất gì: được chọn sẵn.",
    },
    {
      field: "Check first",
      en: "A branch with commits the base does not hold: they go with it, so look before you pick it.",
      vi: "Nhánh có commit mà base chưa có: xoá nhánh là mất các commit đó, nên xem trước khi chọn.",
    },
    {
      field: "Kept",
      en: "What cannot be removed yet, and why: a worktree that holds uncommitted work.",
      vi: "Thứ chưa xoá được và lý do: worktree còn việc chưa commit.",
    },
    {
      field: "Records of removed projects",
      en: "The record of a project you removed, kept for a look back. Removing it deletes it for good.",
      vi: "Record của project đã gỡ, giữ lại để xem lại sau. Xoá ở đây là xoá hẳn.",
    },
    {
      field: "Remove …",
      en: "Removes what is picked, after asking once more.",
      vi: "Xoá những thứ đang chọn, sau khi hỏi lại một lần.",
    },
  ],
  updates: [
    {
      field: "Seatworks …",
      en: "The release installed, and whether Paseo knows of a newer one. Check asks again; What changed opens its notes.",
      vi: "Bản đang cài, và Paseo có biết bản mới hơn hay không. Check hỏi lại; What changed mở ghi chú thay đổi.",
    },
  ],
  overview: [
    {
      field: "The tags by the name",
      en: "The template the project runs, and where its team stands now.",
      vi: "Template project đang chạy, và tình trạng team lúc này.",
    },
    {
      field: "…'s chat · Show the team · Hold",
      en: "Opens the chat of the team's first agent; opens the Team tab of the project's workspace; holds the whole team so nothing new is seated and nothing lands, until Resume.",
      vi: "Mở chat của agent đầu tiên của team; mở tab Team của workspace; Hold giữ cả team lại (không seat thêm, không land) cho tới khi bấm Resume.",
    },
    {
      field: "Stuck",
      en: "What cannot go on by itself, each as the record says it. A first agent that could not be seated is seated again from the banner.",
      vi: "Những thứ không tự chạy tiếp được, ghi đúng theo record. Agent đầu tiên chưa seat được thì seat lại bằng nút trên banner.",
    },
    {
      field: "Needs you",
      en: "Questions, permissions, heads-ups and finished work that wait on you. Press a line to answer it in place.",
      vi: "Câu hỏi, xin quyền, cảnh báo và việc đã xong đang chờ bạn. Bấm vào dòng để trả lời tại chỗ.",
    },
    {
      field: "Team",
      en: "How many seats there are, how many work, wait, and how many pieces of work have landed; then every seat as a tree with one word for what it is doing. Press a seat to open its chat.",
      vi: "Có bao nhiêu seat, bao nhiêu đang làm, đang chờ, và bao nhiêu việc đã land; bên dưới là cây các seat kèm một chữ cho việc nó đang làm. Bấm một seat để mở chat của nó.",
    },
    {
      field: "Spent",
      en: "What the team's agents have cost so far, beside what the plan set aside.",
      vi: "Chi phí các agent của team tới giờ, cạnh mức plan đã dành ra.",
    },
    {
      field: "Lately",
      en: "The last things that happened and how long ago. The whole record is in the Team tab.",
      vi: "Những việc vừa xảy ra và cách đây bao lâu. Toàn bộ record nằm ở tab Team.",
    },
  ],
  agents: [
    {
      field: "Agent profile",
      en: "Each name this project's template gives, with the roles that use it.",
      vi: "Từng tên mà template của project này đặt, kèm các role dùng nó.",
    },
    {
      field: "Provider · Model · Effort",
      en: "What that name runs in this project. It starts as the default set on the Templates tab; what you pick here is this project's alone, and is drawn with a coloured edge.",
      vi: "Thứ tên đó chạy trong project này. Ban đầu là mặc định đặt ở tab Templates; chọn ở đây thì chỉ riêng project này đổi, và ô đó có viền màu.",
    },
    {
      field: "↺ at the end of a line",
      en: "Takes the line back to the default.",
      vi: "Đưa dòng đó về mặc định.",
    },
    {
      field: "When it holds",
      en: "For agents seated from then on. One already at work keeps what it started with.",
      vi: "Áp dụng cho agent được seat từ lúc đổi. Agent đang chạy giữ nguyên thứ nó khởi động.",
    },
  ],
  settings: [
    {
      field: "Template",
      en: "The template this project took when it was attached. It runs its own copy; Sync takes the installed one anew when that has changed.",
      vi: "Template project lấy lúc attach. Project chạy bản copy riêng của nó; khi bản đã cài thay đổi, Sync lấy lại bản mới.",
    },
    {
      field: "Base",
      en: "The branch the team's work lands on.",
      vi: "Nhánh mà việc của team được land vào.",
    },
    {
      field: "Remote",
      en: "Where the base is published, and where that points. With none, the project can be put on GitHub from here.",
      vi: "Nơi base được publish và địa chỉ của nó. Chưa có thì đưa project lên GitHub ngay tại đây.",
    },
    {
      field: "Checks",
      en: "Commands the plugin runs by itself on every piece of work handed back, in a fresh copy of that commit: a build, the tests. Their result is the evidence work is taken in on. Each is a name and the command it runs, with no shell.",
      vi: "Các lệnh plugin tự chạy trên mỗi việc được hand-back, trong một bản copy mới của commit đó: build, test... Kết quả là bằng chứng để nhận việc. Mỗi check gồm một tên và lệnh nó chạy, không qua shell.",
    },
    {
      field: "Left behind",
      en: "Worktrees, branches and agents this team no longer uses. Clean up goes to where they are removed.",
      vi: "Worktree, nhánh và agent team không còn dùng. Clean up dẫn tới chỗ xoá chúng.",
    },
    {
      field: "Remove",
      en: "Detaches the team: archives its agents, removes its worktrees and branches, keeps its record aside.",
      vi: "Gỡ team khỏi project: archive các agent, xoá worktree và nhánh của nó, giữ record lại.",
    },
  ],
};

const KEPT = "seatworks.info.language";

type Kept = { getItem(key: string): string | null; setItem(key: string, value: string): void };
/** What a browser keeps for a page between visits; a phone's app has none. */
const kept = (): Kept | undefined => (globalThis as { localStorage?: Kept }).localStorage;

/** The language the descriptions start in: the one picked before on this device, else the device's own. */
export function startLang(): Lang {
  try {
    const picked = kept()?.getItem(KEPT);
    if (picked === "en" || picked === "vi") return picked;
  } catch {
    // A device with no storage, as a phone's app is, starts from its own language each time.
  }
  return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("vi") ? "vi" : "en";
}

/** Keeps the language picked, where the device has somewhere to keep it. */
export function keepLang(lang: Lang): void {
  try {
    kept()?.setItem(KEPT, lang);
  } catch {
    // Kept for this visit only, where the device has no storage.
  }
}
