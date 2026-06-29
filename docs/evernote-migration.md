# 从印象笔记迁移到 EdgeEver

本文档说明如何把印象笔记笔记按笔记本逐个迁移到 EdgeEver。迁移工具通过 EdgeEver MCP 写入数据，适合需要可检查、可暂停、可回滚节奏的迁移场景。

普通产品用户可以直接在 EdgeEver Web 应用的 PC 端设置页中导入，不需要克隆 EdgeEver 源码仓库。仓库内脚本主要面向自托管管理员、开发者和需要命令行批处理的高级用户。

## 迁移前准备

如果你是普通产品用户，请在电脑浏览器中打开 EdgeEver，进入左侧“个人中心 / 我的”，使用“导入印象笔记”入口。移动端不开放该入口，因为 `.notes` 文件通常较大，且逐笔记本确认更适合 PC 操作。

1. 在 EdgeEver 左侧设置里创建一个 API Token。
2. Token 至少需要这些 scopes：
   - `read:notebooks`
   - `write:notebooks`
   - `write:memos`
3. 在印象笔记客户端中按笔记本分别导出 `.notes` 文件。如果你的客户端仍支持 `.enex`，也可以使用 `.enex`。
4. 把所有 `.notes` 或 `.enex` 文件放到同一个目录，文件名会作为 EdgeEver 笔记本名称，例如：

```text
evernote-export/
  工作项目.notes
  学习资料.notes
  生活记录.notes
```

建议一次只迁移一个账号的数据。迁移前保留原始 `.notes` / `.enex` 文件，不要在导入完成前删除印象笔记中的原笔记。

## 在 Web 应用中导入

1. 在电脑浏览器中打开 EdgeEver。
2. 进入左侧“个人中心 / 我的”。
3. 找到“导入印象笔记”。
4. 选择一个或多个 `.notes` / `.enex` 文件。
5. 检查导入计划中的笔记本数量和笔记数量。
6. 点击“开始导入”。
7. 每导完一个笔记本，先在 EdgeEver 中检查结果，再点击“确认结果，继续下一个”。

Web 导入会强制校验时间字段：如果导出文件中某条笔记缺少合法的创建时间或更新时间，导入会停止；如果 EdgeEver 创建后的 `createdAt` 或 `updatedAt` 与印象笔记原始时间不一致，导入也会停止并显示对应笔记标题。

## 使用命令行脚本

命令行脚本适合自托管管理员或开发者批量处理迁移。普通产品用户优先使用上面的 Web 导入入口。

本节命令需要在 EdgeEver 项目源码目录中运行，并且本机已经安装 Bun。这是当前自托管/开发者迁移工具的要求，不是长期面向普通用户的理想交互。

可以直接使用环境变量：

```sh
EDGEEVER_URL=https://你的域名 \
EDGEEVER_TOKEN=<api-token> \
bun run import:evernote -- --input ./evernote-export --dry-run
```

也可以先保存为本机 profile：

```sh
bun run cli -- profile set prod --url https://你的域名 --token <api-token>
bun run import:evernote -- --profile prod --input ./evernote-export --dry-run
```

## 先生成导入计划

正式导入前先 dry-run：

```sh
bun run import:evernote -- --profile prod --input ./evernote-export --dry-run
```

检查输出里的笔记本数量、笔记数量和导出文件路径是否符合预期。如果发现笔记本名称不对，先修改导出文件名再重新 dry-run。

如果 dry-run 提示 `encoding="base64:aes"`，说明这个 `.notes` 文件是印象笔记加密导出文件，EdgeEver 不能直接读取其中内容。此时不要正式导入，改用未加密导出、HTML 导出，或使用可信的备份/转换工具先转换为可读的 ENEX/Markdown，并确认转换结果仍保留原始创建时间和更新时间。

## 正式导入

确认计划无误后执行：

```sh
bun run import:evernote -- --profile prod --input ./evernote-export
```

导入流程会按文件名排序逐个处理笔记本：

1. 如果 EdgeEver 已有同名根笔记本，工具会复用它。
2. 如果没有同名根笔记本，工具会创建新笔记本。
3. 工具逐条创建笔记，并保留标题、Markdown 内容、标签、创建时间和更新时间。
4. 每导完一个笔记本，工具会输出本次创建条数和该笔记本的计数变化。
5. 你需要打开 EdgeEver 检查结果，然后在终端输入 `yes` 才会继续下一个笔记本。

如果检查结果不符合预期，不要输入 `yes`。工具会停止，已经导入的笔记会保留在 EdgeEver 中，方便你先检查或手动清理。

迁移工具会强制校验时间字段：如果导出文件中某条笔记缺少合法的创建时间或更新时间，导入会停止；如果 EdgeEver 创建后的 `createdAt` 或 `updatedAt` 与印象笔记原始时间不一致，导入也会停止并显示对应笔记标题。

## 无人值守导入

如果已经在测试环境验证过，也可以跳过每个笔记本后的确认：

```sh
bun run import:evernote -- --profile prod --input ./evernote-export --yes
```

不建议第一次迁移时使用 `--yes`。

## 附件和图片说明

当前迁移工具主要迁移笔记文本内容、标题、标签和时间。印象笔记导出文件中的图片和附件会被转换成 `evernote-resource:<hash>` 形式的占位链接，便于后续定位原始资源。

建议处理方式：

1. 先完成文本迁移，确认笔记数量和主要内容无误。
2. 保留原始 `.notes` / `.enex` 文件作为附件来源。
3. 对重要笔记中的图片或附件，后续可通过 EdgeEver 的资源上传能力补传到对应笔记。

## 常见问题

### 导入中断了怎么办？

重新运行同一条命令即可。工具会复用同名根笔记本，但不会自动去重已经导入过的笔记。为了避免重复，建议先在 EdgeEver 中检查最后一个已导入笔记本，必要时手动清理后再继续。

### 为什么要求一个笔记本一个导出文件？

印象笔记导出文件本身不稳定携带原始笔记本层级。用“一个笔记本一个导出文件”的方式，可以让文件名成为明确的目标笔记本名称，也方便每导完一个笔记本后人工确认。

### 能保留印象笔记的创建和更新时间吗？

必须保留。迁移工具会读取导出文件中的 `created` 和 `updated` 字段，并通过 EdgeEver MCP 写入 `createdAt` 和 `updatedAt`。工具还会在每条笔记创建后校验 EdgeEver 返回的时间；只要创建时间或更新时间不一致，就会停止导入，避免继续写入有问题的数据。

### 笔记格式会完全一致吗？

不会完全一致。工具会把印象笔记的 XHTML 内容转换为 Markdown，再交给 EdgeEver 保存。常规标题、段落、列表、代码块、链接和待办项会尽量保留；复杂表格、加密块、特殊样式和附件需要迁移后抽查。
