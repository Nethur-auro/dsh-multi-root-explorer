# Workspace Explorer 七项问题修复方案

- 状态：复审通过，源码已实施。2026-10-01 用户授权调用子代理修改插件；真实会话操作、重启及卸载演练仍不属于已完成验证。
- 范围：语言、固定工作区与完整目录树、子目录更多菜单、浮层定位、原生归档、目录内新会话、卸载后原生平铺回退。
- 依据：[初版设计](<docs/superpowers/specs/2026-09-30-dsh-workspace-explorer-design.md>)、[历史核验报告](<docs/superpowers/specs/2026-09-30-dsh-workspace-explorer-verification.md>)、[新会话设计](<docs/superpowers/specs/2026-09-30-workspace-explorer-create-conversation-design.md>)、当前代码及本次 Cordis Inspect 实时只读合同。
- 本文中的文件链接均相对工作区根目录。新需求与旧方案冲突时，以本文为准；旧报告的“已验证”不代表本轮已经做过实机回归。

## 一、核心决定

**插件负责树形展示，DSH 原生负责会话、归档和可独立使用的工作区登记。两套数据不混为一谈。**

1. 用户添加的工作区是固定根，不因会话增减自动升级、降级、改名或消失。
2. 两个选项卡都能逐层浏览所有未被隐藏且可访问的子文件夹，包括没有对话的文件夹。对话页只显示文件夹与会话，资源页显示文件夹与文件。完整可浏览不等于启动时展开或递归扫描所有目录。
3. 同一目录在插件树中只有一个位置。父 A 已导入时，再添加 A/a，只展开并定位 A 下的 a。
4. 对话由 DSH 创建、保存；插件卸载、停用、清除插件配置均不得删除、移动或重新编码会话。
5. **原生回退准备在插件工作期间完成，不依赖卸载钩子。** 每个有普通用户会话的真实 cwd 对应原生独立工作区；插件启用时仍可以把它们呈现为父子目录树，停用后由原生界面平铺。
6. 归档与永久删除是两个独立动作。归档仅走原生接口，不调用当前插件的文件删除路由。

## 二、问题定位与修复对照

| # | 当前实现证据 | 修复方向 |
|---|---|---|
| 1 | [client.js:210–225](<plugins/dsh-workspace-explorer/lib/client.js#L210-L225>) 从 DOM/browser 选词典；[client.js:876–885](<plugins/dsh-workspace-explorer/lib/client.js#L876-L885>) 只在构造时执行一次，启动订阅没有 locale | 使用 DSH locale 快照并订阅后续变化；不自行覆盖全局语言 |
| 2 | [client.js:640–699](<plugins/dsh-workspace-explorer/lib/client.js#L640-L699>) 把 roots 与 cwd 混合求公共祖先，只沿 session 路径生成目录；[client.js:2376–2387](<plugins/dsh-workspace-explorer/lib/client.js#L2376-L2387>) 无会话即只显示提示 | 固定根 + 单层文件系统目录缓存 + 会话索引合并；取消会话驱动的根重算 |
| 3 | [对话子目录组件](<plugins/dsh-workspace-explorer/lib/client.js#L2086-L2123>)、[资源子目录组件](<plugins/dsh-workspace-explorer/lib/client.js#L2167-L2193>) 有右键但无尾部按钮 | 统一目录行与目录菜单，所有层级增加“···” |
| 4 | [client.js:1018–1061](<plugins/dsh-workspace-explorer/lib/client.js#L1018-L1061>) 使用面板相对坐标和估算尺寸；[样式](<plugins/dsh-workspace-explorer/lib/client.js#L1631-L1666>) 根没有定位上下文，而浮层 absolute | 改统一视口坐标与真实尺寸测量，默认左下角锚定指针、向右上展开 |
| 5 | [client.js:831–860](<plugins/dsh-workspace-explorer/lib/client.js#L831-L860>) 只有已归档会话的恢复项，无归档入口 | 增加原生归档、已归档入口和恢复流程 |
| 6 | [client.js:1413–1534](<plugins/dsh-workspace-explorer/lib/client.js#L1413-L1534>) 已有创建/等待/命名，但无点击互斥、明确耐久屏障、原生登记保证 | 重构为有稳定操作 ID 的创建状态机；分别确认创建、耐久、原生归属与打开 |
| 7 | [client.js:2647–2667](<plugins/dsh-workspace-explorer/lib/client.js#L2647-L2667>) 只通过 slot 遮蔽恢复原生 UI；插件 roots 不等于原生登记 | 全量历史核对与增量原生登记；正常运行期间即具备卸载独立性 |

说明：上述第 2 项能解释“空目录被删掉”的视觉表现，但当前证据是没有生成目录节点，**不是已证明磁盘目录被删除**。第 4 项坐标模型存在明确问题，但像素偏移仍需浏览器实测确认。

## 三、逐项设计

### 1. 语言稳定跟随 DSH

已通过实时 Inspect 确认：客户端 `locale.getLocale()` / `getSnapshot()` 返回 `{ active, locales, revision }`，`locale.subscribe(fn)` 返回取消订阅函数；`setLocale(id)` 是持久化用户语言的唯一写入口。

- 初始化、每次订阅回调均以 `snapshot.active` 选择词典，并同时更新时间格式语言和 React 状态。
- 等待 locale 服务可用后再初始化依赖语言的控制器；实现时通过 Cordis 依赖声明保证可用性，不仅在构造时可选读取一次。
- 插件不调用 `setLocale('zh')` 强行改全局偏好，不建立与 DSH 冲突的私有语言设置。
- 清理构造时的 DOM 语言缓存；缺少服务的兼容版本要明确降级，不让默认英文永久锁定。
- 已打开菜单中的字符串随语言重新生成，或语言切换时关闭菜单；错误提示与创建部分成功提示全部使用词典，不硬编码中文。
- 若实测 DSH 全局偏好本身重启丢失，另列为宿主缺陷；不能用插件无条件设中文掩盖。

### 2. 固定工作区、目录完整性与重复导入

#### 2.1 数据分层

- `roots`：用户显式添加、持久化保存的根目录，保留 id、label、稳定顺序；已有 roots 全部视为固定根。
- `directoryLevels`：按 root 身份、规范路径、过滤条件缓存的单层目录列表，状态为 unloaded/loading/ready/error；支持分页。
- `sessionsByCwd`：DSH 会话按规范化真实 cwd 建索引，不决定根的身份。
- `nativeWorkspaces`：DSH 原生登记及会话归属，只用于互操作和卸载回退，不能自动覆盖插件 roots。

树节点采用“磁盘子目录 ∪ 会话路径所需节点”。因此暂时不存在/无权限的目录仍可作为带错误标记的历史会话节点显示，不因扫描失败丢失会话。零会话只显示计数 0，不删目录。

根外的历史对话以独立 cwd 锚点放在“其他会话目录”区域，不再提升共同祖先，也不隐式授权扫描这些目录的所有磁盘内容。没有 cwd 的会话保留“无工作目录”。即使没有插件 roots，也不能让 [当前空根早退逻辑](<plugins/dsh-workspace-explorer/lib/client.js#L2447-L2459>) 隐藏所有历史对话。

#### 2.2 添加规则（Host 最终裁定）

拟扩展添加响应，在现有 state 之外返回 `action`（added/reveal-existing/reveal-descendant）、`ownerRootId`、`targetPath`；这些是拟新增插件协议，不是现有 DSH API。

| 情形 | 行为 |
|---|---|
| 首次添加 A | 原子持久化 A，展示为固定根并展开 |
| 再添加 A 或其大小写/分隔符别名 | 不新增，定位已有 A |
| 已有 A，再添加 A/a | 不写入重复 root；逐层加载祖先、展开、滚动并高亮 a；当前对话不切换 |
| 已有 a，再添加其父 A | 不自动降级 a；提示“合并到父工作区 / 保留当前结构并取消导入”；确认合并才迁移 root 与展开状态 |
| 不相交目录 | 新增独立固定根，保持用户顺序 |
| 目录缺失/无权限 | 拒绝新的无效导入并说明；已有根仍保留、标记异常 |

目录被用户隐藏时，再显式导入该目录要提示恢复显示；不得无声成功但仍不可见。并发、多窗口添加必须在 Host 配置变更队列内检查父子关系，不能仅依赖客户端快照。

已有重叠 roots 升级时先备份，展示合并预览；经确认保留父根、迁移子根标签为目录显示别名并迁移展开状态。没有确认前不丢配置，可将子根作为同一物理节点的登记标记展示，避免渲染重复子树。

#### 2.3 懒加载、过滤与分页

- 对话页展开目录时调用单层枚举，并仅合并目录；资源页复用缓存显示目录与文件。
- 首次恢复展开状态、切换选项卡、刷新清缓存后，要自动补载所有可见已展开层，不能仅在点击展开时加载，否则会永久停留“正在加载”。
- 请求带代次标记；移除根、切换隐藏偏好、刷新后的旧响应不得覆盖新树。按目录合并并发请求，限制并发数。
- 当前 [listing.js:121–126](<plugins/dsh-workspace-explorer/lib/host/listing.js#L121-L126>) 只返回前 3000 项，不能满足“完整”。增加有稳定排序的分页及“加载更多”；扫描条件或目录版本变化时重新分页，防重漏。
- 默认隐藏精确名称 `dsh-acl-recovery`；允许“显示隐藏项”恢复。不要隐藏所有带 `dsh` 字样的普通目录。已有 .git/.dsh/node_modules 策略保留并明确文案。
- 用户手动隐藏与默认隐藏分开存储；隐藏只改变插件显示，不归档、不删原生登记。显式固定根优先于默认名称过滤。隐藏目录中的会话可从“已隐藏目录”恢复入口找到。
- 路径比较统一 Windows 大小写、分隔符、盘符根、UNC 与段边界；A 不包含 A2。磁盘访问同时校验规范路径及 root/target 的 realpath，防中间链接、junction 和 `..` 越界，设置环路检测。路径展示与身份可分开保存。

### 3. 子文件夹“···”

抽取共享 DirectoryRow，根、对话页子目录、资源页子目录使用同一 MenuBuilder：

- 开启新会话；在系统资源管理器中打开；可选隐藏/恢复显示。
- 只有显式 root 提供“重命名工作区显示名称、移除工作区登记”；普通子目录不能调用删除 root。
- 所有子目录右端提供“···”，默认可见低强调，hover/focus 时增强；不依赖必须右键才能发现功能。
- 右键与“···”操作完全一致；按钮阻止点击和键盘事件冒泡，不触发展开/折叠。
- 支持 Enter/Space、Shift+F10、Escape、菜单焦点移动与关闭后回焦；补 `aria-haspopup`、`aria-expanded` 和可访问标签。

### 4. 浮层指针锚定与边界处理

统一菜单与会话悬停卡的定位函数。右键使用 `clientX/clientY`；悬停使用最近的指针位置（保留约 320ms 延迟）；键盘打开菜单使用触发按钮的边界作为锚点。

默认矩形：`left = anchorX`、`top = anchorY - measuredHeight`，即**左下角在指针处，向右上方延伸**。悬停卡可留 2–4px 小间隔避免覆盖鼠标，菜单不叠加不明偏移。

实现要求：

1. 浮层位于不受侧栏 overflow/transform 影响的顶层容器，使用视口坐标与 fixed；不能只把当前 absolute 改 fixed 而仍留在有 transform 的祖先里。
2. 首次挂载测量真实宽高（含 padding、边框、分隔线、文本换行），定位完成后展示，尺寸变化重新计算。
3. 上方不够改向右下；右侧不足改向左；仍不足时按视口 8px 安全边距约束并允许内部滚动。边界降级时不能强求指针角点与完整可见同时成立。
4. 对树/外层滚动、窗口 resize、缩放、节点卸载统一关闭或重新定位；打开菜单先取消 hover 计时器并关闭悬停卡。
5. 优先核查原生 overlay/portal 能力。本次 Builtin 只确认 React，**未确认可动态 require react-dom**，不得直接加未获支持的依赖。若无可用原生浮层，使用浏览器 top-layer popover（先特性检测）或验证过的顶层宿主；隔离事件并在 dispose 清理。

### 5. 恢复原生归档

已确认 `uiWorkspace.archiveSession(id, options?)` 会归档并清理当前选择；`uiWorkspace.unarchiveSession(id)` 恢复。底层 `workspaces.archiveSession` 和 Host `workspaceRegistry.archiveSession` 均存在。

- 未归档会话菜单增加“归档”，优先调用 uiWorkspace 版本保持原生导航行为。
- 成功后从普通对话列表隐藏，在“已归档”入口按 cwd 分组可查看、恢复；记录以原生 archived 集合为准，不新建插件私有归档真相。
- 运行中会话默认拒绝并展示原因；只有用户额外确认才可传 `stopActivity: true`，不可静默终止任务。
- 恢复归档后回到原路径；空目录和固定根不受归档影响。
- 原生合同还规定归档会移除置顶，保持该语义，不自行恢复一个原生已取消的置顶状态。
- 已有永久删除功能本轮不扩展、不作为归档替代；保留明确危险隔离与二次确认。其绕过原生存储的风险仍在，不能声称此次七项修复顺带解决了该风险。

### 6. 目录下创建原生会话并保证保留

旧代码已有菜单与 Remote 创建，问题是完成条件不够严格，不能仅“再加一个入口”。菜单统一命名为“开启新会话”。

#### 6.1 当前合同与耐久性边界

本次 Inspect 确认 Host `sessionController.create` 请求包含 `workspaceId? / cwd? / sessionId? / agentPreset?`，返回 `{ sessionId, agentPreset? }`，描述支持创建或幂等接纳普通会话。标题修改返回 `{ title, seq }`。

重要：`sessionPersistence.create` 只保证本进程可见，后端可以延迟物理写入；同进程 list/stat 可见不等于重启后仍在。`SessionHandle.flush()` 是单 handle 强制物化；`sessionPersistence.flush()` 是所有活跃写 handle 的耐久屏障。因此 [旧新会话设计中的落盘推断](<docs/superpowers/specs/2026-09-30-workspace-explorer-create-conversation-design.md#L35-L41>) 需要被更严格的完成标准替代。

#### 6.2 创建状态机

`idle → validating → ensuring-native-workspace → creating → naming/durability → verifying-membership → opening → completed/partial-failure`

1. 校验目标目录存在、可访问且处于已授权范围；失效目录不能悄悄回退到当前 cwd。
2. 通过官方原生登记确保精确 cwd 有 workspace。此登记不增加插件树根。
3. 每次明确创建意图生成稳定操作标识，并锁定对应按钮防双击。若采用指定 `sessionId` 进行幂等重试，先核验 Remote 编码、ID 校验和重用时 cwd/workspace 一致性；它不是随意新增的 `requestId` 字段。
4. 创建仅调用官方 sessionController/Remote；拿到 ID 后后续失败绝不创建替代会话。复审进一步核验目标版本实现：`workspaceId` 与 `cwd` 互斥，不能同时传入。先完成精确 cwd 的原生登记，再仅传 `workspaceId` 与稳定 `sessionId`，并校验返回 Session.header.cwd 与目标规范目录一致。
5. 命名为“新对话”（随当前语言）；失败提示“已创建，但命名失败”，保留原 ID。
6. 耐久确认与标题展示分开：已进一步确认 Host `sessions.get(sessionId)` 取得原生 Session，`await sessions.flush(session)` 是官方指定的定向耐久 checkpoint 入口。必须等待无异常且返回 `true`（至少一个耐久监听参与）；Session 不存在、返回 `false` 或抛错均不得宣称已保存。采用此定向路径，不需要全局 `sessionPersistence.flush()`，**不得 reopen write 抢锁，也不得手工派发 session/flush 事件**。注意 Host `sessions.create` 仅建内存 Session，不能替代前述 `sessionController.create`。定向 checkpoint 对命名空会话的物化仍须通过跨进程验收。
7. 校验原生 workspace 的 sessionIds 与该 ID/cwd 匹配，等待客户端投影后打开并定位树节点。超时显示 ID 和“重试打开/同步”，不再发起创建。
8. 已创建但耐久确认失败时，明确显示“已创建，保存尚未确认”，不能显示完成，也不自动删会话。

可把步骤 1–6 集中为插件受限 Host 协调路由，调用官方 Service，避免仅靠浏览器定时重试。该路由保留来源校验、目录边界与有限重试；不接受任意会话存储路径，不写私有会话文件，不插入伪造用户消息触发保存。

保留保证适用于完成耐久确认的会话，包含尚未发送消息的命名空会话。点击瞬间断电或创建仍在进行时不作无条件承诺；重连根据稳定 ID 核对，避免重复。

### 7. 卸载后按有会话的目录平铺

#### 7.1 目标展示

插件启用时：

```text
A（固定工作区）
├─ a
│  └─ 会话 1
└─ b（无会话，仍可浏览）
B（固定工作区）
└─ 会话 2
```

插件移除后由原生显示：

```text
a  [A/a] → 会话 1
B  [B]   → 会话 2
```

如果 A 本身也有会话，A 与 A/a 并列。只作为容器且从未有会话的 b 不必导出。用户已有的其他原生工作区不删除，因此回退界面允许保留这些额外原生项。

#### 7.2 原生登记桥接

已确认 Host `workspaceRegistry` 是耐久登记服务：启动从 canonical-cwd header 索引建立会话归属；`create(path, title?)` 经 realpath 验证已存在目录，同路径幂等复用；`list()` 的 sessionIds 已经过 cwd 索引过滤。客户端对应 `workspaces.create({path})`。

- 首次升级通过 `sessionQuery.listSessions(signal?)` 的完整 logical corpus 枚举历史与实时会话，不只看当前活跃 Agent 或尚在加载的客户端列表。
- 过滤子代理（header 的 parentSession/origin；客户端用对应投影字段），保留普通用户会话；按精确 canonical cwd 去重。无 cwd 单独列例外。
- 为每个有会话的 cwd 确保原生登记，核验会话归属；不能只登记父 A 并假定它包含 A/a 会话，也不能靠改会话 cwd 达成分组。
- 后续在插件新建完成、历史索引变更、重连时增量核对；Host 做有界批处理与幂等排队，避免多页面重复登记。事件名/事件模式实施前再 Inspect，不凭空新增监听名。
- 新原生登记默认 prepend，批处理应按确定顺序并通过原生排序能力安放；保留用户已有原生标题/相对顺序，不重命名已有工作区。
- 清除插件配置、移除插件根、隐藏目录都不删除这些原生工作区；这些是会话可访问性的持久登记，不是插件缓存。
- 先提供待补登记目录数、异常数与说明；完成历史回填前显示“原生回退准备中/部分失败”，不报告完全兼容。后续用户主动在原生界面删除登记应尊重，不做无条件循环重建；通过显式核对修复入口和同步记账区分新会话与用户删除。

#### 7.3 不能假装实现的边界

- 已归档会话保持归档；卸载后由原生归档入口访问，不为了“文件夹下显示所有对话”自动取消归档。若目录只有归档会话，登记可保留，但普通列表为空符合原生语义。
- cwd 已不存在时原生 create 会拒绝；保留历史会话与异常报告，不创建假目录。无 cwd 不能伪造文件夹锚点。要对这些情况实现完全相同展示，需要宿主提供失效工作区能力，不能写入私有 registry 绕过。
- 原生普通列表是否隐藏命名空会话、何时刷新 sessionIds，必须通过实机验收；只有登记成功不能证明最终可见。
- 当前没有已确认的可靠卸载清理钩子，dispose 只负责取消订阅/释放 UI，不承担必须完成的数据迁移。同步完成后直接停用/删除插件也不应丢失回退能力。

## 四、持久化与迁移

建议插件配置 schema 升为 v2：保留 roots、展开状态、隐藏偏好；增加目录显示别名/排序及必要的迁移标记。所有会话内容、归档、原生 workspace 真相仍归 DSH 所有。桥接进度只是可重建的操作记录，不是会话索引的唯一来源。

- [store.js](<plugins/dsh-workspace-explorer/lib/host/store.js>) 增加显式 v1→v2 分支；未知更高版本拒绝写回，防降级吞字段。
- 迁移前备份原配置、原子替换；损坏配置提示而不是静默把空配置覆盖旧文件。
- 展开 key 统一按规范目录身份生成，迁移旧 root:/conv:/res:，保留选项卡的合理独立展开状态；移除某 root 不应误删共享目录的别名和历史状态。
- 保存采用串行变更/修订检查，避免展开偏好请求覆盖刚添加的 roots；失败可见、允许重试。
- 新版回退旧插件前使用配置备份，不回滚/删除已产生的原生会话与登记。

## 五、实施拆分与顺序

| 阶段 | 工作 | 主要修改位置 | 完成门槛 |
|---|---|---|---|
| P0 | 新建空会话耐久、cwd 原生归属、卸载平铺原型验证 | [Host 入口](<plugins/dsh-workspace-explorer/lib/index.js>)、[路由](<plugins/dsh-workspace-explorer/lib/host/routes.js>)；拟新增原生桥接模块 | 隔离测试 profile 中关闭/重启后仍可访问；失败则不宣称 6/7 已实现 |
| P1 | v2 配置、固定根、父子导入、枚举分页、安全路径与缓存 | [store.js](<plugins/dsh-workspace-explorer/lib/host/store.js>)、[paths.js](<plugins/dsh-workspace-explorer/lib/host/paths.js>)、[listing.js](<plugins/dsh-workspace-explorer/lib/host/listing.js>)、[client.js](<plugins/dsh-workspace-explorer/lib/client.js>) | 空目录、根固定、重复导入及分页自动测试通过 |
| P2 | 语言订阅、共享目录菜单与可访问性、统一浮层 | [client.js](<plugins/dsh-workspace-explorer/lib/client.js>) | 重启语言、键盘菜单、不同缩放/侧栏位置实测通过 |
| P3 | 原生归档、新建状态机、历史回填与增量桥接 | [client.js](<plugins/dsh-workspace-explorer/lib/client.js>)、[routes.js](<plugins/dsh-workspace-explorer/lib/host/routes.js>)；拟新增 Host 协调模块 | 部分失败、归档拒绝、幂等重试、断连恢复通过 |
| P4 | 回归、迁移说明、停用/卸载演练 | [selftest.mjs](<plugins/dsh-workspace-explorer/test/selftest.mjs>)、[tree.test.mjs](<plugins/dsh-workspace-explorer/test/tree.test.mjs>)、[中文说明](<plugins/dsh-workspace-explorer/README.zh.md>)、[英文说明](<plugins/dsh-workspace-explorer/README.md>) | 下列验收矩阵全通过或明确列出不支持边界 |

不必一次拆开整个客户端大文件，但应先抽出可测试的树模型、定位函数、菜单生成器和创建状态机。旧 [tree.test.mjs:118–165](<plugins/dsh-workspace-explorer/test/tree.test.mjs#L118-L165>) 把公共祖先提升视为正确行为，必须改写预期，而非为了旧测试通过保留错误需求。

## 六、验收矩阵

| 编号 | 操作 | 必须结果 |
|---|---|---|
| L1 | DSH 设置中文，页面刷新、Host 重启、应用重启各三次 | 插件跟随中文；不是自行把整个 DSH 改中文 |
| L2 | 不重启切中/英文；延迟加载 locale | 菜单、设置、错误提示、时间格式同步；无永久英文缓存 |
| T1 | 导入 A，A/a 有会话，A/b 没有会话 | A 固定；两页均能浏览 a/b；对话页不出现普通文件 |
| T2 | 增加/归档/删除最后一条会话、同步短暂无会话快照 | 不降级、不删空目录、不改变 roots |
| T3 | A 已导入，再导入 A/a（大小写、末尾斜杠变体） | roots 数不变；定位高亮同一 a；主栏会话不变 |
| T4 | 先子后父、旧重叠 roots、两个页面并发导入 | 合并规则明确且不重复渲染，不无声丢标签/展开状态 |
| T5 | 目录 >3000 项、刷新、恢复展开、请求乱序 | 可加载全部可见目录；无长期 loading、旧响应覆盖或重复分页 |
| T6 | 隐藏项、dsh-acl-recovery、普通名称含 dsh 的目录 | 默认隐藏精确特殊名；恢复可达；普通目录不误藏 |
| T7 | 中文/空格、盘符根、UNC、A/A2、中间 junction 越界、环路 | 正确定位；越界/环路不可浏览；失败不影响其他根 |
| M1 | 各层目录右键、点击···、键盘打开 | 菜单一致；按钮不折叠目录；普通子目录无错误移除 root 操作 |
| F1 | 长列表上下位置、侧栏收缩、视口四角、滚动及 100%/125%/150% 缩放 | 有空间时左下角对准指针，向右上；边缘合理翻转，不裁切、不明显跳位 |
| F2 | hover 后马上右键、切语言、resize | 卡与菜单不重叠残留，尺寸更新后锚点仍正确 |
| A1 | 空闲会话归档、重启、恢复 | 原生与插件同状态；归档不删日志；恢复回原目录 |
| A2 | 运行中会话归档拒绝/确认停止 | 未确认不停止工作；确认后遵守原生归档行为 |
| C1 | 右键 a 开启新会话，不发送消息 | 精确 cwd=a，原生 ID、命名及耐久确认成功，切入主栏 |
| C2 | 双击、丢响应、列表延迟、命名失败、flush 失败、导航被后续操作替代 | 不创建重复替代会话；错误区分；新导航不被旧异步结果夺回 |
| U1 | 历史冷会话 + 插件新会话分别在 A、A/a、B | 原生独立登记可核验；插件中仍是固定根树 |
| U2 | 同步完成后直接停用、卸载、刷新、重启 Host | 有会话目录原生平铺；对应会话可打开；插件日志/配置不是必需条件 |
| U3 | 插件隐藏目录、已归档会话、只含归档的 cwd | 隐藏不删原生登记；归档不被自动取消，原生归档入口可访问 |
| U4 | 缺失目录、无 cwd、权限拒绝、已有自定义原生标题 | 不伪造目录或 cwd；不覆盖标题；明确报告例外 |
| R1 | 清除插件配置、移除 root、版本回滚 | 不删项目、不删会话、不删承载历史的原生登记 |

测试分三层：纯逻辑单测；Host 临时目录/隔离 profile 集成；现有 GUI 实机操作。现有测试命令见 [package.json:38–40](<plugins/dsh-workspace-explorer/package.json#L38-L40>)，仅运行原测试不能替代新验收。

强制崩溃/断电模拟只能在获得授权的隔离测试 profile 中进行，不对用户正在工作的实例强制终止。正常退出可能自动 flush，因此“正常重启后仍在”不能单独证明 create 返回时已即时落盘。

## 七、复审修订（2026-10-01）

复审结论为可执行，但区分“源码实施完成”和“已通过实际宿主发布验收”：P0 的原生合同复核与 mock 集成测试先完成即可开展源码修改；跨进程空会话耐久、实际卸载恢复仍是发布验收门槛，不得用 mock 代替。没有授权不重启正在工作的 Host，不创建/归档用户真实会话。

- 创建由受限 Host 路由统一协调，确定使用 `sessions.get` + `sessions.flush` 定向屏障，而不是全局 flush。
- 同一创建意图使用 `operationId` 作为**插件私有路由**幂等键并持久记录原生 Session ID。它不是 DSH Remote 请求字段；原生请求仍仅使用受支持的 `sessionId`。
- 部分失败结果保留 Session ID、耐久状态及原生归属状态，客户端允许针对同一意图继续同步/打开，禁止以新 ID 代替。
- 浮层使用浏览器 top-layer Popover 实现路线，先检查支持度；不引入未经确认的 react-dom 动态模块。
- 历史原生桥接必须可观察、可重试，首次读取失败不能写“历史已处理”标记。同步完成前不能宣称卸载兼容准备完毕。
- 目录分页用带目录版本的 opaque cursor；目录内容变化返回 `stale-cursor`，客户端从首页重新加载，不能拼接旧页与新页。
- 新版的目录枚举和新建目录授权需覆盖中间 junction/symlink，而不只是最终路径段。其他会话目录仅授权其精确 cwd，新建不能借此访问任意后代。

## 八、交付和本轮证据边界

本次已完成静态定位、客户端 locale/workspaces/uiWorkspace 合同与 Host workspaceRegistry/sessionController/sessions/sessionPersistence/sessionQuery 只读核验，并已实施插件源码修复及合同 mock 测试；未操作真实归档/创建/卸载、未在目标 GUI 做 DOM 像素验证。

指定安装路径内的 app.asar 是归档文件，不能作为普通目录读取其 dsh 子路径；本轮未提取或声称读过当前宿主实现。第 6/7 项仍以 P0 实机验证为发布门槛。

实施时不启动替代服务器。验证使用现有 GUI `http://127.0.0.1:19387`；客户端热更新只有核实同 checkout 的 `pnpm run dev:web` 构建 watcher 后才可承诺。Host 新路由按实际运行机制重启加载；涉及 shell/plain packages 则重建对应 Web 产物并刷新现有页面。旧核验报告中笼统的“客户端自动热重载”不能作为此次上线依据。

最终交付应包含：修复插件、配置迁移与原生回填说明、新增测试、逐项实测记录，以及仍受宿主限制的例外清单。未通过“空会话保存”及“卸载后原生可访问”测试时，不标记这两项完成。
