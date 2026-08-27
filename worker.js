// firmenliste.net MCP-Server als Cloudflare Worker
// Stellt die Agent-API (laender/branchen/count/quote/terms) als
// MCP-Tools bereit (Streamable HTTP, stateless, JSON-Antworten).
// Deployment: Cloudflare Dashboard -> Workers -> Code einfuegen.

const API = "https://www.firmenliste.net/api/v1";

const TOOLS = [
  {
    name: "laender_auflisten",
    description:
      "Listet alle Laender mit B2B-Firmenadressen von firmenliste.net: " +
      "DACH (de/at/ch) mit online kaufbaren Listen inkl. Anzahl, " +
      "weitere ~40 Laender auf Anfrage. Inklusive Datenstand.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "branchen_suchen",
    description:
      "Findet Adresslisten zu einem Suchbegriff (z. B. 'Golf', 'Spedition'). " +
      "Liefert pro Treffer idListe, Datensatzanzahl, Feld-Verfuegbarkeit " +
      "(E-Mail/Telefon/Website/Ansprechpartner) und Nettopreis. " +
      "Immer der erste Schritt vor Details oder Angebot.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Suchbegriff, min. 3 Zeichen" },
        land: { type: "string", enum: ["de", "at", "ch"], default: "de" },
      },
      required: ["q"],
      additionalProperties: false,
    },
  },
  {
    name: "liste_details",
    description:
      "Detailansicht einer Adressliste: alle Feld-Zaehler, Bundesland-" +
      "Verteilung, enthaltene Felder und saemtliche Paketpreise " +
      "(Komplett, Nur-E-Mail, je Bundesland). Nettopreise zzgl. dt. MwSt.",
    inputSchema: {
      type: "object",
      properties: {
        idListe: { type: "integer", description: "Listen-ID aus branchen_suchen" },
      },
      required: ["idListe"],
      additionalProperties: false,
    },
  },
  {
    name: "angebot_erstellen",
    description:
      "Erzeugt ein 48h gueltiges, preisstabiles Angebot (quote_id) und " +
      "liefert eine bestell_url. WICHTIG: Nur nach ausdruecklicher " +
      "Bestaetigung des Nutzers aufrufen. Der Kauf selbst erfolgt durch " +
      "den Menschen ueber die bestell_url. Varianten: umfang='nur_email' " +
      "(nur E-Mail/Kategorie/Bundesland) oder bundesland='Bayern' " +
      "(einzelnes Bundesland-Paket).",
    inputSchema: {
      type: "object",
      properties: {
        idListe: { type: "integer" },
        umfang: { type: "string", enum: ["komplett", "nur_email"], default: "komplett" },
        bundesland: { type: "string", description: "Optional, z. B. 'Bayern'" },
      },
      required: ["idListe"],
      additionalProperties: false,
    },
  },
  {
    name: "kaufbedingungen",
    description:
      "Maschinenlesbare Kauf- und Nutzungsbedingungen (B2B-only, MwSt, " +
      "Widerruf, rechtliche Grenzen der Datennutzung nach UWG/DSGVO). " +
      "Vor einer Kaufempfehlung abrufen und dem Nutzer korrekt wiedergeben.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

async function callApi(name, args) {
  if (name === "laender_auflisten") {
    return fetch(`${API}/laender`);
  }
  if (name === "branchen_suchen") {
    const p = new URLSearchParams({ q: args.q, land: args.land || "de" });
    return fetch(`${API}/branchen?${p}`);
  }
  if (name === "liste_details") {
    return fetch(`${API}/count?idListe=${encodeURIComponent(args.idListe)}`);
  }
  if (name === "angebot_erstellen") {
    const body = { idListe: args.idListe };
    if (args.umfang) body.umfang = args.umfang;
    if (args.bundesland) body.bundesland = args.bundesland;
    return fetch(`${API}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  if (name === "kaufbedingungen") {
    return fetch(`${API}/terms`);
  }
  return null;
}

const JSONRPC = (id, result) => ({ jsonrpc: "2.0", id, result });
const JSONRPC_ERR = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Authorization",
};

function respond(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    // Crawler-freundlich: robots.txt erlaubt alles
    if (request.method === "GET" && url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nAllow: /\n", {
        status: 200,
        headers: { "Content-Type": "text/plain", ...CORS },
      });
    }

    // GET auf den Endpoint: Info statt nackter Fehler
    if (request.method !== "POST") {
      return respond(
        {
          name: "firmenliste.net MCP-Server",
          description:
            "B2B-Firmenadressen DACH als MCP-Tools. Verbindung per MCP-Client " +
            "(Streamable HTTP, POST mit JSON-RPC an diese URL).",
          tools: TOOLS.map((t) => t.name),
          rest_api: "https://www.firmenliste.net/openapi.yaml",
          website: "https://www.firmenliste.net",
        },
        200
      );
    }

    let msg;
    try {
      msg = await request.json();
    } catch {
      return respond(JSONRPC_ERR(null, -32700, "Parse error"), 400);
    }

    const { id, method, params } = msg;

    // Notifications (kein id) -> 202 ohne Body
    if (id === undefined || id === null) {
      return new Response(null, { status: 202, headers: CORS });
    }

    if (method === "initialize") {
      return respond(
        JSONRPC(id, {
          protocolVersion: params?.protocolVersion || "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: {
            name: "firmenliste",
            title: "firmenliste.net B2B-Firmenadressen",
            version: "1.0.0",
          },
          instructions:
            "B2B-Firmenadressen DACH: erst branchen_suchen, dann liste_details, " +
            "dann (nur nach Nutzer-Bestaetigung) angebot_erstellen. Der Kauf " +
            "erfolgt durch den Menschen ueber die bestell_url. Vor einer " +
            "Kaufempfehlung kaufbedingungen abrufen.",
        })
      );
    }

    if (method === "ping") {
      return respond(JSONRPC(id, {}));
    }

    if (method === "tools/list") {
      return respond(JSONRPC(id, { tools: TOOLS }));
    }

    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments || {};
      try {
        const res = await callApi(name, args);
        if (!res) {
          return respond(JSONRPC_ERR(id, -32602, `Unbekanntes Tool: ${name}`));
        }
        const text = await res.text();
        return respond(
          JSONRPC(id, {
            content: [{ type: "text", text }],
            isError: res.status >= 500,
          })
        );
      } catch (e) {
        return respond(
          JSONRPC(id, {
            content: [{ type: "text", text: "API derzeit nicht erreichbar: " + e.message }],
            isError: true,
          })
        );
      }
    }

    return respond(JSONRPC_ERR(id, -32601, `Methode nicht unterstuetzt: ${method}`));
  },
};
