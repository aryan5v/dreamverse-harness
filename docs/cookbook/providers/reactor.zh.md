# 维护 Reactor 提供商

[English](reactor.md) | 中文

当 Reactor 新增模型、修改工作流或发布新 SDK 时，请按本指南更新 `@dv/reactor`。主机安装与配置见 [Reactor 插件 README](../../../packages/dv/reactor/README.zh.md)。

## 修改模型或协议

1. 将已部署模型的 schema 与现有配置对照。对于兼容的私有部署，配置原生模型 ID 并复用已有配置。对于新工作流，请在 [profiles.ts](../../../packages/dv/reactor/src/profiles.ts) 中补充支持的任务、时长、输出尺寸和输入限制。[Reactor 模型 API 参考](https://docs.reactor.inc/model-api-reference/overview)
2. 将 Reactor 专用的命令、事件和录制行为放在 [SDK 桥接程序](../../../packages/dv/reactor/src/render.py) 中。队列和流式工作流在会话中录制片段。PixVerse 下载已保存的步骤产物。验证 SDK 版本变更后，请更新[主机配置](../../../packages/dv/reactor/README.zh.md#use-this-package)中的版本。[Reactor Python SDK](https://docs.reactor.inc/sdk-reference/python/reactor) · [Reactor 录制](https://docs.reactor.inc/concepts/recordings)
3. 通过主机凭据服务解析 `REACTOR_API_KEY`。目录查询需要密钥，不会开启生成会话，并使用 `catalogTimeoutSeconds` 时限。账户路由（`GET` 检查已保存的密钥，`POST` 检查候选密钥）还会检查 `pythonPath` 能否导入 `reactor_sdk`，不能时返回 `needs-setup`，并给出固定版本的安装命令 `python3 -m pip install 'reactor-sdk==1.15.0'`；更改 SDK 版本时同步更新 [setup.ts](../../../packages/dv/reactor/src/setup.ts) 中的该命令。目录路由在没有密钥时返回 503，Reactor 拒绝密钥时返回 401，其他情况返回 502。`apiBaseUrl` 为目录、保存步骤下载和 SDK 会话选择 Reactor API 源。每次生成使用一个受 `timeoutSeconds` 限制的会话，每个已注册的时长都必须短于 `timeoutSeconds`。取消时请求 SDK 断开连接。清理期间丢失连接时，由服务端会话时限限制其运行时间。

## 验证并提交

准备好 `ffmpeg` 和 `ffprobe` 后，运行提供商和套件测试。SDK 测试替身覆盖模型注册、媒体导入、各任务的命令序列及取消。[目录测试](../../../packages/dv/reactor/tests/catalog.spec.ts) · [套件测试](../../../packages/bundle/dv/tests/reactor.spec.ts)

运行付费线上冒烟测试时，请使用获准的测试凭据和安装了固定 SDK 版本的解释器。[线上测试](../../../packages/bundle/dv/tests/reactor-live.e2e.ts)通过 `DV_REACTOR_LIVE_TEST=1` 启用，并读取 `REACTOR_API_KEY` 和 `DV_REACTOR_PYTHON`。验证修改涉及的模型和任务，提交 PR 时说明模型 ID、SDK 版本、测试结果，以及受影响的限制或会话行为。[贡献指南](../../../CONTRIBUTING.zh.md)
