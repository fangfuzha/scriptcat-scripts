# AGENTS.md

本仓库是脚本猫用户脚本的合集仓库，会持续承载多个脚本。
本文件是给 AI 助手与协作者的强制规范，新增脚本与改动前请先阅读。

当前仓库暂无具体脚本，只有框架与构建链路；新增第一个脚本时按下文步骤执行。

## 目录结构

```
scripts/
  <脚本名>/
    src/                  脚本源码，入口固定为 src/main.ts
    script.config.json    脚本元数据声明（构建时生成 userscript 头部）
    README.md             面向最终使用者的说明，构建时复制到 dist
  <另一个脚本名>/
    ...
src/
  shared/                 多脚本共用的代码
    storage.ts            CAT_fileStorage 存储层
tools/
  build.mjs               构建脚本
dist/
  <脚本名>/               构建产物，一脚本一文件夹
    <脚本名>.user.js      完整脚本
    <脚本名>.meta.js      仅元数据，供脚本猫检查更新
    README.md             面向使用者的说明
  fangfuzha脚本合集.user.sub.js   订阅合集文件
```

## 强制规范

### 1. dist 下一个脚本一个文件夹

`dist/<脚本名>/` 是唯一的产物存放位置，不允许把脚本产物直接平铺在 `dist/` 根下。
文件夹名、`.user.js` 文件名、`.meta.js` 文件名三者必须与脚本名完全一致，
这样脚本猫的 `user.js => meta.js` 更新推导规则才能生效。

### 2. 每个脚本必须有 README.md

每个 `scripts/<脚本名>/` 下必须有 `README.md`，构建时会被复制到 `dist/<脚本名>/README.md`。

README 面向**最终使用者**，写清楚：

- 这个脚本能做什么
- 怎么安装（给出可直接点击的安装链接）
- 怎么使用与配置
- 常见问题

不要在 README 里写开发流程、构建命令、发布步骤（这些已由 CI 自动化），
也不要写贡献指南。只在确有必要时保留一小节「如何调试」。

### 3. 需要跨设备同步的数据一律使用 CAT_fileStorage

**这是硬性要求。**

原因：脚本猫的云同步只覆盖脚本源码与 metadata，**不包含 GM 存储值**。
所以存在 `GM_setValue` 里的数据在多端之间不会同步。

`CAT_fileStorage` 走的是用户自己配置的云盘（WebDAV / OneDrive / Google Drive /
Dropbox / 百度网盘 / S3），路径为 `ScriptCat/app/<脚本 uuid>`，天然跨设备可达。

规则：

| 数据类型 | 存储方式 |
| --- | --- |
| 需要跨设备同步的设置、规则、用户数据 | `CAT_fileStorage` |
| 纯缓存、可随时重建的数据 | GM 存储 |

实现方式：

1. 所有需要同步的存储都必须走 `src/shared/storage.ts` 的 `SyncStorage`，不要自己封装一套；
2. `SyncStorage` 内部以 GM 存储作为本地缓存，保证脚本启动瞬间能同步读到配置；
3. 云端数据是异步到达的，通过 `onRemoteUpdate` 回调通知调用方重新应用；
4. 写入时先写本地、再 debounce 500ms 异步上传云端，上传失败不影响本地使用；
5. 云端未配置时（错误码 1）自动退回纯本地模式，脚本必须照常可用，不得报错中断；
6. 脚本的 `@grant` 必须包含 `CAT_fileStorage`。

### 4. 构建产物由 CI 生成并提交

`dist/` 下的产物由 GitHub Actions 构建后自动提交，**不要手工编辑 `dist/` 里的文件**。
要改脚本行为就改 `scripts/<脚本名>/src/` 下的源码。

版本号格式为 `YYYY.M.D.N`，由 `tools/build.mjs` 自动生成，N 是当天的构建序号，
保证同一天多次构建时版本号仍然递增，脚本猫才能正确识别更新。

### 5. 发布后清理 CDN 缓存

jsDelivr 对分支（`@master`）的缓存 TTL 约 12 小时，脚本猫按更新间隔检查时
可能仍拿到旧产物。发布后主动调用 purge 接口立即失效：

```sh
curl https://purge.jsdelivr.net/gh/fangfuzha/scriptcat-scripts@master
```

注意 `fastly.jsdelivr.net` 与 `cdn.jsdelivr.net` 是两套独立缓存，
purge 后个别节点仍可能短暂返回旧内容，属正常现象。

### 6. 订阅合集自动生成

`dist/fangfuzha脚本合集.user.sub.js` 由构建脚本根据 `scripts/` 下的脚本列表自动生成。
新增脚本后无需手工维护该文件，重新构建即可。

## 新增脚本的步骤

1. 创建 `scripts/<脚本名>/` 目录；
2. 编写 `src/main.ts` 作为入口，需要的模块放在 `src/` 下；
3. 创建 `script.config.json` 声明元数据（注意包含 `grant` 里的 `CAT_fileStorage`）；
4. 编写 `README.md`（面向使用者）；
5. 跨设备同步的数据接入 `src/shared/storage.ts` 的 `SyncStorage`；
6. 本地执行 `pnpm run build` 验证产物；
7. 提交并推送，CI 会自动构建并提交 `dist/` 产物。

## 开发命令

```sh
pnpm install     # 安装依赖
pnpm run check   # 类型检查
pnpm run build   # 构建全部脚本
```

## 技术约束

- 构建工具链是 TypeScript + esbuild，**走 Node API**，不要用 esbuild CLI（本机 CLI 会静默失败）；
- 不引入 UI 框架，面板等交互用原生 DOM 实现；
- 包管理器是 pnpm 12，构建白名单写在 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies`。
