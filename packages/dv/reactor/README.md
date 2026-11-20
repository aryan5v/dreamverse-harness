---
description: "Generate DreamVerse shots with Reactor-hosted video models."
kind: "package-reference"
---

# @dv/reactor

English | [中文](README.zh.md)

## Summary

Generate DreamVerse shots with Reactor. Choose a model for text, supported reference assets, keyframes, or scripted avatar video. DreamVerse saves the clip and a PNG of its last frame. Reactor bills for the session lifetime.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Set `REACTOR_API_KEY` in the DreamVerse host's credential store or environment. In the profile's `cordis.patch.yml`, add the model aliases you want to enable. The DreamVerse bundle starts with an empty model list.

The DreamVerse host needs `reactor-sdk==1.15.0` in a Python 3.10 or newer environment. Install it into the interpreter that you set as `pythonPath`:

```sh
python3 -m pip install 'reactor-sdk==1.15.0'
```

If the host uses a dedicated Python environment, run that environment's `python -m pip` and set its interpreter as `pythonPath` in the profile's `cordis.patch.yml`.

```yaml
- id: dv-reactor
  config:
    pythonPath: /path/to/venv/bin/python
    models:
      fast-h3:
        profile: fast-h3
```

Look up a configured alias through `dv_models_list` with provider `reactor`. Use `dv_models_get` to find its tasks and supported durations, then pass the provider, model alias, and task to `dv_shot_render`. The bundle includes profiles for FastH3, FastH3-Omni, H3 Reference Turbo Realtime, Pika H3 Flex, PixVerse R2 Director, LTX, Helios, LongLive 2.0, and both Visko Orbis models.

| Field | Default | Meaning |
|---|---|---|
| `pythonPath` | `python3` | Host interpreter that can import the Reactor SDK. |
| `credentialRef` | `REACTOR_API_KEY` | Name that the harness credential store resolves for each render. |
| `timeoutSeconds` | `360` | Maximum lifetime of one Reactor session, in seconds. It covers connection, upload, generation, real-time playback or streaming, capture, and download. Integer from 1 to 3600. |
| `apiBaseUrl` | `https://api.reactor.inc` | HTTPS origin of the Reactor API, without a path, query, or credentials. It serves the model catalog, the PixVerse saved-step downloads, and the SDK session through its `api_url` argument. Loading fails for any other value. |
| `catalogTimeoutSeconds` | `30` | Deadline for one `GET /api/dv/reactor/catalog` request to Reactor, in seconds. Integer from 1 to 300. |
| `models` | Empty in the DreamVerse bundle | Model aliases for the generation tools. Each has a `profile` and optional `modelId` and `durationsSec` overrides. |

The session lifetime must exceed the clip duration plus setup and generation time. Queued workflows play the clip back in real time before capture, and streamed workflows run in real time. Reactor bills for the session lifetime, so `timeoutSeconds` is also the cap on the cost of one render. The plugin registers only durations shorter than `timeoutSeconds`, so `dv_models_get` never lists a duration that cannot finish. For example, the default `360` removes the LTX durations of 360 seconds or more, and LTX supports at most 300 seconds. If an alias has no duration shorter than `timeoutSeconds`, loading the plugin or applying new settings fails with a message that names the alias and `timeoutSeconds`.

Set `models` to a subset of profiles if your account has access to a smaller set. To register a private deployment that implements the same model commands, set its full `owner/name` as `modelId` and choose the corresponding `profile`.

On a Web profile, `GET /api/dv/reactor/catalog` lists all models visible to the configured API key. Each row includes `shotModels`, the configured DreamVerse aliases for that model.

`GET /api/dv/reactor/account` checks the host's configured key with one read-only model catalog request. It returns `missing`, `rejected`, `unavailable`, or `connected` in `status`. A connected response reports `balanceUsd: null` and `label: null`. Read the balance in the [Reactor dashboard](https://docs.reactor.inc/resources/billing#usage-tracking).

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Provider implementation</summary>

[The Cordis plugin](src/index.ts) registers the [model profiles](src/profiles.ts), resolves the API key on the host, and maps DreamVerse tasks to model inputs. [The SDK bridge](src/render.py) uses Reactor’s official Python SDK to open one bounded session per render, upload inputs, send commands, and capture a clip. PixVerse provides the MP4 directly through Reactor’s saved-step API. The bridge closes the session after capture, cancellation, or failure. Helios reports its running frame count in `state.current_frame` after every completed chunk. The bridge uses that count to decide when to capture.

The plugin runs a Python bridge because the Reactor Python SDK is the official client for headless sessions, uploads, commands, and recording download. The plugin sends the API key to the bridge only on stdin, and the bridge process runs with the environment returned by `scrubbedParentEnv`, so the key never reaches the child environment.

No runtime invariant companion is published because Reactor registers entries in the shared model catalog and returns media to the shot renderer. There is no separate runtime record of either result. The bundle tests exercise Reactor session teardown and local recording cleanup.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Reactor model API reference](https://docs.reactor.inc/model-api-reference/overview)
- [Reactor recordings](https://docs.reactor.inc/concepts/recordings)
- [Reactor maintenance guide](../../../docs/cookbook/providers/reactor.md)
- [Contribute a DreamVerse provider](../../../docs/cookbook/adding-a-dreamverse-provider.md)
- [DreamVerse shot rendering](../shot-render/README.md)

<a id="model-experience"></a>
## Model Experience

### Request context and condition

#### What the model sees

The agent can query the enabled Reactor models with `dv_models_list` and read their task schemas with `dv_models_get`. Each model receives the shot prompt with project asset citations expanded according to its own protocol. For LTX, the shot prompt is the spoken script. The catalog reports `hosting: managed`.

#### Token effect

Reactor model metadata is included when the agent queries the catalog. Enabling the provider adds no prompt section.

#### KV Cache effect

Catalog results append to the conversation. The provider adds no text to the fixed request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Streamed workflows require the deployment to enable Reactor recordings. PixVerse uses Reactor’s saved-step files.
- Models that need interactive control, live microphone or camera input, or robotics sessions appear in catalog discovery. They need their own workflows to produce DreamVerse shots.
- The host profile enables bundled shot profiles and can map an alias to a private deployment that implements the same workflow.
- Cancellation asks the SDK to disconnect. The session has a server-side lifetime limit if the host loses the connection during cleanup.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer context</summary>

The bundle tests replace the external SDK and check MP4 and PNG import. The paid smoke test in `packages/bundle/dv/tests/reactor-live.e2e.ts` requires `DV_REACTOR_LIVE_TEST=1`, the host API key, and a Python environment with the SDK.

</details>
