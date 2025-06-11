# GraphQL Examples

All GraphQL operations are served at `/graphql`.
Requests must include the `x-api-key` header.

## Query Projects

```graphql
query {
  projects {
    id
    title
  }
}
```

Example response:

```json
{
  "data": {
    "projects": [
      {
        "id": "1",
        "title": "Test Project"
      }
    ]
  }
}
```

## Sync a Repository

```graphql
mutation {
  syncProject(input: { repoUrl: "https://github.com/user/repo" }) {
    enqueued
  }
}
```

Response:

```json
{
  "data": {
    "syncProject": {
      "enqueued": true
    }
  }
}
```

## Signup a User

```graphql
mutation {
  signup(email: "user@example.com") {
    apiKey
    user { id email }
  }
}
```

Example response:

```json
{
  "data": {
    "signup": {
      "apiKey": "<newKey>",
      "user": { "id": "1", "email": "user@example.com" }
    }
  }
}
```

## Input Types

`SyncProjectInput` and `ProjectFilterInput` are the main objects used by
mutations and queries.

```
input SyncProjectInput {
  repoUrl: String!
  branch: String
}

input ProjectFilterInput {
  tag: String
  category: String
  featured: Boolean
}
```
