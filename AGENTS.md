# Intra Club — AGENTS.md

Intra Club is an application for tennis clubs to manage ladders, competitions and club teams.

Ladders - challenge matches between club members.
Competitions - organised competitive events between club members.
Teams - club teams that play in external events.

The application uses a graph-based data model. Users, clubs, ladders and other objects are represented as entities connected through relationships. App users start at their own entity and traverse the graph reaching any related entity.

This mono repo includes the infrastructure, back end api and front end app

## 1. Data Structure

Intra Club uses a flexible, graph-based data model consisting of **entities** and **relations**. Both are stored in the same Azure Table.

### Entities

An entity represents something with its own identity.

Each entity has:

'pk' - entity type
'rk' - unique entity identifier
'name' - every entity must have a name field
Additional attributes (optional) describing the entity

Entity identifiers are in the form: entity_YYYY-MM-DD_HH-MM-SS_random
where:
entity - entity type: user, ladder, team etc
YYYY-MM-DD - year month day
HH-MM-SS - hour min sec
random - 12 character random string

An entity should contain attributes that describe the entity itself, independently of its relationships with other entities.

### Relations

A relation represents a connection between two entities.

Relations use the identifiers of the connected entities as their keys:

'pk' - first entity ID
'rk' - second entity ID
Additional attributes (optional) describing the relation between the entities

Every relation is stored in both directions, allowing the graph to be traversed from either entity. Both directions contain identical attributes, except for their reversed keys.

Relations may contain attributes describing the connection, including permissions, participation, configuration or mutable state.

### Attribute Placement

When introducing an attribute, determine what it describes:

**Entity attribute** Describes the entity independently of other entities.
**Relation attribute** Describes how two entities are connected or their state within that relationship.

Do not duplicate attributes across entities and relations unnecessarily.

Avoid storing relationships that can already be reliably derived by traversing the graph, unless the additional relationship has independent meaning.

Use booleans for independent states that may coexist, and named values for classifications or mutually exclusive choices.

Use stable machine-readable values for application logic rather than relying on display text.

The model should remain flexible enough to accommodate new entity types and relationships without requiring changes to its fundamental structure.

## 2. Infrastructure and Data Services

Intra Club uses Azure services for data storage, application hosting and back end operations.

### Azure Table Storage

Azure Table Storage holds the application's structured data.

The main tables are:

**guids** - The authoritative source of application entities, relations and their attributes.

**auths** - Private authentication and identity lookup data, including associations between contact identifiers and players.

**logs** - Operational and application logging data.

### Azure Blob Storage

Blob Storage holds data consumed by the application and content that is more appropriately represented as files.

**guids.json** - A JSON export of the `guids` table, containing entities and relations in a flat array. It is generated from the authoritative table data and should not be independently modified.

The exported representation uses:

- `pk` — PartitionKey
- `rk` — RowKey
- `ts` — Azure timestamp
- `et` — Azure ETag

**strings.json** - A public reference file for human-readable application content, such as descriptions, rules, labels and explanatory text. It separates changeable wording from the stable identifiers and values used by application logic.

**Other blob content** - Images, club icons, player images and other file-based assets are stored in Blob Storage.

### Hosting and Deployment

- **Azure Static Web Apps** hosts the Svelte web client.
- **Azure Functions** hosts the API.
- **Managed Identity** is used for access to supported Azure resources.
- **Azure Key Vault** holds secrets where required.
- **Bicep** defines the Azure infrastructure.
- **GitHub Actions** builds and deploys the application.

Infrastructure changes should be maintained in the infrastructure code rather than relying on undocumented manual configuration.

Pipelines are in place to push infra api and app code

## 4. api

Azure Functions provides the application's backend API.

The API is responsible for:

- Authenticating requests and enforcing permissions.
- Applying business rules.
- Coordinating changes across entities and relations.
- Publishing updated data for client consumption.

### Existing Helper Services

The API provides the following foundational services:

`doNewGuid()` - Generate entity identifiers
`doUpsertAuth()` - Create or update and AUTH table entity or relation
`doUpsertEntity()` - Create or update an entity
`doUpsertRelation()` - Create or update both directions of a relation
`doGuidsToPublic()` - Export the `guids` table to public `guids.json`
`doSignatureVerification()` - Signature validation

These services should be reused when implementing new API functionality.

A business operation may involve multiple changes. Complete the required changes before publishing the updated `guids.json`, rather than exporting after every individual write.

The Table remains authoritative; JSON exports are derived representations.

## 5. app

The web client is built using Svelte and SvelteKit and deployed as a static web application.

### Reading Application Data

The client reads `guids.json` from public Blob Storage to obtain application entities and relations.

The client should use this data to build its views and navigate the graph, rather than requiring separate API endpoints for every read operation.

Additional public reference content, such as `strings.json`, and file assets may also be loaded from Blob Storage.

The client may filter and traverse the available graph to construct the user experience.

Client-side filtering is a presentation mechanism, not a security boundary. Data requiring confidentiality must not be included in a publicly accessible export.

### Modifying Application Data

The client must not directly modify Azure Table Storage or the exported JSON.

All changes are made through the Azure Functions API.

## 6. Development Approach

The API and Svelte client should be developed together when implementing new functionality.

When implementing a feature, consider:

- Which entities and relations represent its data.
- Which information the client can read from the existing graph.
- Which operations require API endpoints.
- Which existing services can perform the required changes.

Prefer extending the existing model and services rather than introducing parallel mechanisms for new features.

### Routing

The Svelte client and API should share a consistent URL path structure identifying the entity and action.

The standard path is:

`/{entityType}/{entityId}/{action}`

For example:

- Svelte: `/ladder/ladder_123/join`
- API: `/api/ladder/ladder_123/join`

The Svelte route provides the user interface, while the API performs the operation. An action does not necessarily require a dedicated Svelte page; it may be performed from an existing view.

Creation and other operations without an existing entity ID may use an appropriate action path, such as `/api/ladder/create`.

### API Request

All API operations use the HTTP `POST` method.

Operation parameters must be supplied in the request body rather than URL query parameters.

Authenticated requests use the following structure:

```json
{
  "caller_id": "user_123",
  "device_id": "device_456",
  "signature": "...",
  "payload": {}
}
```

- `caller_id` identifies the user making the request.
- `device_id` identifies the device used to authenticate the request.
- `signature` proves possession of the device's registered private key.
- `payload` contains operation-specific parameters and may be empty.

Do not duplicate the target entity ID in the payload when it is already identified by the URL.

### Authentication and Signature Verification

All requests from the app must be signed using the esisting ... service
All operations at the api must verify the caller using the existing doSignatureVerification() service.

Do not implement authentication or signing logic independently within individual features. Reuse the existing services.

### API Response

All API operations must return a consistent JSON response.

Successful operation:

```json
{
  "success": true,
  "message": "Match created successfully.",
  "redirect": "/match/match_123",
  "data": {
    "id": "match_123"
  }
}
```

Failed operation:

```json
{
  "success": false,
  "message": "You are not permitted to create this match.",
  "redirect": null,
  "error": {
    "code": "NOT_AUTHORISED"
  }
}
```

Response fields:

- `success` — mandatory boolean indicating whether the operation succeeded.
- `message` — mandatory human-readable message that the client can display for both successful and failed operations.
- `redirect` — mandatory relative Svelte application path, or `null` when navigation is not required.
- `data` — optional operation-specific result data.
- `error` — optional error object containing a stable machine-readable `code`.

Use appropriate HTTP status codes in addition to the JSON response.

The API is responsible for generating the response message and navigation destination. The client should not need to construct these from the operation result.

Do not return the complete application graph when the client can obtain the updated state from `guids.json`.

Every API operation must refresh the public `guids.json` using `doGuidsToPublic()` before returning its response.

When an operation involves multiple changes, complete those changes before publishing the updated JSON.

The API must await completion of the export before returning its response so that the client can retrieve the latest data.

The Azure Table remains the authoritative data source. `guids.json` is a derived representation and must not be modified independently.

### App Response

The Svelte client must follow a consistent sequence after every API response, regardless of success or failure:

1. Receive the API response.
2. Display the response `message`.
3. Fetch the latest `guids.json` from Blob Storage.
4. Replace the client's existing graph data with the refreshed data.
5. Navigate to `redirect` if a destination was provided and the refresh succeeded.

The client must await the refreshed data before navigating.

The client should fetch a fresh copy rather than relying on a cached version of `guids.json`.

If the refresh fails, the client must not navigate. It should report the refresh failure and allow the user to retry fetching the data without repeating the original API operation.

Redirect destinations must be relative application paths, not arbitrary external URLs.

### Idempotency

API operations should be designed so that repeating an identical request does not produce unintended additional effects.

For example, repeatedly joining the same ladder should not create duplicate participation.

Operations that cannot naturally be idempotent must explicitly handle duplicate requests.

Requests do not include timestamps or nonces. Consequently, signatures do not provide general replay prevention. Features requiring stronger protection must address this explicitly.

### Feature Implementation

When developing a new feature:

1. Define the required entities, relations and attributes.
2. Implement the API operation using existing helper services.
3. Apply authentication, authorisation and business rules in the API.
4. Implement the corresponding Svelte functionality using the agreed routing and request conventions.
5. Handle the standard API response, including success and failure messages.
6. Ensure the API publishes `guids.json` before responding.
7. Ensure the client refreshes `guids.json` before following any redirect.

Frontend and API changes should be developed and tested together so that their contracts remain consistent.

# 6. Sample Data

The following sample guids.json shows how the entities and relations work

A user exists named "User Zero"
A club exists named "Intra Club"
Two Ladders exist named "Intra Club Singles Ladder" and "Intra Club Doubles Ladder"

The user is an admin of both ladders and the club
Both ladders are related to the club

There are no users participating in either ladder yet

```json
[
  {
    "pk": "bot",
    "rk": "bot_0000-00-00_00-00-00_bootstrap00b",
    "name": "Intra Club Bot"
  },
  {
    "pk": "user",
    "rk": "user_0000-00-00_00-00-00_bootstrap0uz",
    "name": "User Zero"
  },
  {
    "pk": "club",
    "rk": "club_0000-00-00_00-00-00_bootstrap00c",
    "name": "Intra Club",
	"url": "app",
    "foreground":"#00BFFF",
    "background":"#E75480",
    "street":"6/9 Dickens Street",
    "suburb":"Elwood",
    "postcode":"3184"
  },
  {
    "pk": "club_0000-00-00_00-00-00_bootstrap00c",
    "rk": "user_0000-00-00_00-00-00_bootstrap0uz",
	"admin": true
  },
  {
    "pk": "user_0000-00-00_00-00-00_bootstrap0uz",
	"rk": "club_0000-00-00_00-00-00_bootstrap00c",
	"admin": true
  },
  {
    "pk": "ladder",
    "rk": "ladder_0000-00-00_00-00-00_bootstrap00s",
    "name": "Intra Club Singles Ladder",
    "format": "singles",
    "scoring": "super-set",
    "playPeriod": "9",
    "coolPeriod": "3"
  },
  {
    "pk": "ladder_0000-00-00_00-00-00_bootstrap00s",
    "rk": "user_0000-00-00_00-00-00_bootstrap0uz",
    "admin": true
  },
  {
    "pk": "user_0000-00-00_00-00-00_bootstrap0uz",
    "rk": "ladder_0000-00-00_00-00-00_bootstrap00s",
    "admin": true
  },
  {
    "pk": "club_0000-00-00_00-00-00_bootstrap00c",
    "rk": "ladder_0000-00-00_00-00-00_bootstrap00s"
  },
  {
    "pk": "ladder_0000-00-00_00-00-00_bootstrap00s",
    "rk": "club_0000-00-00_00-00-00_bootstrap00c"
  },
  {
    "pk": "ladder",
    "rk": "ladder_0000-00-00_00-00-00_bootstrap00d",
    "name": "Intra Club Doubles Ladder",
    "format": "doubles",
    "scoring": "fast-four",
    "playPeriod": "9",
    "coolPeriod": "3"
  },
  {
    "pk": "ladder_0000-00-00_00-00-00_bootstrap00d",
    "rk": "user_0000-00-00_00-00-00_bootstrap0uz",
    "admin": true
  },
  {
    "pk": "user_0000-00-00_00-00-00_bootstrap0uz",
    "rk": "ladder_0000-00-00_00-00-00_bootstrap00d",
    "admin": true
  },
  {
    "pk": "club_0000-00-00_00-00-00_bootstrap00c",
    "rk": "ladder_0000-00-00_00-00-00_bootstrap00d"
  },
  {
    "pk": "ladder_0000-00-00_00-00-00_bootstrap00d",
    "rk": "club_0000-00-00_00-00-00_bootstrap00c"
  }
]
```
