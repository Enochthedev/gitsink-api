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

// Helper to generate dummy data from schema
function generateExample(schema, components) {
    if (!schema) return null;

    // Handle Direct Example
    if (schema.example) return schema.example;

    // Handle Ref
    if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        const def = components.schemas?.[refName];
        // Prevent infinite recursion if generic recursive logic (basic safecheck)
        // ideally we pass a 'depth' or 'visited' map, but for now simple recursion is usually fine for DTOs
        // unless circular. GitSink DTOs seem fine.
        return generateExample(def, components);
    }

    // Handle AllOf (Merge properties)
    if (schema.allOf) {
        let merged = {};
        schema.allOf.forEach(sub => {
            const result = generateExample(sub, components);
            if (typeof result === 'object' && result !== null) {
                Object.assign(merged, result);
            }
        });
        return merged;
    }

    // Array
    if (schema.type === 'array') {
        const item = generateExample(schema.items, components);
        return [item];
    }

    // Object
    if (schema.properties) {
        const obj = {};
        Object.keys(schema.properties).forEach(key => {
            const prop = schema.properties[key];
            obj[key] = generateExample(prop, components);
        });
        return obj;
    }

    // Primitives with heuristics for "Wow" factor
    if (schema.type === 'string') {
        if (schema.format === 'date-time') return new Date().toISOString();
        if (schema.format === 'email') return 'user@example.com';
        if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
        if (schema.format === 'uri') return 'https://example.com/resource';
        // Heuristic based on key name if available? (Can't see key name here easily without passing it down)
        return 'string';
    }
    if (schema.type === 'number' || schema.type === 'integer') return 0;
    if (schema.type === 'boolean') return true;

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

            // Add path variables
            if (op.parameters) {
                op.parameters.forEach(param => {
                    if (param.in === 'path') {
                        request.url.variable.push({
                            key: param.name,
                            value: '',
                            description: param.description
                        });
                    }
                    if (param.in === 'query') {
                        if (!request.url.query) request.url.query = [];
                        request.url.query.push({
                            key: param.name,
                            value: '',
                            description: param.description,
                            disabled: !param.required
                        });
                    }
                    if (param.in === 'header') {
                        request.header.push({
                            key: param.name,
                            value: '',
                            description: param.description
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

            // Body
            if (op.requestBody) {
                const content = op.requestBody.content;
                if (content && content['application/json']) {
                    const schema = content['application/json'].schema;
                    const example = generateExample(schema, swagger.components);

                    request.body = {
                        mode: 'raw',
                        raw: JSON.stringify(example, null, 2),
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

            // Responses (Examples)
            const responses = [];
            if (op.responses) {
                Object.keys(op.responses).forEach(status => {
                    const resDef = op.responses[status];
                    let exampleBody = null;

                    if (resDef.content && resDef.content['application/json']) {
                        exampleBody = generateExample(resDef.content['application/json'].schema, swagger.components);
                    }

                    responses.push({
                        name: `${status} - ${resDef.description || statusText[status] || 'Response'}`,
                        originalRequest: {
                            method: request.method,
                            url: request.url,
                            header: request.header,
                            body: request.body
                        },
                        status: statusText[status] || 'OK',
                        code: parseInt(status),
                        _postman_previewlanguage: 'json',
                        header: [
                            { key: 'Content-Type', value: 'application/json' }
                        ],
                        cookie: [],
                        body: exampleBody ? JSON.stringify(exampleBody, null, 2) : ''
                    });
                });
            }

            folders[folderName].item.push({
                name: op.summary || op.operationId || pathKey,
                request: request,
                response: responses
            });
        }
    });
});

// Add folders to collection
Object.keys(folders).forEach(key => {
    collection.item.push(folders[key]);
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
            response: []
        }
    ]
});

fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));
console.log('Postman collection generated at ' + outputPath);
