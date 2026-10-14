# AGENTS.md - Application Architecture & Development Guide

This monorepo provides a reusable pattern for developing applications. The solution uses generic components and a universal data structure to support different applications without changing the underlying architecture.

## High Level Architecture

The solution uses three primary Azure resources:

- **Azure Static Web App** - Hosts the SvelteKit frontend.
- **Azure Function App** - Hosts the Node.js backend API.
- **Azure Storage Account** - Provides persistent data storage.

The Storage Account contains a table named `guids` and a publicly accessible blob container named `public`, containing `guids.json`.

The SvelteKit frontend reads data from `guids.json` and performs mutations through the Node.js backend API.

Additional resources include:

- **Key Vault, Application Insights and User Assigned Managed Identity** - Supporting infrastructure.
- **auths table** - Stores user authentication data and is not publicly exported.
- **public blob container** - Also stores images and other public resources.

## Data Structure

The solution uses a lightweight property-graph model built on Azure Table Storage. It supports arbitrary data without changing the underlying database structure.

Data is represented by two types of rows: **entities** and **relations**.

### Entity Rows

Entities represent independent objects.

Each entity must contain:

- `pk` - Entity type.
- `rk` - Globally unique ID in the format `entity_YYYY-MM-DD_HH-MM-SS_abc123abc123`.
- `name` - Human-readable name.

Additional attributes may describe the entity itself.

```json
{
  "pk": "user",
  "rk": "user_2026-10-20_13-00-43_abc123abc123",
  "name": "Jane Doe"
}
```

The above example represents a user named Jane Doe with no additional attributes.

### Relation Rows

Relations represent connections between two entities.

Each relationship must contain two mirrored rows:

- `pk` - ID of one entity.
- `rk` - ID of the related entity.
- The second row swaps `pk` and `rk`.
- All other attributes must be identical in both rows.

Additional attributes may describe the relationship between the entities.

```json
[
  {
    "pk": "user_2026-10-20_13-00-43_abc123abc123",
    "rk": "ladder_2025-12-20_13-14-46_abc123abc123",
    "rank": 4,
    "state": "away"
  },
  {
    "pk": "ladder_2025-12-20_13-14-46_abc123abc123",
    "rk": "user_2026-10-20_13-00-43_abc123abc123",
    "rank": 4,
    "state": "away"
  }
]
```

The above example represents a user ranked fourth in a ladder, with their participation state set to `away`.

The `rank` and `state` attributes describe the user's relationship with the ladder, not either entity independently.

### Core Principles

1. Every object is an entity with a type and globally unique ID.
2. Every relationship is represented by two mirrored rows for bidirectional lookup.
3. Entity attributes describe objects; relation attributes describe associations.
4. All entities and relations follow the same storage conventions.
5. Application logic defines validation, meaning and behaviour independently of the storage model.
6. Relationships are traversed by querying an entity's partition and following related IDs.

## Application Development

The backend API and frontend must be developed together. The API handles validation and data mutations, while the frontend handles presentation and user interaction.

## Node.js Backend API

The backend provides endpoints for application actions and reusable services for common operations.

### Scaffolded Services

The following services provide common functionality and should be reused rather than duplicated.

- **doGuidsToPublic** - Exports the guids table to the public guids.json blob.
- **doNewGuid** - Generates a new globally unique entity ID.
- **doSignatureVerification** - Verifies the signature of an incoming API request.
- **doUpsertAuth** - Creates or updates records in the auths table.
- **doUpsertEntity** - Creates or updates an entity row in the guids table.
- **doUpsertRelation** - Creates or updates both mirrored relation rows in the guids table.

These services should cover the data access requirements of new endpoints without introducing additional storage services.

### Scaffolded Endpoints

The following endpoints are provided as part of the application scaffold:

- **system/about** - Returns basic counts of the dataset in the guids table.
- **system/restore** - Purges the guids table and rebuilds it from supplied JSON.
- **user/login** - Authenticates a user.
- **user/otp** - Handles one-time password verification.
- **user/create** - Creates a new user.
- **user/:user_id/update** - Updates an existing user.
- **user/:user_id/delete** - Deletes an existing user.

### Endpoint Development

Each endpoint follows a parameterised route structure, identifying the target entity and action in the URL.

- The HTTP method is always POST.
- The URL identifies the entity type, entity ID and action.
- Each endpoint must be idempotent, preventing repeated mutations or side effects.

Each endpoint expects a JSON payload containing:

- **device_id** - ID of the device.
- **caller_id** - ID of the user.
- **signature** - Signature of the device ID, caller ID and request path.
- **data** - Optional attributes required by the action.

Each endpoint returns a standard JSON response containing:

- **success** - Boolean indicating success or failure.
- **message** - Human-readable message for display to the user.
- **subject** - Optional entity ID for client navigation.
- **data** - Optional data as neccessary

Each endpoint performs a specific action using the existing services:

1. Verify the request signature using `doSignatureVerification`.
2. Fetch the target entity and its relationships from the `guids` table.
3. Validate the request and authorise the action where necessary.
4. Apply the business rules and perform mutations using the existing services, usually `doNewGuid`, `doUpsertEntity` and `doUpsertRelation` as neccessary.
5. Export the updated data using `doGuidsToPublic`.
6. Return the standard response.

Business rules should be implemented inline within the endpoint function. Shared services should handle common operations rather than domain-specific behaviour.

The endpoint must derive existing relationships and context from the `guids` table, rather than requiring the client to supply them.

Example: Complete a match

POST https://app.intra.club/api/match/match_2025-12-20_13-14-46_abc123abc123/complete

Request:

```json
{
  "caller_id": "user_2026-10-20_13-00-43_abc123abc123",
  "device_id": "device_2026-10-20_13-00-43_abc123abc123",
  "signature": "generated_signature",
  "data": {
    "winner": "user_2025-12-20_13-14-46_abc123abc123",
    "winnerScore": 8,
    "loser": "user_2022-12-20_13-14-46_abc123abc123",
    "loserScore": 3
  }
}
```

Response:

```json
{
  "success": true,
  "message": "Jane Doe defeats Mike Fox 8-3",
  "subject": "match_2025-12-20_13-14-46_abc123abc123"
}
```

The above example represents a completed match.

The API retrieves the match entity and its related rows by querying the Match ID as the partition key. It then applies the relevant business rules based on the relationships found, such as updating ladder rankings or tournament progression.

The match's context is determined by the existing data, not by the request URL or payload.

## SvelteKit Frontend

The frontend provides the user interface using SvelteKit, with reactive stores managing application data and the backend API handling mutations.

### Scaffolded Stores

Svelte stores provide shared, reactive application state.

- **guids** - Contains the dataset loaded from `guids.json` and provides a functions related to the same.
- **local** - Maintains the current user and authentication state and provides a generate_signature function used for API calls.

The `guids` store is the common source of data for all pages and components.
- The dataset is loaded into the store during application initialisation.
- The dataset is updated/refreshed/merged every 90 seconds or on demand after an API is called.
- Pages and components subscribe to the store rather than fetching guids.json independently.
- Entities are identified by their rk.
- Relationships are identified by filtering rows where pk matches an entity ID.
- Entity and relation views are derived reactively from the store.
- Updating the store automatically updates all dependent pages and components.
- The store represents the current public dataset. It must not be directly modified to simulate backend mutations.

### Scaffolded Components

The following layouts and components provide common application functionality.

- **userLogin** - Allows user creation or login flow (calling `user/create`, `user/otp` and `user/login` API endpoints)
- **userUpdate** - Allows user email, phone and name updates (calling `user/:user_id/update` API endpoints)
- **apiService** - Handles API requests, responses and loading

Shared layouts and components should be reused rather than duplicated across pages.

### Scaffolded Layout and Pages

The following pages are provided as part of the application scaffold:

- **+layout.svelte** - Provides the shared application layout (header, footer and navigation buttons) and initialises the stores.
- **+page.svelte** - The root landing page shows login components or redirects to the user page if logged in.
- **user route** - User page displaying user information and edit functionality.

### App Development

Each entity has a page following the parameterised route structure `/:entity/:entity_id`.

Pages display the entity's attributes and use components to display related entities, including attributes describing their relationships.

All pages and components read reactively from the shared `guids` store, ensuring changes to the dataset are automatically reflected in the UI.

Example: User Page

The scaffold includes a user page at `user/:user_id` that:

- Displays the user's attributes from the user entity.
- Shows a userUpdate component only when the displayed user is the currently logged-in user.

The update component calls `user/:user_id/update` using the scaffolded API and signature services. After the response, the shared `guids` store is refreshed before any navigation.

All new development should follow this pattern:

- Each entity type has a page displaying its attributes.
- Related entities are displayed using reusable components, with relation attributes providing context.
- Components should work in either direction of a relationship. For example, a user page displays related ladders, while a ladder page displays related users.
- Pages and components derive their data reactively from the shared `guids` store rather than maintaining separate copies.
- Components and actions are made available to the user based on the data state.

New features should extend this pattern, reusing existing components and services wherever possible.
