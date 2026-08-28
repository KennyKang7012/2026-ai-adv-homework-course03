const fs = require('fs');
const path = require('path');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

const AUTH_TOKEN_SAVE_SCRIPT = [
  "if (pm.response.code === 200 || pm.response.code === 201) {",
  "  const json = pm.response.json();",
  "  if (json && json.data && json.data.token) {",
  "    pm.collectionVariables.set('token', json.data.token);",
  "  }",
  "}",
];

// Cart routes accept EITHER Bearer OR X-Session-Id. The server checks the
// Authorization header FIRST (src/routes/cartRoutes.js `dualAuth`) — an empty/
// invalid Bearer token wins over a valid X-Session-Id and returns 401. This
// pre-request script strips an empty Authorization header so guest-mode
// (X-Session-Id) still works out of the box when `token` hasn't been set yet.
const DUAL_AUTH_PREREQUEST_SCRIPT = [
  "if (!pm.collectionVariables.get('token')) {",
  "  pm.request.headers.remove('Authorization');",
  "}",
];

const NAME_HEURISTICS = {
  email: 'test@example.com',
  password: 'password123',
  name: 'Test Name',
  recipientname: 'Test Recipient',
  recipientemail: 'test@example.com',
  recipientaddress: '台北市測試路 123 號',
  address: '台北市測試路 123 號',
  description: 'Sample description',
  price: 100,
  stock: 50,
  quantity: 1,
  image_url: 'https://example.com/image.jpg',
  shippingmethod: 'home_delivery',
  isremotearea: false,
  isexpress: false,
};

function dummyValueForProperty(name, schema = {}) {
  const key = name.toLowerCase();
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (key in NAME_HEURISTICS) return NAME_HEURISTICS[key];
  if (key.endsWith('id')) return `<${name}>`;

  switch (schema.type) {
    case 'string':
      return schema.format === 'email' ? 'test@example.com' : 'string';
    case 'integer':
    case 'number':
      return typeof schema.minimum === 'number' ? schema.minimum : 1;
    case 'boolean':
      return typeof schema.default === 'boolean' ? schema.default : false;
    default:
      return null;
  }
}

function buildExampleBody(schema) {
  if (!schema || schema.type !== 'object' || !schema.properties) return {};
  const body = {};
  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    body[propName] = dummyValueForProperty(propName, propSchema);
  }
  return body;
}

function convertPath(openApiPath) {
  const pathParamNames = [];
  const segments = openApiPath
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      const match = seg.match(/^\{(.+)\}$/);
      if (match) {
        pathParamNames.push(match[1]);
        return ':' + match[1];
      }
      return seg;
    });
  return { segments, pathParamNames };
}

function buildAuth(op) {
  const security = op.security;
  if (!security || security.length === 0) {
    return { type: 'noauth' };
  }
  const schemeNames = security.map((entry) => Object.keys(entry)[0]);
  const hasBearer = schemeNames.includes('bearerAuth');
  const hasSessionId = schemeNames.includes('sessionId');

  if (hasBearer && hasSessionId) {
    return { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }], dualAuth: true };
  }
  if (hasBearer) {
    return { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] };
  }
  return { type: 'noauth' };
}

function buildItem(method, pathStr, op) {
  const { segments, pathParamNames } = convertPath(pathStr);
  const headers = [];
  let body;

  if (op.requestBody) {
    const schema = op.requestBody.content['application/json'].schema;
    body = {
      mode: 'raw',
      raw: JSON.stringify(buildExampleBody(schema), null, 2),
      options: { raw: { language: 'json' } },
    };
    headers.push({ key: 'Content-Type', value: 'application/json' });
  }

  const auth = buildAuth(op);
  const isDualAuth = Boolean(auth.dualAuth);
  if (isDualAuth) {
    headers.push({ key: 'X-Session-Id', value: '{{sessionId}}' });
  }

  const item = {
    name: op.summary || `${method.toUpperCase()} ${pathStr}`,
    request: {
      method: method.toUpperCase(),
      header: headers,
      url: {
        raw: '{{baseUrl}}' + pathStr.replace(/\{([^}]+)\}/g, ':$1'),
        host: ['{{baseUrl}}'],
        path: segments,
        ...(pathParamNames.length > 0
          ? { variable: pathParamNames.map((name) => ({ key: name, value: `<${name}>` })) }
          : {}),
      },
      auth: isDualAuth ? { type: 'bearer', bearer: auth.bearer } : auth,
      ...(body ? { body } : {}),
    },
  };

  const events = [];
  if (isDualAuth) {
    events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: DUAL_AUTH_PREREQUEST_SCRIPT } });
  }
  if (method === 'post' && (pathStr === '/api/auth/login' || pathStr === '/api/auth/register')) {
    events.push({ listen: 'test', script: { type: 'text/javascript', exec: AUTH_TOKEN_SAVE_SCRIPT } });
  }
  if (events.length > 0) item.event = events;

  return item;
}

function main() {
  const openapiPath = path.join(__dirname, 'openapi.json');
  const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf-8'));

  const folderOrder = [];
  const folders = new Map();

  for (const [pathStr, methods] of Object.entries(openapi.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!HTTP_METHODS.includes(method)) continue;
      const tag = (op.tags && op.tags[0]) || 'Misc';
      if (!folders.has(tag)) {
        folders.set(tag, []);
        folderOrder.push(tag);
      }
      folders.get(tag).push(buildItem(method, pathStr, op));
    }
  }

  const baseUrl = (openapi.servers && openapi.servers[0] && openapi.servers[0].url) || 'http://localhost:3001';

  const collection = {
    info: {
      name: openapi.info.title || 'API Collection',
      description: openapi.info.description || '',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      { key: 'baseUrl', value: baseUrl },
      { key: 'token', value: '' },
      { key: 'sessionId', value: '' },
    ],
    item: folderOrder.map((tag) => ({ name: tag, item: folders.get(tag) })),
  };

  fs.writeFileSync(path.join(__dirname, 'postman_collection.json'), JSON.stringify(collection, null, 2));
  console.log('postman_collection.json generated successfully');
}

main();
