const fs = require('fs');
const path = require('path');

const swaggerPath = path.join(__dirname, '../gitsink-api-swagger.json');
const outputPath = path.join(__dirname, '../gitsink-api.postman_collection.json');

const swagger = JSON.parse(fs.readFileSync(swaggerPath, 'utf8'));

const collection = {
    info: {
        name: swagger.info.title || 'GitSink API',
        description: swagger.info.description || '',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [],
    variable: [
        {
            key: 'baseUrl',
            value: 'http://localhost:3000',
            type: 'string'
        },
        {
            key: 'token',
            value: '',
            type: 'string'
        },
        {
            key: 'apiKey',
            value: '',
            type: 'string'
        }
    ]
};

// Helper to generate realistic dummy data from schema
function generateExample(schema, components, propertyName = '') {
    if (!schema) return null;

    // Handle Direct Example first
    if (schema.example !== undefined) return schema.example;

    // Handle Ref
    if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        const def = components?.schemas?.[refName];
        return generateExample(def, components, refName);
    }

    // Handle AllOf (Merge properties)
    if (schema.allOf) {
        let merged = {};
        schema.allOf.forEach(sub => {
            const result = generateExample(sub, components, propertyName);
            if (typeof result === 'object' && result !== null) {
                Object.assign(merged, result);
            }
        });
        return merged;
    }

    // Handle OneOf/AnyOf (take first)
    if (schema.oneOf && schema.oneOf.length > 0) {
        return generateExample(schema.oneOf[0], components, propertyName);
    }
    if (schema.anyOf && schema.anyOf.length > 0) {
        return generateExample(schema.anyOf[0], components, propertyName);
    }

    // Array
    if (schema.type === 'array') {
        const item = generateExample(schema.items, components, propertyName);
        return item ? [item] : [];
    }

    // Object with properties
    if (schema.type === 'object' || schema.properties) {
        const obj = {};
        if (schema.properties) {
            Object.keys(schema.properties).forEach(key => {
                const prop = schema.properties[key];
                obj[key] = generateExample(prop, components, key);
            });
        }
        return obj;
    }

    // Primitives with smart heuristics based on property name and format
    const nameLower = propertyName.toLowerCase();

    if (schema.type === 'string') {
        // Check format first
        if (schema.format === 'date-time') return '2026-01-12T00:00:00.000Z';
        if (schema.format === 'date') return '2026-01-12';
        if (schema.format === 'email') return 'user@example.com';
        if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
        if (schema.format === 'uri' || schema.format === 'url') return 'https://example.com';

        // Smart heuristics based on property name
        if (nameLower.includes('email')) return 'user@example.com';
        if (nameLower.includes('password')) return 'SecurePassword123!';
        if (nameLower.includes('username')) return 'johndoe';
        if (nameLower.includes('name') && !nameLower.includes('username')) return 'John Doe';
        if (nameLower.includes('token')) return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
        if (nameLower.includes('apikey') || nameLower === 'api_key') return 'sk_live_abc123xyz789';
        if (nameLower.includes('id') && !nameLower.includes('valid')) return '123e4567-e89b-12d3-a456-426614174000';
        if (nameLower.includes('url') || nameLower.includes('link')) return 'https://example.com';
        if (nameLower.includes('description')) return 'A sample description';
        if (nameLower.includes('title')) return 'Sample Title';
        if (nameLower.includes('message')) return 'Operation completed successfully';
        if (nameLower.includes('code')) return 'github_oauth_code_abc123';
        if (nameLower.includes('reason')) return 'user_requested';
        if (nameLower.includes('tier')) return 'free';
        if (nameLower.includes('status')) return 'active';
        if (nameLower.includes('language')) return 'TypeScript';
        if (nameLower.includes('platform')) return 'github';

        // Default string with enum support
        if (schema.enum && schema.enum.length > 0) return schema.enum[0];
        return 'string_value';
    }

    if (schema.type === 'number' || schema.type === 'integer') {
        if (nameLower.includes('count') || nameLower.includes('total')) return 42;
        if (nameLower.includes('port')) return 3000;
        if (nameLower.includes('limit')) return 100;
        if (nameLower.includes('page')) return 1;
        if (nameLower.includes('size')) return 10;
        if (nameLower.includes('expires') || nameLower.includes('ttl')) return 900;
        if (nameLower.includes('star') || nameLower.includes('fork')) return 150;
        return schema.minimum || 0;
    }

    if (schema.type === 'boolean') {
        if (nameLower.includes('success') || nameLower.includes('active') || nameLower.includes('enabled')) return true;
        if (nameLower.includes('private') || nameLower.includes('hidden')) return false;
        return true;
    }

    return null;
}

// Map tags to folders
const folders = {};
if (swagger.tags) {
    swagger.tags.forEach(tag => {
        folders[tag.name] = {
            name: tag.name,
            description: tag.description,
            item: []
        };
    });
}

// Map Status to Text
const statusText = {
    200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
    429: 'Too Many Requests', 500: 'Internal Server Error'
};

// Process paths
Object.keys(swagger.paths).forEach(pathKey => {
    const pathItem = swagger.paths[pathKey];

    Object.keys(pathItem).forEach(method => {
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
            const op = pathItem[method];
            const folderName = op.tags && op.tags.length > 0 ? op.tags[0] : 'Other';

            if (!folders[folderName]) {
                folders[folderName] = {
                    name: folderName,
                    item: []
                };
            }

            // Convert URL variables {param} to :param
            const postmanUrl = pathKey.replace(/{([^}]+)}/g, ':$1');
            const pathSegments = postmanUrl.split('/').filter(s => s.length > 0);

            const request = {
                method: method.toUpperCase(),
                header: [],
                url: {
                    raw: '{{baseUrl}}' + postmanUrl,
                    host: ['{{baseUrl}}'],
                    path: pathSegments,
                    variable: []
                }
            };

            // Add path variables with example values
            if (op.parameters) {
                op.parameters.forEach(param => {
                    if (param.in === 'path') {
                        let exampleValue = param.example || '';
                        if (!exampleValue) {
                            if (param.name.toLowerCase().includes('id')) exampleValue = '123e4567-e89b-12d3-a456-426614174000';
                            else if (param.name.toLowerCase().includes('url')) exampleValue = 'https%3A%2F%2Fgithub.com%2Fuser%2Frepo';
                            else exampleValue = 'example_value';
                        }
                        request.url.variable.push({
                            key: param.name,
                            value: exampleValue,
                            description: param.description || ''
                        });
                    }
                    if (param.in === 'query') {
                        if (!request.url.query) request.url.query = [];
                        request.url.query.push({
                            key: param.name,
                            value: param.example || '',
                            description: param.description || '',
                            disabled: !param.required
                        });
                    }
                    if (param.in === 'header') {
                        request.header.push({
                            key: param.name,
                            value: param.example || '',
                            description: param.description || ''
                        });
                    }
                });
            }

            // Authentication
            const security = op.security || swagger.security;
            if (security) {
                security.forEach(sec => {
                    if (sec['bearer']) {
                        request.auth = {
                            type: 'bearer',
                            bearer: [
                                { key: 'token', value: '{{token}}', type: 'string' }
                            ]
                        };
                    } else if (sec['x-api-key']) {
                        request.header.push({
                            key: 'x-api-key',
                            value: '{{apiKey}}',
                            type: 'text'
                        });
                    }
                });
            }

            // Request Body
            let requestBodyExample = null;
            if (op.requestBody) {
                const content = op.requestBody.content;
                if (content && content['application/json']) {
                    const schema = content['application/json'].schema;
                    requestBodyExample = generateExample(schema, swagger.components, '');

                    request.body = {
                        mode: 'raw',
                        raw: JSON.stringify(requestBodyExample, null, 2),
                        options: {
                            raw: { language: 'json' }
                        }
                    };
                    request.header.push({
                        key: 'Content-Type',
                        value: 'application/json'
                    });
                }
            }

            // Response Examples
            const responses = [];
            if (op.responses) {
                Object.keys(op.responses).forEach(status => {
                    const resDef = op.responses[status];
                    let exampleBody = null;

                    if (resDef.content && resDef.content['application/json']) {
                        const resSchema = resDef.content['application/json'].schema;
                        // Check for explicit example first
                        if (resDef.content['application/json'].example) {
                            exampleBody = resDef.content['application/json'].example;
                        } else if (resSchema) {
                            exampleBody = generateExample(resSchema, swagger.components, '');
                        }
                    }

                    const statusCode = parseInt(status);
                    const statusName = statusText[statusCode] || 'Response';
                    const description = resDef.description || statusName;

                    responses.push({
                        name: `${status} ${statusName} - ${description}`,
                        originalRequest: {
                            method: request.method,
                            url: JSON.parse(JSON.stringify(request.url)),
                            header: JSON.parse(JSON.stringify(request.header)),
                            body: request.body ? JSON.parse(JSON.stringify(request.body)) : undefined
                        },
                        status: statusName,
                        code: statusCode,
                        _postman_previewlanguage: 'json',
                        header: [
                            { key: 'Content-Type', value: 'application/json; charset=utf-8' }
                        ],
                        cookie: [],
                        body: exampleBody ? JSON.stringify(exampleBody, null, 2) : ''
                    });
                });
            }

            folders[folderName].item.push({
                name: op.summary || op.operationId || `${method.toUpperCase()} ${pathKey}`,
                request: request,
                response: responses
            });
        }
    });
});

// Add folders to collection
Object.keys(folders).forEach(key => {
    if (folders[key].item.length > 0) {
        collection.item.push(folders[key]);
    }
});

// Add GraphQL Folder manually
collection.item.push({
    name: 'GraphQL',
    description: 'GraphQL Endpoint',
    item: [
        {
            name: 'Introspection Query',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'Authorization', value: 'Bearer {{token}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: 'query {\n  __schema {\n    types {\n      name\n      kind\n    }\n  }\n}',
                        variables: '{}'
                    }
                }
            },
            response: [
                {
                    name: '200 OK - Introspection Result',
                    originalRequest: {
                        method: 'POST',
                        url: {
                            raw: '{{baseUrl}}/graphql',
                            host: ['{{baseUrl}}'],
                            path: ['graphql']
                        }
                    },
                    status: 'OK',
                    code: 200,
                    _postman_previewlanguage: 'json',
                    header: [{ key: 'Content-Type', value: 'application/json' }],
                    cookie: [],
                    body: JSON.stringify({ data: { __schema: { types: [{ name: 'Query', kind: 'OBJECT' }] } } }, null, 2)
                }
            ]
        },
        {
            name: 'Sample Query - Get Projects',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'Authorization', value: 'Bearer {{token}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: 'query GetProjects {\n  projects {\n    id\n    name\n    description\n    language\n    stars\n    forks\n  }\n}',
                        variables: '{}'
                    }
                }
            },
            response: []
        }
    ]
});

fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));
console.log('Postman collection generated successfully!');
console.log('Output: ' + outputPath);
console.log('Total folders: ' + collection.item.length);
console.log('Total requests: ' + collection.item.reduce((acc, folder) => acc + (folder.item?.length || 0), 0));
