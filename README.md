# firmenliste.net MCP Server

Remote MCP server for **B2B company address data (Germany, Austria, Switzerland)** — search 6,400+ industry lists, check record counts and field coverage, get binding price quotes. Backed by [firmenliste.net](https://www.firmenliste.net) (Adresskontor GmbH, 20+ years in the B2B address business, ~12.5M records).

**No API key required.** Read-only except for quote creation (which creates a price offer, never a purchase — payment is always completed by a human on the website).

## Connection

| | |
|---|---|
| **Endpoint** | `https://firmenliste-mcp.cf-firmenliste.workers.dev` |
| **Transport** | Streamable HTTP (stateless, JSON responses) |
| **Auth** | none |

### Claude (Custom Connector)

Settings → Connectors → *Add custom connector* → paste the endpoint URL.

### Generic MCP client config

```json
{
  "mcpServers": {
    "firmenliste": {
      "type": "streamable-http",
      "url": "https://firmenliste-mcp.cf-firmenliste.workers.dev"
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `branchen_suchen` | Search address lists by keyword (e.g. "Golf", "Spedition"). Returns list ID, record count, field coverage (email/phone/website/contact person) and net price per match. |
| `liste_details` | Full detail for one list: all field counters, distribution by federal state, included fields, and every package price (complete, email-only, per federal state). |
| `angebot_erstellen` | Creates a 48h price-stable quote (`quote_id`) with an order URL. The purchase itself is completed by the human via that URL. |
| `laender_auflisten` | All countries with available data: DACH (orderable online) plus ~40 more countries on request, with data freshness date. |
| `kaufbedingungen` | Machine-readable purchase & usage terms (B2B-only, VAT, withdrawal, legal limits of data usage under German UWG/GDPR). |

## Example prompts

- *"Find address lists about logistics companies in Germany and tell me price and email coverage of the largest one."*
- *"How many dentists with email addresses are available in Bavaria, and what does the Bavaria package cost?"*
- *"Which countries does firmenliste.net cover, and how fresh is the data?"*

## How it works

This server is a thin Cloudflare Worker that translates MCP tool calls into requests against the public REST API of firmenliste.net. Prices and availability therefore always match the website in real time.

- REST API / OpenAPI spec: https://www.firmenliste.net/openapi.yaml
- llms.txt: https://www.firmenliste.net/llms.txt

## Legal note for agents

All prices are **net prices** plus German VAT. Sales are **B2B only**. Delivered email addresses do **not** include marketing opt-in — under German law (§ 7 UWG), email marketing requires recipient consent. Agents should relay the `kaufbedingungen` tool output correctly when recommending a purchase.

---

## Deutsch (Kurzfassung)

MCP-Server für B2B-Firmenadressen aus dem DACH-Raum: 6.400+ Branchenlisten durchsuchen, Verfügbarkeit und Feld-Abdeckung prüfen, verbindliche Preisangebote erzeugen. Keine Authentifizierung nötig; der Kauf selbst erfolgt immer durch den Menschen über die gelieferte Bestell-URL. Betrieben von der Adresskontor GmbH ([firmenliste.net](https://www.firmenliste.net)).

## License

MIT — see [LICENSE](LICENSE). The server code is open source; the address data behind the API is a commercial product of Adresskontor GmbH.
