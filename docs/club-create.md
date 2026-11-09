# Create a club

`POST /api/club/create` is an unsigned, anonymous provisioning endpoint. It does not require `caller_id`, `device_id` or `signature`. There is no Svelte creation form.

Send JSON using the existing unsigned `data` envelope:

```json
{
  "data": {
    "name": "Example Club",
    "url": "example.intra.club",
    "background": "#B67233",
    "foreground": "#00BFFF",
    "street": "6/9 Dickens Street",
    "suburb": "Elwood",
    "postcode": "3184",
    "admin_user_id": "user_0000-00-00_00-00-00_bootstrap0uz",
    "image": "BASE64_JPEG_DATA"
  }
}
```

Replace `BASE64_JPEG_DATA` with the unwrapped Base64 content of a valid, complete 512x512 JPEG. A `data:image/jpeg;base64,...` value is also accepted. Maximum decoded size is 2 MB. Other dimensions and image formats are rejected. EXIF orientation is applied to generated PNGs; the original JPEG is preserved.

`name`, hostname `url`, six-digit hex `foreground` and `background`, `admin_user_id` and `image` are required. The admin must already exist as a `user` entity. Extra club attributes may be strings, numbers or booleans; storage metadata/keys and nested values are rejected. Hostnames are trimmed and lowercased and cannot include a scheme, path or port. An existing hostname returns 409 without creating another club.

The endpoint generates a club GUID and saves all club attributes, excluding `image` and `admin_user_id`, on the new `club` entity. It creates both admin relation rows with `is_admin: true`, uploads these assets to the public container, then republishes `guids.json`:

| Resource | Contents |
| --- | --- |
| `<club_id>.jpg` | Original 512x512 JPEG |
| `<club_id>_180.png` | 180x180 PNG for Apple touch icon |
| `<club_id>_192.png` | 192x192 PNG for manifest |
| `<club_id>_512.png` | 512x512 PNG for manifest |

Success returns 201 with `subject` and `data.club_id`, `data.admin_user_id` and the four asset filenames. It does not create DNS records, SWA bindings or CORS entries, or send notifications.

Uploads precede graph publication. Upload/graph-write failures attempt to remove only new resources. Azure Table/Blob writes are not a cross-service transaction; cleanup can also fail. If public graph export alone fails, the complete club is retained and the endpoint returns 503 with `data.created: true` and the generated ID. Republish the graph rather than submitting another creation request. Concurrent requests for the same unused hostname are not serialized.

Existing bootstrap clubs and manually uploaded JPEGs are not migrated by this endpoint. Before testing their updated install manifests, supply their `_180.png`, `_192.png` and `_512.png` assets too. Creating a new club automatically supplies all four files.
