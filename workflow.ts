import {
  defineWorkflow,
  sequenceStep,
  type WorkflowExecutionContext,
} from '@jshookmcp/extension-sdk/workflow';

const workflowId = 'workflow.ws-protocol-lifter.v1';

/**
 * WebSocket Protocol Lifter — Reverse Mission Workflow
 *
 * Automatically analyses WebSocket traffic on a target page:
 *   1. Enables WS monitoring and navigates to the page
 *   2. Waits for connections to establish
 *   3. Captures and clusters messages by structure/type
 *   4. Attempts auto-decode (JSON, base64, msgpack, protobuf heuristics)
 *   5. Searches scripts for handler functions (onmessage, addEventListener)
 *   6. Links message patterns to handler call sites
 *   7. Records evidence and emits a protocol summary
 */
export default defineWorkflow(workflowId, 'WebSocket Protocol Lifter', (workflow) =>
  workflow
.description(
    'Captures WebSocket messages, clusters by structure, auto-decodes payloads (JSON/base64/msgpack/protobuf), locates handlers, and produces a protocol summary with evidence links.',
  )
  .tags([
    'reverse',
    'websocket',
    'protocol',
    'handler',
    'decode',
    'mission',
  ])
  .timeoutMs(10 * 60_000)
  .defaultMaxConcurrency(4)
  .buildGraph((ctx: WorkflowExecutionContext) => {
    const prefix = 'workflows.wsProtocolLifter';

    // ── Config ──────────────────────────────────────────────────────
    const url = String(ctx.getConfig(`${prefix}.url`, 'https://example.com'));
    const waitUntil = String(ctx.getConfig(`${prefix}.waitUntil`, 'networkidle0'));
    const captureDelay = Number(ctx.getConfig(`${prefix}.captureDelayMs`, 5000));
    const maxFrames = Number(ctx.getConfig(`${prefix}.maxFrames`, 200));
    const handlerSearchKeywords = String(
      ctx.getConfig(`${prefix}.handlerKeywords`, 'onmessage,addEventListener,socket,WebSocket'),
    );
    const maxConcurrency = Number(ctx.getConfig(`${prefix}.parallel.maxConcurrency`, 4));
    const decodeAttempts = String(
      ctx.getConfig(`${prefix}.decodeAttempts`, 'json,base64,msgpack,protobuf'),
    );

    return sequenceStep('ws-protocol-lifter-root', (root) => {

    root
      // ── Phase 1: Enable WS Monitoring & Navigate ──────────────────
      .tool('enable-ws-monitor', 'ws_monitor_enable', {
        input: {},
      })
      .tool('enable-network', 'network_enable', {
        input: { enableExceptions: true },
      })
      .tool('navigate', 'page_navigate', {
        input: { url, waitUntil },
      })

      // ── Phase 2: Wait for WS Activity ─────────────────────────────
      .tool('wait-ws-activity', 'page_wait_for_timeout', {
        input: { timeout: captureDelay },
      })

      // ── Phase 3: Capture Connections & Frames ─────────────────────
      .tool('get-ws-connections', 'ws_get_connections', {
        input: {},
      })
      .tool('get-ws-frames', 'ws_get_frames', {
        input: { limit: maxFrames },
      })

      // ── Phase 4: Parallel Analysis ────────────────────────────────
      .parallel('analyse-ws', (p) => {
        p.maxConcurrency(maxConcurrency)
          .failFast(false)
          // Cluster messages by structure
          .tool('cluster-messages', 'ws_cluster_messages', {
            input: {},
          })
          // Attempt decode
          .tool('decode-payloads', 'ws_decode_payloads', {
            input: { attempts: decodeAttempts },
          })
          // Search for handler functions
          .tool('search-handlers', 'search_in_scripts', {
            input: {
              query: handlerSearchKeywords,
              matchType: 'any',
            },
          })
          // Get protocol stats
          .tool('get-ws-stats', 'ws_get_stats', {
            input: {},
          });
      })

      // ── Phase 5: Handler Association ──────────────────────────────
      .tool('locate-handlers', 'extract_function_tree', {
        input: {
          targetParam: 'onmessage',
          depth: 2,
        },
      })

      // ── Phase 6: Evidence Recording ───────────────────────────────
      .tool('create-evidence-session', 'instrumentation_session_create', {
        input: {
          name: `ws-protocol-${new Date().toISOString().slice(0, 10)}`,
          metadata: { url, workflowId },
        },
      })
      .tool('record-artifact', 'instrumentation_artifact_record', {
        input: {
          type: 'ws_protocol_summary',
          label: `WS protocol analysis for ${url}`,
          metadata: { url, maxFrames, decodeAttempts },
        },
      })

      // ── Phase 7: Session Insight ──────────────────────────────────
      .tool('emit-insight', 'append_session_insight', {
        input: {
          insight: JSON.stringify({
            status: 'ws_protocol_lifter_complete',
            workflowId,
            url,
            maxFrames,
            captureDelay,
          }),
        },
      });

    });
  })
  .onStart((ctx) => {
    ctx.emitMetric('workflow_runs_total', 1, 'counter', {
      workflowId,
      mission: 'ws_protocol_lifter',
      stage: 'start',
    });
  })
  .onFinish((ctx) => {
    ctx.emitMetric('workflow_runs_total', 1, 'counter', {
      workflowId,
      mission: 'ws_protocol_lifter',
      stage: 'finish',
    });
  })
  .onError((ctx, error) => {
    ctx.emitMetric('workflow_errors_total', 1, 'counter', {
      workflowId,
      mission: 'ws_protocol_lifter',
      stage: 'error',
      error: error.name,
    });
  })
  );