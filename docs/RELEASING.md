# 发版步骤

目标有两个：**npm 上的东西和仓库一致**，以及**从 GitHub 的链接装到的永远是最新版**。
后者靠三件事成立，缺一不可。

## 1. 让 `main` 停在发布提交上

```sh
npm version patch --message "Release x.y.z"   # 在 main 上产生发布提交 + tag
git push --follow-tags
```

**不要在这之后往 `main` 推别的提交** —— 从源码安装（`git+https://…git`）取的是 `main`
的当前提交，README 里承诺的就是"`main` HEAD 等于最新 tag"。中间夹了未发布的提交，这个承诺就不成立。

## 2. 给每个 Release 挂上**不带版本号**的预构建包

安装链接写的是：

```
https://github.com/Nethur-auro/dsh-multi-root-explorer/releases/latest/download/dsh-multi-root-explorer.tgz
```

`latest` 在**请求时**解析，但**文件名是照字面取的**。所以资产名必须永远叫
`dsh-multi-root-explorer.tgz`：一旦带上版本号（`…-0.1.5.tgz`），这个链接在下次发版当天
就会 404，而且不会有任何人察觉。

```sh
npm pack --pack-destination /tmp/dwx
mv /tmp/dwx/dsh-multi-root-explorer-<版本>.tgz /tmp/dwx/dsh-multi-root-explorer.tgz
gh release upload v<版本> /tmp/dwx/dsh-multi-root-explorer.tgz --clobber
```

## 3. npm 上发同一份内容

```sh
npm publish
```

条目规格写**包名**时，包管理器取的是 `dist-tags.latest`，所以这一步是"永远最新"的另一种保证。

## 发完自查

```sh
gh release view v<版本> --json assets --jq '.assets[].name'
# 应含：dsh-multi-root-explorer.tgz

Invoke-WebRequest -Method Head https://github.com/Nethur-auro/dsh-multi-root-explorer/releases/latest/download/dsh-multi-root-explorer.tgz
# 应返回 200 / 302，且 Content-Length 与本地打包一致
```

## 关于截图

`assets/sidebar.png` 会同时出现在**两个 README** 和**市场详情页**（由 `screenshots.json`
声明）。截图里**不要出现真实的目录名或会话标题** —— 它们会被公开发布。
需要更新时，用一个临时工作区录一张干净图，替换后按上面流程发一个补丁版。
