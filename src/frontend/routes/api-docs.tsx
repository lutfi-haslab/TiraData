import { createFileRoute } from '@tanstack/react-router'
import SwaggerUI from 'swagger-ui-react'
import 'swagger-ui-react/swagger-ui.css'

export const Route = createFileRoute('/api-docs')({
  component: ApiDocs,
})

const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'TiraData API',
    version: '1.0.0',
    description: 'API for ingesting and querying TiraData observability data.'
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key'
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  },
  security: [
    { ApiKeyAuth: [] },
    { BearerAuth: [] }
  ],
  paths: {
    '/api/ingest/log': {
      post: {
        summary: 'Ingest Logs',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  level: { type: 'string', default: 'info' },
                  service: { type: 'string', default: 'unknown' },
                  attributes: { type: 'object' },
                  timestamp: { type: 'number', description: 'Unix ms timestamp' }
                },
                required: ['message']
              }
            }
          }
        },
        responses: {
          '202': { description: 'Accepted' },
          '400': { description: 'Invalid payload' },
          '401': { description: 'Unauthorized' }
        }
      }
    },
    '/api/ingest/metric': {
      post: {
        summary: 'Ingest Metrics',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  value: { type: 'number' },
                  labels: { type: 'object' },
                  timestamp: { type: 'number' }
                },
                required: ['name', 'value']
              }
            }
          }
        },
        responses: {
          '202': { description: 'Accepted' }
        }
      }
    },
    '/api/ingest/trace': {
      post: {
        summary: 'Ingest Traces',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  trace_id: { type: 'string' },
                  span_id: { type: 'string' },
                  parent_id: { type: 'string' },
                  name: { type: 'string' },
                  duration: { type: 'number' },
                  start_time: { type: 'number' },
                  attributes: { type: 'object' }
                },
                required: ['trace_id', 'span_id', 'name', 'duration']
              }
            }
          }
        },
        responses: {
          '202': { description: 'Accepted' }
        }
      }
    },
    '/api/logs': {
      get: {
        summary: 'Query Logs',
        parameters: [
          { name: 'service', in: 'query', schema: { type: 'string' } },
          { name: 'level', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'number', default: 200 } }
        ],
        responses: {
          '200': { description: 'Successful query' }
        }
      }
    },
    '/api/auth/signup': {
      post: {
        summary: 'Sign Up',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' }
                },
                required: ['email', 'password']
              }
            }
          }
        },
        responses: {
          '200': { description: 'Successful signup' }
        }
      }
    },
    '/api/auth/login': {
      post: {
        summary: 'Login',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' }
                },
                required: ['email', 'password']
              }
            }
          }
        },
        responses: {
          '200': { description: 'Successful login' }
        }
      }
    }
  }
}

function ApiDocs() {
  return (
    <div className="p-6 bg-white dark:bg-[#0a0b0f] min-h-full swagger-container">
      <style>{`
        /* Overrides to make Swagger match dark mode aesthetics when dark mode is active */
        .dark .swagger-ui { filter: invert(88%) hue-rotate(180deg); }
        .dark .swagger-ui .opblock .opblock-summary-method { color: #fff !important; }
        .swagger-container .swagger-ui .wrapper { max-width: 100%; padding: 0 1rem; }
      `}</style>
      <div className="mb-4">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">API Documentation</h1>
        <p className="text-slate-500 mt-2">
          Use the API endpoints below to ingest data, execute queries, and interact with the platform natively.
        </p>
      </div>
      
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <SwaggerUI spec={openApiSpec} />
      </div>
    </div>
  )
}
