---
description: "Save a Reactor API key and add hosted video models to the DreamVerse model picker."
kind: "package-reference"
---

# @dv/ui-reactor

English | [中文](README.zh.md)

## Summary

Connect your Reactor account in DreamVerse Settings. Load the models your account can access and add compatible video models to the chat picker.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

The DreamVerse Web profile contributes the Reactor card and model catalog to **Settings → Models**. Follow the [provider setup](../reactor/README.md) for the host SDK and model profiles.

<a id="understand-the-implementation"></a>
## Understand the implementation

The browser sends the key through the credential service. The page reads the account model list from the host and saves only model selections through the settings form.

<a id="model-experience"></a>
## Model Experience

### Request context and condition

#### What the model sees

Enabled models appear through `dv_models_list`.

#### Token effect

Model metadata appears in model catalog tool results.

#### KV Cache effect

Model catalog tool results append to the conversation.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The page offers the shot workflows bundled with DreamVerse. Custom deployment aliases are configured on the host.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer context</summary>

The browser component test checks credential and model settings writes. The bundle test checks catalog registration after live settings changes.

</details>
