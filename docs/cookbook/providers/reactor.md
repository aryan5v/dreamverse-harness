# Maintain the Reactor provider

English | [中文](reactor.zh.md)

Use this guide to update `@dv/reactor` when Reactor adds a model, changes a workflow, or publishes a new SDK. For host setup and configuration, see the [Reactor plugin README](../../../packages/dv/reactor/README.md).

## Change a model or protocol

1. Compare the deployed model's schema with the existing profiles. For a compatible private deployment, configure its native ID and reuse the profile. For a new workflow, add the model's supported tasks, durations, output sizes, and input limits to [profiles.ts](../../../packages/dv/reactor/src/profiles.ts). [Reactor model API reference](https://docs.reactor.inc/model-api-reference/overview)
2. Keep Reactor-specific commands, events, and recording behavior in [the SDK bridge](../../../packages/dv/reactor/src/render.py). Queued and streamed workflows capture a clip from the session. PixVerse downloads a saved step. Update the SDK version in the [host setup](../../../packages/dv/reactor/README.md#use-this-package) when you verify a version change. [Reactor Python SDK](https://docs.reactor.inc/sdk-reference/python/reactor) · [Reactor recordings](https://docs.reactor.inc/concepts/recordings)
3. Resolve `REACTOR_API_KEY` through the host credential service. Catalog discovery requires a key, opens no generation session, and uses the `catalogTimeoutSeconds` deadline. The account route (`GET` for the saved key, `POST` for a candidate key) also checks that `pythonPath` imports `reactor_sdk` and answers `needs-setup` with the pinned install command `python3 -m pip install 'reactor-sdk==1.15.0'`; update that command in [setup.ts](../../../packages/dv/reactor/src/setup.ts) with the SDK version. The catalog route answers 503 without a key, 401 when Reactor refuses it, and 502 otherwise. `apiBaseUrl` selects the Reactor API origin for the catalog, saved-step downloads, and the SDK session. A generation uses one session that `timeoutSeconds` bounds, and each registered duration must be shorter than `timeoutSeconds`. Cancelling requests an SDK disconnect. The server-side session limit covers a lost connection during cleanup.

## Verify and submit

Run the provider and bundle tests with `ffmpeg` and `ffprobe` available. The SDK fixture covers model registration, media import, task-specific command sequences, and cancellation. [Catalog tests](../../../packages/dv/reactor/tests/catalog.spec.ts) · [Bundle tests](../../../packages/bundle/dv/tests/reactor.spec.ts)

For a paid live smoke, use an approved test credential and the interpreter with the pinned SDK. The [live test](../../../packages/bundle/dv/tests/reactor-live.e2e.ts) opts in with `DV_REACTOR_LIVE_TEST=1` and uses `REACTOR_API_KEY` and `DV_REACTOR_PYTHON`. Verify the changed model and task, and include the model ID, SDK version, test result, and any affected limits or session behavior in the PR. [Contribution guide](../../../CONTRIBUTING.md)
