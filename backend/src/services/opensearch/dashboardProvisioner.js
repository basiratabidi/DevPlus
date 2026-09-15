/**
 * Auto-provisions a dedicated OpenSearch index + OpenSearch Dashboards
 * dashboard for each connected external project, the first time that
 * project's name is ever seen in an ingested error - mirrors the
 * hand-built `devpulse-commit-logs`/`devpulse-webhook-hits`/
 * `devpulse-error-logs` dashboard panels (see `DevPulse Overview`), but
 * one dedicated set per project instead of one shared view.
 *
 * Triggered from `tools/errorIngestTool.js` on every
 * `POST /logs/ingest-error` call (the same endpoint a connected
 * project's CI job or error handler hits), so a brand-new project gets
 * its own index/dashboard automatically on its very first reported
 * error/CI failure - no manual OSD click-through needed.
 *
 * Talks to OpenSearch Dashboards' saved-objects API directly (not
 * through the backend's `/opensearch-dashboards` reverse proxy, which
 * is for browser traffic only) - same unprefixed-path reasoning as
 * `SERVER_REWRITEBASEPATH=false` in docker-compose.yml.
 */

import crypto from 'crypto';

function osdBaseUrl() {
  return (process.env.OPENSEARCH_DASHBOARDS_URL || 'http://localhost:5601').replace(/\/$/, '');
}

function isConfigured() {
  return Boolean(process.env.OPENSEARCH_URL);
}

/**
 * "Payments Service" -> "payments-service-a1b2c3". Lowercasing +
 * collapsing punctuation to "-" is lossy - "Payments Service" and
 * "payments-service" would otherwise both slugify to "payments-service"
 * and silently share one index/dashboard. Appending a short hash of the
 * exact (case-sensitive) project string keeps the id human-readable
 * while guaranteeing two different project names never collide.
 */
export function slugifyProject(project) {
  const base = String(project)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown-project';
  const hash = crypto.createHash('sha1').update(String(project)).digest('hex').slice(0, 6);
  return `${base}-${hash}`;
}

export function projectIndexName(project) {
  return `devpulse-project-${slugifyProject(project)}`;
}

async function osdGet(type, id) {
  const res = await fetch(`${osdBaseUrl()}/api/saved_objects/${type}/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OSD GET ${type}/${id} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function osdPut(type, id, body) {
  const res = await fetch(`${osdBaseUrl()}/api/saved_objects/${type}/${id}?overwrite=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'osd-xsrf': 'true' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OSD PUT ${type}/${id} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function metricVisualization(indexPatternId, title) {
  return {
    attributes: {
      title,
      visState: JSON.stringify({
        title,
        type: 'metric',
        params: {
          addTooltip: true,
          addLegend: false,
          type: 'metric',
          metric: {
            percentageMode: false,
            useRanges: false,
            colorSchema: 'Green to Red',
            metricColorMode: 'None',
            colorsRange: [{ from: 0, to: 10000 }],
            labels: { show: true },
            invertColors: false,
            style: { bgFill: '#000', bgColor: false, labelColor: false, subText: '', fontSize: 60 },
          },
        },
        aggs: [{ id: '1', enabled: true, type: 'count', schema: 'metric', params: {} }],
      }),
      uiStateJSON: '{}',
      description: '',
      version: 1,
      kibanaSavedObjectMeta: {
        searchSourceJSON: JSON.stringify({
          query: { query: '', language: 'kuery' },
          filter: [],
          indexRefName: 'kibanaSavedObjectMeta.searchSourceJSON.index',
        }),
      },
    },
    references: [{ name: 'kibanaSavedObjectMeta.searchSourceJSON.index', type: 'index-pattern', id: indexPatternId }],
  };
}

function timeseriesVisualization(indexPatternId, title) {
  return {
    attributes: {
      title,
      visState: JSON.stringify({
        title,
        type: 'histogram',
        params: {
          type: 'histogram',
          grid: { categoryLines: false },
          categoryAxes: [
            { id: 'CategoryAxis-1', type: 'category', position: 'bottom', show: true, style: {}, scale: { type: 'linear' }, labels: { show: true, filter: true, truncate: 100 }, title: {} },
          ],
          valueAxes: [
            { id: 'ValueAxis-1', name: 'LeftAxis-1', type: 'value', position: 'left', show: true, style: {}, scale: { type: 'linear', mode: 'normal' }, labels: { show: true, rotate: 0, filter: false, truncate: 100 }, title: { text: 'Count' } },
          ],
          seriesParams: [
            { show: true, type: 'histogram', mode: 'stacked', data: { label: 'Count', id: '1' }, valueAxis: 'ValueAxis-1', drawLinesBetweenPoints: true, showCirclesOnLines: true, interpolate: 'linear', lineWidth: 2, showCircles: true },
          ],
          addTooltip: true,
          addLegend: false,
          legendPosition: 'right',
          times: [],
          addTimeMarker: false,
          labels: {},
          thresholdLine: { show: false, value: 10, width: 1, style: 'full', color: '#E7664C' },
        },
        aggs: [
          { id: '1', enabled: true, type: 'count', schema: 'metric', params: {} },
          {
            id: '2',
            enabled: true,
            type: 'date_histogram',
            schema: 'segment',
            params: {
              field: 'timestamp',
              timeRange: { from: 'now-90d', to: 'now' },
              useNormalizedOpenSearchInterval: true,
              scaleMetricValues: false,
              interval: 'auto',
              drop_partials: false,
              min_doc_count: 1,
              extended_bounds: {},
            },
          },
        ],
      }),
      uiStateJSON: '{}',
      description: '',
      version: 1,
      kibanaSavedObjectMeta: {
        searchSourceJSON: JSON.stringify({
          query: { query: '', language: 'kuery' },
          filter: [],
          indexRefName: 'kibanaSavedObjectMeta.searchSourceJSON.index',
        }),
      },
    },
    references: [{ name: 'kibanaSavedObjectMeta.searchSourceJSON.index', type: 'index-pattern', id: indexPatternId }],
  };
}

function recentErrorsSearch(indexPatternId, title) {
  return {
    attributes: {
      title,
      description: '',
      hits: 0,
      columns: ['timestamp', 'level', 'message', 'source'],
      sort: [['timestamp', 'desc']],
      version: 1,
      kibanaSavedObjectMeta: {
        searchSourceJSON: JSON.stringify({
          query: { query: '', language: 'kuery' },
          filter: [],
          indexRefName: 'kibanaSavedObjectMeta.searchSourceJSON.index',
        }),
      },
    },
    references: [{ name: 'kibanaSavedObjectMeta.searchSourceJSON.index', type: 'index-pattern', id: indexPatternId }],
  };
}

/**
 * The classic Dashboards/Visualize objects above are a completely
 * separate store from the Observability app's "Logs" page (Applications/
 * Logs/Metrics/Traces in the left nav) - that page lists PPL "saved
 * queries", kept in their own index and reached through
 * `/api/observability/event_analytics/saved_objects*`, not
 * `/api/saved_objects`. Without one of these, a project's data exists in
 * OpenSearch but never shows up under Observability > Logs even though
 * its classic dashboard works fine.
 */
async function findObservabilityQueryByName(name) {
  const res = await fetch(`${osdBaseUrl()}/api/observability/event_analytics/saved_objects?objectType=savedQuery`);
  if (!res.ok) throw new Error(`OSD event_analytics list failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.observabilityObjectList || []).find((o) => o.savedQuery?.name === name) || null;
}

export async function ensureObservabilityLogQuery({ name, description, query, dateStart = 'now-90d' }) {
  const existing = await findObservabilityQueryByName(name);
  if (existing) return { created: false, objectId: existing.objectId };

  const res = await fetch(`${osdBaseUrl()}/api/observability/event_analytics/saved_objects/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'osd-xsrf': 'true' },
    body: JSON.stringify({
      object: {
        query,
        selected_date_range: { start: dateStart, end: 'now', text: '' },
        selected_timestamp: { name: 'timestamp', type: 'timestamp' },
        selected_fields: { tokens: [], text: '' },
        name,
        description,
      },
    }),
  });
  if (!res.ok) throw new Error(`OSD create saved query failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { created: true, objectId: data.objectId };
}

function dashboard(title, description, panelRefs) {
  const panelsJSON = panelRefs.map((ref, i) => ({
    version: '2.17.0',
    gridData: { x: (i % 3) * 16, y: Math.floor(i / 3) * (i < 3 ? 8 : 15), w: i < 3 ? 16 : 48, h: i < 3 ? 8 : 15 },
    panelIndex: String(i + 1),
    embeddableConfig: {},
    panelRefName: `panel_${i + 1}`,
  }));

  return {
    attributes: {
      title,
      hits: 0,
      description,
      panelsJSON: JSON.stringify(panelsJSON),
      optionsJSON: JSON.stringify({ useMargins: true, hidePanelTitles: false }),
      version: 1,
      timeRestore: true,
      timeTo: 'now',
      timeFrom: 'now-90d',
      kibanaSavedObjectMeta: { searchSourceJSON: JSON.stringify({ query: { query: '', language: 'kuery' }, filter: [] }) },
    },
    references: panelRefs.map((ref, i) => ({ name: `panel_${i + 1}`, type: ref.type, id: ref.id })),
  };
}

/**
 * Provisions two independent things for a connected project, each
 * idempotent on its own (checked separately, not gated behind one
 * shared guard) - a project whose classic dashboard was created by an
 * older deploy/before this function existed must still be able to pick
 * up its missing Observability entry on a later call, rather than being
 * stuck without one forever because "the index-pattern already exists"
 * short-circuited everything else. Best-effort throughout (same
 * reasoning as Jira/escalation integrations elsewhere) - OSD being
 * unreachable must never break error ingestion, so callers should catch
 * and log, not propagate.
 */
export async function ensureConnectedProjectDashboard(project) {
  if (!isConfigured()) return null;

  const slug = slugifyProject(project);
  const indexPatternId = `devpulse-project-${slug}`;
  const dashboardId = `devpulse-project-${slug}-dashboard`;

  const existingIndexPattern = await osdGet('index-pattern', indexPatternId);
  if (!existingIndexPattern) {
    await osdPut('index-pattern', indexPatternId, {
      attributes: { title: `${indexPatternId}*`, timeFieldName: 'timestamp', fields: '[]' },
      references: [],
    });

    const metricId = `devpulse-project-${slug}-metric`;
    const timeseriesId = `devpulse-project-${slug}-timeseries`;
    const searchId = `devpulse-project-${slug}-search`;

    await osdPut('visualization', metricId, metricVisualization(indexPatternId, `Total Errors — ${project}`));
    await osdPut('visualization', timeseriesId, timeseriesVisualization(indexPatternId, `Errors per day — ${project}`));
    await osdPut('search', searchId, recentErrorsSearch(indexPatternId, `${project} — Recent Errors`));
    await osdPut(
      'dashboard',
      dashboardId,
      dashboard(`Connected Project: ${project}`, `Auto-generated on first reported error/CI failure from "${project}".`, [
        { type: 'visualization', id: metricId },
        { type: 'visualization', id: timeseriesId },
        { type: 'search', id: searchId },
      ])
    );
  }

  // Also register under Observability > Logs (separate PPL-backed store -
  // see ensureObservabilityLogQuery's comment) so the project's errors
  // are browsable from there too, not just the classic Dashboards view.
  // Checked/created independently of the block above (see doc comment).
  await ensureObservabilityLogQuery({
    name: `${project} — Logs`,
    description: `Auto-generated on first reported error/CI failure from "${project}".`,
    query: `source = ${indexPatternId}`,
  });

  return { created: !existingIndexPattern, dashboardId };
}
