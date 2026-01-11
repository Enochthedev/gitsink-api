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
        },
        {
            key: 'userId',
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
        if (nameLower.includes('branch')) return 'main';
        if (nameLower.includes('repo')) return 'https://github.com/user/repo';

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

// ============================================
// ADD COMPREHENSIVE GRAPHQL FOLDER
// ============================================
const graphqlFolder = {
    name: 'GraphQL',
    description: 'GraphQL API Endpoint - All queries and mutations',
    item: [
        // ---- INTROSPECTION ----
        {
            name: 'Schema Introspection',
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
                        query: `query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    types {
      name
      kind
      fields {
        name
        type { name kind }
      }
    }
  }
}`,
                        variables: '{}'
                    }
                }
            },
            response: []
        },
        // ---- AUTH MUTATIONS ----
        {
            name: 'Mutation: Signup',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `mutation Signup($email: String!) {
  signup(email: $email) {
    user {
      id
      email
      username
    }
    apiKey
  }
}`,
                        variables: JSON.stringify({ email: 'newuser@example.com' }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Mutation: Connect GitHub',
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
                        query: `mutation ConnectGitHub($userId: String!, $githubId: String!, $githubToken: String!) {
  connectGitHub(userId: $userId, githubId: $githubId, githubToken: $githubToken) {
    id
    email
    githubId
  }
}`,
                        variables: JSON.stringify({
                            userId: '{{userId}}',
                            githubId: 'github_user_12345',
                            githubToken: 'gho_xxxxxxxxxxxx'
                        }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Mutation: Regenerate API Key',
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
                        query: `mutation RegenerateApiKey($userId: String!) {
  regenerateApiKey(userId: $userId) {
    user {
      id
      email
    }
    apiKey
  }
}`,
                        variables: JSON.stringify({ userId: '{{userId}}' }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Mutation: Revoke API Key',
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
                        query: `mutation RevokeApiKey($userId: String!) {
  revokeApiKey(userId: $userId) {
    id
    email
  }
}`,
                        variables: JSON.stringify({ userId: '{{userId}}' }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Mutation: GitHub OAuth',
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
                        query: `mutation GitHubOAuth($userId: String!, $code: String!) {
  githubOAuth(userId: $userId, code: $code) {
    id
    email
    githubId
  }
}`,
                        variables: JSON.stringify({
                            userId: '{{userId}}',
                            code: 'github_oauth_code_from_callback'
                        }, null, 2)
                    }
                }
            },
            response: []
        },
        // ---- PROJECT QUERIES ----
        {
            name: 'Query: Ping',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query Ping {
  ping
}`,
                        variables: '{}'
                    }
                }
            },
            response: []
        },
        {
            name: 'Query: Get All Projects',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query GetProjects {
  projects {
    id
    name
    description
    repoUrl
    language
    stars
    forks
    isPrivate
    lastSyncedAt
    createdAt
    updatedAt
  }
}`,
                        variables: '{}'
                    }
                }
            },
            response: []
        },
        {
            name: 'Query: Get Single Project',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query GetProject($repoUrl: String!) {
  project(repoUrl: $repoUrl) {
    id
    name
    description
    repoUrl
    language
    stars
    forks
    topics
    readme
    portfolioContent
  }
}`,
                        variables: JSON.stringify({ repoUrl: 'https://github.com/user/repo' }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Query: Filtered Projects',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query FilteredProjects($filter: ProjectFilterInput) {
  filteredProjects(filter: $filter) {
    id
    name
    language
    stars
    isPrivate
  }
}`,
                        variables: JSON.stringify({
                            filter: {
                                language: 'TypeScript',
                                isPrivate: false
                            }
                        }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Query: Enhanced Projects (Paginated)',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query EnhancedProjects($filter: EnhancedProjectFilterInput, $sort: ProjectSortInput, $pagination: PaginationInput) {
  enhancedProjects(filter: $filter, sort: $sort, pagination: $pagination) {
    edges {
      node {
        id
        name
        language
        stars
      }
      cursor
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    totalCount
  }
}`,
                        variables: JSON.stringify({
                            filter: { languages: ['TypeScript', 'JavaScript'] },
                            sort: { field: 'stars', direction: 'DESC' },
                            pagination: { offset: 0, limit: 10 }
                        }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Query: Search Projects',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query SearchProjects($query: String!, $filter: EnhancedProjectFilterInput, $pagination: PaginationInput) {
  searchProjects(query: $query, filter: $filter, pagination: $pagination) {
    id
    name
    description
    language
    stars
  }
}`,
                        variables: JSON.stringify({
                            query: 'api',
                            pagination: { offset: 0, limit: 20 }
                        }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Query: Project Statistics',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query ProjectStatistics($filter: EnhancedProjectFilterInput) {
  projectStatistics(filter: $filter) {
    totalProjects
    totalStars
    totalForks
    languageDistribution {
      language
      count
      percentage
    }
  }
}`,
                        variables: JSON.stringify({ filter: {} }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Query: Trending Projects',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query TrendingProjects($timeframe: String, $limit: Int) {
  trendingProjects(timeframe: $timeframe, limit: $limit) {
    id
    name
    stars
    forks
    language
  }
}`,
                        variables: JSON.stringify({ timeframe: '7d', limit: 10 }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Query: Featured Projects',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query FeaturedProjects($limit: Int) {
  featuredProjects(limit: $limit) {
    id
    name
    description
    stars
    language
  }
}`,
                        variables: JSON.stringify({ limit: 10 }, null, 2)
                    }
                }
            },
            response: []
        },
        // ---- PROJECT MUTATIONS ----
        {
            name: 'Mutation: Sync Single Project',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `mutation SyncProject($input: SyncProjectInput!) {
  syncProject(input: $input) {
    enqueued
  }
}`,
                        variables: JSON.stringify({
                            input: {
                                repoUrl: 'https://github.com/user/repo',
                                branch: 'main'
                            }
                        }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Mutation: Sync All Projects',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `mutation SyncAllProjects {
  syncAllProjects
}`,
                        variables: '{}'
                    }
                }
            },
            response: []
        },
        // ---- PROFILE QUERIES ----
        {
            name: 'Query: My Profile',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query MyProfile {
  myProfile {
    id
    username
    displayName
    bio
    avatarUrl
    isPublic
    socialLinks {
      platform
      url
    }
    projects {
      id
      name
    }
  }
}`,
                        variables: '{}'
                    }
                }
            },
            response: []
        },
        {
            name: 'Query: Public Profile',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query PublicProfile($username: String!) {
  publicProfile(username: $username) {
    id
    username
    displayName
    bio
    avatarUrl
    socialLinks {
      platform
      url
    }
    projects {
      id
      name
      stars
    }
  }
}`,
                        variables: JSON.stringify({ username: 'johndoe' }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Query: Search Profiles',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query SearchProfiles($query: String!, $limit: Int, $offset: Int) {
  searchProfiles(query: $query, limit: $limit, offset: $offset) {
    id
    username
    displayName
    avatarUrl
  }
}`,
                        variables: JSON.stringify({ query: 'developer', limit: 20, offset: 0 }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Query: Featured Profiles',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query FeaturedProfiles($limit: Int) {
  featuredProfiles(limit: $limit) {
    id
    username
    displayName
    avatarUrl
  }
}`,
                        variables: JSON.stringify({ limit: 10 }, null, 2)
                    }
                }
            },
            response: []
        },
        // ---- PROFILE MUTATIONS ----
        {
            name: 'Mutation: Create Profile',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `mutation CreateProfile($input: CreateProfileInput!) {
  createProfile(input: $input) {
    id
    username
    displayName
    bio
  }
}`,
                        variables: JSON.stringify({
                            input: {
                                username: 'johndoe',
                                displayName: 'John Doe',
                                bio: 'Full-stack developer passionate about open source'
                            }
                        }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Mutation: Update Profile',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `mutation UpdateProfile($input: UpdateProfileInput!) {
  updateProfile(input: $input) {
    id
    username
    displayName
    bio
    avatarUrl
  }
}`,
                        variables: JSON.stringify({
                            input: {
                                displayName: 'John Updated',
                                bio: 'Updated bio text'
                            }
                        }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Mutation: Delete Profile',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' },
                    { key: 'x-api-key', value: '{{apiKey}}' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `mutation DeleteProfile {
  deleteProfile
}`,
                        variables: '{}'
                    }
                }
            },
            response: []
        },
        // ---- UTILITY QUERIES ----
        {
            name: 'Query: Is Username Available',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query IsUsernameAvailable($username: String!) {
  isUsernameAvailable(username: $username)
}`,
                        variables: JSON.stringify({ username: 'newusername' }, null, 2)
                    }
                }
            },
            response: []
        },
        {
            name: 'Query: Supported Platforms',
            request: {
                method: 'POST',
                header: [
                    { key: 'Content-Type', value: 'application/json' }
                ],
                url: {
                    raw: '{{baseUrl}}/graphql',
                    host: ['{{baseUrl}}'],
                    path: ['graphql']
                },
                body: {
                    mode: 'graphql',
                    graphql: {
                        query: `query GetSupportedPlatforms {
  getSupportedPlatforms
}`,
                        variables: '{}'
                    }
                }
            },
            response: []
        }
    ]
};

collection.item.push(graphqlFolder);

fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));
console.log('Postman collection generated successfully!');
console.log('Output: ' + outputPath);
console.log('Total folders: ' + collection.item.length);
console.log('Total REST requests: ' + collection.item.filter(f => f.name !== 'GraphQL').reduce((acc, folder) => acc + (folder.item?.length || 0), 0));
console.log('Total GraphQL requests: ' + graphqlFolder.item.length);
