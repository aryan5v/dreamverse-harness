---
description: "保存 Reactor API 密钥并将托管视频模型添加到 DreamVerse 模型选择器。"
kind: "package-reference"
---

# @dv/ui-reactor

[English](README.md) | 中文

## 摘要

在 DreamVerse 设置中连接 Reactor 账户。读取账户可访问的模型，并将兼容的视频模型加入聊天选择器。

## 目录

- [使用此包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制和推迟的工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用此包

DreamVerse Web profile 在 **设置 → 模型** 中提供 Reactor 卡片和模型目录。有关主机 SDK 和模型配置，请参阅 [供应商配置](../reactor/README.zh.md)。

<a id="understand-the-implementation"></a>
## 了解实现

浏览器通过凭据服务发送密钥。页面从主机读取账户可用模型，并通过设置表单仅保存模型选择。

<a id="model-experience"></a>
## 模型体验

### 请求上下文和条件

#### 模型看到什么

已启用的模型可通过 `dv_models_list` 查询。

#### Token 影响

模型目录工具的结果包含模型元数据。

#### KV Cache 影响

模型目录工具结果追加到对话。

## 已知限制和推迟的工作

<a id="known-limitations-and-deferred-work"></a>

- 页面提供 DreamVerse 内置的镜头工作流。自定义部署的别名在主机上配置。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护说明</summary>

浏览器组件测试检查凭据和模型设置的写入。bundle 测试检查实时修改设置后模型目录的注册结果。

</details>
