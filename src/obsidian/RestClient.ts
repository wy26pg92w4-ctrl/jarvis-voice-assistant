const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Thin client for the community "Local REST API" Obsidian plugin
 * (https://github.com/coddingtonbear/obsidian-local-rest-api). Used for the
 * optional live two-way sync path: when a real Obsidian instance is running
 * with this plugin installed and reachable from wherever Jarvis runs, notes
 * written here appear (and can be edited) live in the open vault.
 *
 * The plugin's default HTTPS port (27124) uses a self-signed certificate,
 * which Node's fetch rejects out of the box; its plain-HTTP port (27123,
 * loopback-only) avoids that entirely and is what the setup docs recommend.
 */
export class ObsidianRestClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async isReachable(): Promise<boolean> {
    try {
      const response = await this.request("GET", "/");
      return response.ok;
    } catch {
      return false;
    }
  }

  async putNote(vaultPath: string, content: string): Promise<void> {
    const response = await this.request("PUT", `/vault/${encodeVaultPath(vaultPath)}`, content, "text/markdown");
    if (!response.ok) {
      throw new Error(`Obsidian REST PUT ${vaultPath} failed with status ${response.status}`);
    }
  }

  async getNote(vaultPath: string): Promise<string | undefined> {
    const response = await this.request("GET", `/vault/${encodeVaultPath(vaultPath)}`);
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`Obsidian REST GET ${vaultPath} failed with status ${response.status}`);
    }
    return response.text();
  }

  async deleteNote(vaultPath: string): Promise<void> {
    const response = await this.request("DELETE", `/vault/${encodeVaultPath(vaultPath)}`);
    if (!response.ok && response.status !== 404) {
      throw new Error(`Obsidian REST DELETE ${vaultPath} failed with status ${response.status}`);
    }
  }

  private async request(method: string, urlPath: string, body?: string, contentType?: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl.replace(/\/$/, "")}${urlPath}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(contentType ? { "Content-Type": contentType } : {}),
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function encodeVaultPath(vaultPath: string): string {
  return vaultPath.split("/").map(encodeURIComponent).join("/");
}
