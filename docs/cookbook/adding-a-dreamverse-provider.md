# Add or update a DreamVerse generation provider

English | [中文](adding-a-dreamverse-provider.zh.md)

Use this guide to integrate an image, audio, or video API with DreamVerse Harness or update an existing integration.

## 1. Choose the integration point

Find the plugin that owns the provider. If it already supports the model's workflow, configure the provider model ID and a local alias in the host profile. If the provider adds a new workflow, extend the existing plugin and its tests. For a new provider, create a Cordis plugin under `packages/dv/<provider>` and mount it in the DreamVerse bundle. [Package setup](adding-a-package.md) · [DreamVerse bundle](../../packages/bundle/dv/cordis.patch.yml)

## 2. Implement the model adapter

1. Use a stable provider ID and keep native model IDs in validated configuration. Register one `ModelEntry` per enabled alias and task. Keep the registry in sync with model settings and dispose entries when the plugin unloads. [Model registry](../../packages/dv/models/README.md)
2. Implement model facts, the task schema, request validation, and generation. Describe the supported inputs, output sizes, durations, and parameters. A text-to-video task accepts text alone. Declare managed hosting for cloud models and worker selection for services that accept an explicit worker. [Model entry types](../../packages/dv/models/src/types.ts)
3. Resolve credentials on the host. Use the provider's documented SDK or API and read reference inputs through the asset pool. Return generated media through the shared generation pipeline. For video, return the clip and its last frame. [Shot rendering](../../packages/dv/shot-render/README.md)
4. Propagate errors and use the provider's documented cancellation mechanism. Where cancellation only stops local monitoring, explain what happens to the remote job and billing.

## 3. Write the provider maintenance guide

Every new generation provider must include `docs/cookbook/providers/<provider>.md` and its Chinese counterpart. Link the guide from the provider README. Update it when a model addition or API change affects the maintenance procedure.

Cover where to change model mappings and limits, supported SDK or API versions, credential references, how to reproduce tests, cancellation and billing behavior, and evidence to include in a PR. Put provider-specific commands, workflows, and troubleshooting in that guide.

## 4. Verify and open a pull request

1. Test registration and removal, invalid inputs, provider errors, cancellation, and media import with a fixture. Run the provider's focused tests and the relevant bundle tests. [Testing policy](../testing.md)
2. Configure a model in a DreamVerse profile. Confirm it appears in `dv_models_list` and check its task and parameters with `dv_models_get`. For a protocol or model change, follow the provider's live verification steps when test credentials and billing approval are available. Record the model, task, and result.
3. Fork the repository and open a focused PR against its default branch. Link the relevant provider documentation and describe how you verified the change. Keep credentials, signed media URLs, and private deployment details out of the diff and test output. [Contribution guide](../../CONTRIBUTING.md)
