// src/utils/proxy_manager.js
import fs from 'fs';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { ProxyAgent as UndiciProxyAgent } from 'undici';
import Logger from './logger.js';

const SECRET_FILE = '/etc/secrets/proxies.txt';
const LOCAL_FILE  = 'proxies.txt';

class ProxyManager {
  static enabled = false;
  static urls = [];
  static idx = -1;
  static cooldown = new Map(); // url -> retryAt(ms)

  static async init() {
    const want = String(process.env.PROXY_ENABLED || '').toLowerCase() === 'true';
    if (!want) {
      Logger.info('[ProxyManager] Disabled (PROXY_ENABLED!=true). Running without proxy.');
      this.enabled = false;
      return;
    }

    let txt = '';
    if (fs.existsSync(SECRET_FILE)) {
      txt = fs.readFileSync(SECRET_FILE, 'utf8');
      Logger.info('[ProxyManager] Loaded proxies from Secret File.');
    } else if (fs.existsSync(LOCAL_FILE)) {
      txt = fs.readFileSync(LOCAL_FILE, 'utf8');
      Logger.info('[ProxyManager] Loaded proxies from local proxies.txt.');
    } else {
      Logger.warn('[ProxyManager] proxies.txt not found. Running without proxy.');
      this.enabled = false;
      return;
    }

    const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
    this.urls = [];

    for (const line of lines) {
      if (line.includes('://')) {
        // támogatjuk a teljes URL formátumot is
        this.urls.push(line);
      } else {
        // ip:port:user:pass  -> default: HTTP
        const [host, port, user, pass] = line.split(':');
        if (!host || !port || !user || !pass) continue;
        const url = `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
        this.urls.push(url);
      }
    }

    if (this.urls.length === 0) {
      Logger.warn('[ProxyManager] proxies list empty. Running without proxy.');
      this.enabled = false;
      return;
    }

    this.enabled = true;
    this.idx = -1;
    this.cooldown.clear();
    Logger.info(`[ProxyManager] Loaded ${this.urls.length} proxies (HTTP/SOCKS hybrid).`);
  }

  static nextUrl() {
    if (!this.enabled || this.urls.length === 0) return undefined;
    const now = Date.now();
    for (let i = 0; i < this.urls.length; i++) {
      this.idx = (this.idx + 1) % this.urls.length;
      const url = this.urls[this.idx];
      const until = this.cooldown.get(url) || 0;
      if (until <= now) return url;
    }
    return undefined; // mind cooldownon
  }

  static getAgentOrUndefined() {
    const url = this.nextUrl();
    if (!url) return undefined;
    try {
      if (url.startsWith('socks')) {
        return new SocksProxyAgent(url);
      }
      // http/https → Undici ProxyAgent (Node 18+/22 fetch kompatibilis)
      return new UndiciProxyAgent(url);
    } catch (e) {
      Logger.error(`[ProxyManager] Agent create failed: ${e.message}`);
      return undefined;
    }
  }

  static coolDown(urlOrMs, ms = 60_000) {
    const url = typeof urlOrMs === 'string' ? urlOrMs : null;
    if (!url) return;
    this.cooldown.set(url, Date.now() + ms);
  }

  // fetch opciók kiegészítése proxival (undici/Node fetch-hez)
  static withProxy(options = {}) {
    const agent = this.getAgentOrUndefined();
    if (!agent) return { ...options };
    return { ...options, dispatcher: agent, agent };
  }
}

export default ProxyManager;

