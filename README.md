# 模组分拣台 2.0

在浏览器本地扫描 Minecraft 模组目录，结合描述文件、发布平台资料和静态代码分析区分运行端。不执行 Java、不修改原目录、不上传 JAR。

## 使用

使用 Edge / Chrome 打开模组分拣台.html 或在线页面，选择 mods 目录。支持子目录、多个 JAR、目录拖放、筛选搜索、停止扫描、查看判断依据和导出全部结果 CSV。

每项另外标注判断来源：

- 文件匹配：SHA-1 对应 Modrinth 发布文件，运行端来自项目标签。标签不保证所有历史版本都相同。
- 明确声明：Fabric / Quilt 环境字段、Forge 顶层 clientSideOnly，或旧 Forge / NeoForge 入口类的 @Mod 专用端注解。
- 项目参考：CurseForge 公开项目端信息，或相同 GitHub 仓库的 Modrinth 项目。未确认具体 JAR 与发布文件相同。
- 代码推断：结合注册器、客户端 / 服务端引用、资源和网络信号，仅供参考，不能作为联机安装要求已验证的证明。可取消“显示代码推断”。
- 待确认 / 读取失败：保留原因。

双端不等于两端必装。Modrinth 的两端标签可能分别为必装、可选或不支持。CurseForge 的 Client & Server 也未必说明是否要两端同时安装，请看详情。

## Modrinth / CurseForge 核验

默认扫描不联网，使用内置公开资料快照（2026-10-26）。可点击“联网核验 Modrinth / CurseForge”查询最新信息。

Modrinth 只接收 SHA-1，不接收 JAR、路径或文件名，不需要 Key。

CurseForge 官方 API 需要 API Key，且没有供浏览器直接调用的跨域入口。在线版和本地服务提供限定路径转发，仅转发指纹和 Key 到 api.curseforge.com。工具不保存 Key、不回显 Key，每次核验重新填写。

- 没有 Key：使用内置 CurseForge 资料，不会显示成已完成官方实时指纹查询。
- 有 Key：调用官方指纹接口，并校验返回文件 SHA-1，避免仅靠 32 位指纹碰撞误识别。端信息仍需来自可信项目标签或明确作者说明，缺失时继续保留。
- 离线单文件：本地扫描、内置资料、Modrinth 核验可用；CurseForge 实时 API 需在线版或本地服务。
- 本次没有真实 CurseForge Key。成功响应使用模拟接口验证；已实测无 Key 的官方接口返回 401。不能称为真实 Key 联调成功。

官方 Key 和 API 文档：https://docs.curseforge.com/rest-api/

## 边界

只扫描外层 JAR，不展开内嵌依赖，不验证游戏启动、依赖版本或联机兼容性。不用文件名及中文前缀判端；改名不影响哈希。

描述文件 / 单类上限 2 MB，ZIP 中央目录 16 MB。静态代码分析最多 4,000 个类、48 MB；有未完整分析的类时不做代码推断。文件不大于 512 MB 时计算指纹，单文件分析超时 20 秒。ZIP64、分卷、加密、损坏文件会报告原因。

## 开发和本地服务

Node.js 22+：

```
npm ci
node build.mjs
node serve.mjs
```

访问 http://127.0.0.1:4173 。本地服务和线上使用同一个 CurseForge 转发实现。

构建生成 dist/index.html（离线单文件）和 dist/server/index.js（线上 Worker）。JAR 分析始终在浏览器内进行，服务端仅提供页面及可选的 CurseForge 转发。

检查脚本：verify.mjs、verify-v2.mjs、verify-annotations.mjs。注解测试需 Java 21，可调整脚本中的本机编译器路径。整包断言依赖本地测试报告，不随软件提供原模组。

依赖 fflate（MIT）及 @iarna/toml（ISC），完整许可见 THIRD-PARTY-LICENSES.txt 与 HTML 内。

规则来源：

- https://docs.fabricmc.net/develop/loader/fabric-mod-json
- https://github.com/QuiltMC/rfcs/blob/main/specification/0002-quilt.mod.json.md
- https://docs.minecraftforge.net/en/latest/gettingstarted/modfiles/
- https://docs.neoforged.net/docs/gettingstarted/modfiles/
- https://docs.modrinth.com/api/
- https://docs.curseforge.com/rest-api/
