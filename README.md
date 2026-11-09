# fangfuzha 脚本合集

脚本猫用户脚本合集的**框架仓库**。仓库本身不含具体脚本，
提供一套可复用的脚手架：多脚本目录结构、构建流程、自动更新发布链路，
以及跨设备同步用的存储层。

> 当前仓库暂无脚本。新增脚本后，订阅合集文件会自动包含它。

## 仓库能提供什么

- **一脚本一目录**：`scripts/<脚本名>/`，源码、元数据、说明文档各归其位；
- **自动构建发布**：推送后由 GitHub Actions 构建产物并提交，
  脚本猫按更新间隔静默检查并更新，无需手动确认；
- **CDN 托管**：产物通过 jsDelivr 分发；
- **跨设备同步**：需要多端一致的数据统一走脚本猫的文件存储（`CAT_fileStorage`），
  走用户自己的云盘；
- **订阅合集**：所有脚本汇总到一个订阅文件，装一次即可。

## 目录结构

```
scripts/
  <脚本名>/
    src/                  脚本源码，入口固定为 src/main.ts
    script.config.json    脚本元数据声明
    README.md             面向使用者的说明
src/
  shared/                 多脚本共用代码
    storage.ts            CAT_fileStorage 存储层
tools/
  build.mjs               构建脚本
dist/                     构建产物，由 CI 自动生成
```

## 使用

仓库暂无脚本，因此暂时没有可安装的产物。

脚本加入后，安装入口是：

- 单个脚本：`https://fastly.jsdelivr.net/gh/fangfuzha/scriptcat-scripts@master/dist/<脚本名>/<脚本名>.user.js`
- 订阅合集：`https://fastly.jsdelivr.net/gh/fangfuzha/scriptcat-scripts@master/dist/fangfuzha脚本合集.user.sub.js`

## 反馈

欢迎提 issue：
[fangfuzha/scriptcat-scripts/issues](https://github.com/fangfuzha/scriptcat-scripts/issues)

## 许可

[MIT](LICENSE)
