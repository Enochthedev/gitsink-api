# Custom Metadata Management

The Gitsink API provides comprehensive custom metadata management capabilities that allow developers to store, retrieve, and search custom metadata for their projects. This metadata can be defined in Portfolio.md files or managed directly through the API.

## Features

### Core Functionality
- **Versioned Metadata Storage**: Store multiple versions of metadata with automatic versioning
- **Validation and Sanitization**: Comprehensive validation with security sanitization
- **Search and Filtering**: Advanced search capabilities with multiple operators
- **Caching**: Redis-based caching for optimal performance
- **Audit Trail**: Complete history tracking of all metadata changes

### API Endpoints

#### Store/Update Metadata
```http
POST /metadata
PUT /metadata/:projectId
```

Store or update custom metadata for a project with automatic versioning.

**Request Body:**
```json
{
  "projectId": "project-uuid",
  "metadata": {
    "category": "web",
    "framework": "react",
    "tags": ["frontend", "javascript"],
    "customField": "value"
  },
  "version": 1
}
```

#### Retrieve Metadata
```http
GET /metadata/:projectId?version=1
```

Retrieve metadata for a specific project, optionally for a specific version.

#### Search by Metadata
```http
POST /metadata/search
```

Search projects by custom metadata with advanced filtering.

**Request Body:**
```json
{
  "field": "category",
  "value": "web",
  "operator": "equals",
  "dataType": "string"
}
```

**Supported Operators:**
- `equals`: Exact match
- `contains`: String contains (case-insensitive)
- `gt`, `gte`, `lt`, `lte`: Numeric comparisons
- `in`: Value in array
- `exists`: Field exists

#### Metadata History
```http
GET /metadata/:projectId/history?limit=10&offset=0
```

Get version history for project metadata.

#### Compare Versions
```http
GET /metadata/:projectId/compare/:version1/:version2
```

Compare two metadata versions to see differences.

#### User Statistics
```http
GET /metadata/statistics/user
```

Get metadata usage statistics for the current user.

#### Delete Version
```http
DELETE /metadata/:projectId/versions/:version
```

Delete a specific metadata version.

## Portfolio.md Integration

Custom metadata can be defined in Portfolio.md files using YAML frontmatter:

```markdown
---
category: web
framework: react
tags:
  - frontend
  - javascript
  - typescript
difficulty: intermediate
features:
  - responsive-design
  - dark-mode
  - authentication
---

# My Awesome Project

Project description here...
```

### Supported Metadata Fields

- **category**: Project category (web, mobile, desktop, etc.)
- **framework**: Primary framework or technology
- **tags**: Array of descriptive tags
- **difficulty**: Project complexity (beginner, intermediate, advanced)
- **features**: Array of key features
- **status**: Development status (active, completed, archived)
- **license**: Project license
- **demo_url**: Live demo URL
- **custom fields**: Any additional custom fields

## Validation Rules

### Reserved Fields
The following field names are reserved and cannot be used:
- `id`
- `createdAt`
- `updatedAt`
- `userId`
- `projectId`

### Size Limits
- Maximum metadata size: 100KB
- Maximum field count: 100 fields
- Field names must be valid identifiers

### Security
- HTML/JavaScript content is automatically sanitized
- Dangerous patterns are detected and removed
- Input validation prevents injection attacks

## Caching Strategy

- Metadata is cached for 1 hour after retrieval
- Cache is automatically invalidated on updates
- History and statistics are cached for 30 minutes
- Cache keys are user and project specific

## Error Handling

All endpoints return standardized error responses:

```json
{
  "success": false,
  "error": "Detailed error message",
  "warnings": ["Optional warning messages"]
}
```

Common error scenarios:
- Validation failures
- Size limit exceeded
- Reserved field usage
- Project not found
- Access denied

## Performance Considerations

- Use caching for frequently accessed metadata
- Implement pagination for large result sets
- Consider field indexing for frequently searched fields
- Monitor query performance and optimize as needed

## Examples

### Basic Metadata Storage
```javascript
const response = await fetch('/metadata', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    projectId: 'project-uuid',
    metadata: {
      category: 'web',
      framework: 'react',
      tags: ['frontend', 'javascript']
    }
  })
});
```

### Advanced Search
```javascript
const searchResponse = await fetch('/metadata/search', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    field: 'tags',
    value: ['react', 'typescript'],
    operator: 'in'
  })
});
```

### Version Comparison
```javascript
const comparison = await fetch('/metadata/project-uuid/compare/1/2', {
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});

const diff = await comparison.json();
console.log('Added:', diff.data.added);
console.log('Removed:', diff.data.removed);
console.log('Modified:', diff.data.modified);
```