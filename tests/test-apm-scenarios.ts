/**
 * APM Scenario Test Script
 * Generates specific trace patterns to test:
 * 1. Distributed Traces (Gateway -> Service -> DB)
 * 2. Error States (Pulsing indicators)
 * 3. Pagination (6+ samples for one operation)
 * 4. DB Spans (Emerald bars)
 * 
 * Run with: bun run tests/test-apm-scenarios.ts
 */

export {}

const BASE = 'http://localhost:3000'
const MASTER_KEY = 'secret_master'
const PROJECT_ID = '1796eafc-5f1b-41aa-8e98-9230bf6252dd'

async function sendSpan(span: any) {
  const res = await fetch(`${BASE}/api/ingest/trace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': MASTER_KEY,
      'X-Project-Id': PROJECT_ID,
    },
    body: JSON.stringify(span),
  })
  if (!res.ok) {
    console.error(`Error sending span: ${res.status} ${await res.text()}`)
  }
}

async function createDistributedTrace(name: string, hasError = false) {
  const traceId = crypto.randomUUID()
  const rootId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const dbId = crypto.randomUUID()
  const now = Date.now()

  // 1. Gateway Span
  await sendSpan({
    trace_id: traceId,
    span_id: rootId,
    parent_id: null,
    name: `POST /api/${name}`,
    start_time: now - 5000,
    duration: 120,
    attributes: {
      'service.name': 'api-gateway',
      'http.method': 'POST',
      'http.status_code': hasError ? 500 : 200,
      'error': hasError
    }
  })

  // 2. Downstream Service Span
  await sendSpan({
    trace_id: traceId,
    span_id: serviceId,
    parent_id: rootId,
    name: `process-${name}`,
    start_time: now - 4980,
    duration: 80,
    attributes: {
      'service.name': 'order-service',
      'app.version': '1.2.0'
    }
  })

  // 3. Database Span
  await sendSpan({
    trace_id: traceId,
    span_id: dbId,
    parent_id: serviceId,
    name: `INSERT INTO ${name}`,
    start_time: now - 4950,
    duration: 30,
    attributes: {
      'service.name': 'db-proxy',
      'db.system': 'postgresql',
      'db.statement': `INSERT INTO ${name} (id, val) VALUES (1, 'test')`,
      'error': hasError && Math.random() > 0.5
    }
  })
}

async function runTests() {
  console.log('🧪 Running APM Scenario Tests...')

  // Scenario 1: Pagination Test
  // Generate 8 healthy traces for "GET /api/products" to test the "5 per page" limit
  console.log('   - Generating 8 traces for pagination test...')
  for (let i = 0; i < 8; i++) {
    const traceId = crypto.randomUUID()
    await sendSpan({
      trace_id: traceId,
      span_id: crypto.randomUUID(),
      name: 'GET /api/products',
      start_time: Date.now() - (i * 60000),
      duration: 15 + Math.random() * 10,
      attributes: { 'service.name': 'api-gateway', 'http.method': 'GET', 'http.status_code': 200 }
    })
  }

  // Scenario 2: Error Pulse Test
  console.log('   - Generating error traces for pulse test...')
  await createDistributedTrace('orders', true)
  await createDistributedTrace('payments', true)

  // Scenario 3: Healthy Distributed Trace
  console.log('   - Generating healthy distributed traces...')
  await createDistributedTrace('users', false)
  await createDistributedTrace('search', false)

  console.log('\n✅ Scenarios generated! Check APM for:')
  console.log('   1. Pagination (Next button) on GET /api/products')
  console.log('   2. Red pulsing dots on /api/orders and /api/payments')
  console.log('   3. Emerald DB bars in the span timeline')
}

runTests().catch(console.error)
