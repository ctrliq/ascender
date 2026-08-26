// Modifications Copyright (c) 2026 Ctrl IQ, Inc.
//
// Puts the fixtures the specs need into the running development environment and
// writes what it created to fixtures.json.
//
// The workflow is built out of system job templates on purpose. Every instance
// has them, they need no project, inventory, credential or network access, and
// they finish in seconds, so the suite has a real multi-node workflow job to
// navigate without depending on anything that can be slow or absent. They also
// route under /jobs/management/, so the specs exercise a url segment other than
// the default one rather than only the common case.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const BASE = process.env.ASCENDER_URL || 'https://localhost:8043';
const USERNAME = process.env.ASCENDER_USERNAME || 'admin';
const PASSWORD = process.env.ASCENDER_PASSWORD || 'password';
// Basic auth by default, which is what the development environment is set up
// for. ASCENDER_TOKEN is there for instances where you would rather not put a
// password in the environment.
const TOKEN = process.env.ASCENDER_TOKEN;
const WORKFLOW_NAME = 'e2e-workflow';
const NODE_COUNT = 3;

// self-signed certificate in the development environment, and Node's global
// fetch gives no clean way to relax that per request, so this goes through the
// https module directly
function api(method, endpoint, body) {
  const url = new URL(endpoint, BASE);
  const payload = body ? JSON.stringify(body) : null;
  const authorization = TOKEN
    ? `Bearer ${TOKEN}`
    : `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}`;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        rejectUnauthorized: false,
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(
              new Error(`${method} ${endpoint} -> ${res.statusCode}\n${data.slice(0, 500)}`)
            );
            return;
          }
          try {
            resolve(data ? JSON.parse(data) : null);
          } catch (err) {
            reject(new Error(`${method} ${endpoint}: ${err.message}\n${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findOrCreateWorkflow() {
  const existing = await api(
    'GET',
    `/api/v2/workflow_job_templates/?name=${encodeURIComponent(WORKFLOW_NAME)}`
  );
  if (existing.count > 0) {
    return existing.results[0];
  }
  const workflow = await api('POST', '/api/v2/workflow_job_templates/', {
    name: WORKFLOW_NAME,
    description: 'Fixture for the end-to-end suite. Safe to delete.',
  });
  const systemJobTemplates = await api('GET', '/api/v2/system_job_templates/');
  if (systemJobTemplates.count < NODE_COUNT) {
    throw new Error(
      `need ${NODE_COUNT} system job templates to build the fixture workflow, found ${systemJobTemplates.count}`
    );
  }
  for (let i = 0; i < NODE_COUNT; i += 1) {
    await api('POST', `/api/v2/workflow_job_templates/${workflow.id}/workflow_nodes/`, {
      unified_job_template: systemJobTemplates.results[i].id,
      // a readable identifier, so the specs can target a node by name and the
      // menu shows something other than a uuid
      identifier: `e2e-node-${i + 1}`,
    });
  }
  return workflow;
}

async function launchAndWait(workflowId) {
  const run = await api('POST', `/api/v2/workflow_job_templates/${workflowId}/launch/`, {});
  const deadline = Date.now() + 5 * 60 * 1000;
  let status = run.status;
  while (!['successful', 'failed', 'error', 'canceled'].includes(status)) {
    if (Date.now() > deadline) {
      throw new Error(`workflow job ${run.id} did not finish, last status ${status}`);
    }
    await sleep(3000);
    status = (await api('GET', `/api/v2/workflow_jobs/${run.id}/`)).status;
  }
  if (status !== 'successful') {
    throw new Error(`fixture workflow job ${run.id} ended ${status}`);
  }
  return run.id;
}

module.exports = async function globalSetup() {
  const workflow = await findOrCreateWorkflow();
  const workflowJobId = await launchAndWait(workflow.id);
  const { results } = await api(
    'GET',
    `/api/v2/workflow_jobs/${workflowJobId}/workflow_nodes/`
  );

  // only nodes that actually ran a job are navigable, which is what the
  // selector counts
  const nodes = results
    .filter((node) => node.job)
    .map((node) => ({
      identifier: node.identifier,
      jobId: node.summary_fields.job.id,
      jobType: node.summary_fields.job.type,
      name: node.summary_fields.job.name,
    }));

  if (nodes.length < 2) {
    throw new Error(`fixture workflow produced ${nodes.length} job nodes, need at least 2`);
  }

  const fixtures = { baseURL: BASE, workflowJobId, nodes };
  fs.writeFileSync(
    path.join(__dirname, 'fixtures.json'),
    `${JSON.stringify(fixtures, null, 2)}\n`
  );
  // eslint-disable-next-line no-console
  console.log(
    `seeded workflow job ${workflowJobId} with ${nodes.length} job nodes: ` +
      nodes.map((n) => `${n.identifier}=${n.jobId}`).join(' ')
  );
};
