---
sidebar_position: 10
---

# Projects API

All endpoints require an API key via the `x-api-key` header.

## List Projects

`GET /projects`

Returns all projects that belong to the authenticated user.

## Get Project

`GET /projects/:id`

Returns a single project by ID.

## Sync Repositories

`POST /sync`

Triggers synchronization of all GitHub repositories for the user.
