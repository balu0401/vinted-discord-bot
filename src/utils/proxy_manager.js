import { SocksProxyAgent } from 'socks-proxy-agent';
import Logger from './logger.js';
import { listProxies, Proxy } from './proxies.js';
import ConfigurationManager from './config_manager.js';
import fs from 'fs';

/**
 * Fontos: ténylegesen hívd meg a konfigurációolvasót.
 * Ajánlott defaultok a config_managerben:
 *  - enabled: false
 *  - use_webshare: false
 */
const proxy_settings = ConfigurationManager.getProxiesConfig;


/**
 * Static class for managing proxy settings and making HTTP requests with SOCKS authentication.
 */
class ProxyManager {
  static proxyConfig = null;
  static proxies = [];
  static proxiesLoaded = false;
  static currentProxyIndex = 0;
  static proxiesOnCooldown = [];

  /**
   * Inicializálás. Ha nincs proxy beállítva (vagy hiányzik a kulcs/fájl), proxy nélkül futunk tovább.
   */
  static async init(maxRetries = 3, retryDelay = 3000) {
    try {
      // Ha nincs konfiguráció vagy explicit ki van kapcsolva → proxy OFF
      if (
        !proxy_settings ||
        proxy_settings.enabled === false ||
        (proxy_settings.enabled !== true &&
          proxy_settings.use_webshare !== true &&
          !fs.existsSync('proxies.txt'))
      ) {
        Logger.info('[ProxyManager] No proxy configured; running without proxy.');
        this.proxies = [];
        return;
      }

      // WEBSHARE mód
      if (proxy_settings.use_webshare === true) {
        if (!proxy_settings.webshare_api_key) {
          Logger.warn('[ProxyManager] Webshare enabled but no API key. Running without proxy.');
          this.proxies = [];
          return;
        }

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            this.proxies = await listProxies(proxy_settings.webshare_api_key);
            Logger.info(`Loaded ${this.proxies.length} proxies from Webshare.`);
            break;
          } catch (err) {
            Logger.error(`Attempt ${attempt + 1} failed to initialize proxies: ${err.message}`);
            if (attempt === maxRetries - 1) {
              Logger.warn('[ProxyManager] Giving up on proxy init. Running without proxy.');
              this.proxies = [];
            } else {
              await new Promise((r) => setTimeout(r, retryDelay));
            }
          }
        }
        return;
      }

      // FÁJL alapú proxyk
      if (!fs.existsSync('proxies.txt')) {
        Logger.info('[ProxyManager] proxies.txt not found. Running without proxy.');
        this.proxies = [];
        return;
      }

      const proxyFile = fs.readFileSync('proxies.txt', 'utf8');
      const proxyLines = proxyFile
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      for (const line of proxyLines) {
        const parts = line.split(':');
        // host:port:user:pass formátum
        if (parts.length === 4) {
          const proxy = new Proxy(parts[0], parts[1], parts[2], parts[3]);
          this.proxies.push(proxy);
        }
      }

      Logger.info(`Loaded ${this.proxies.length} proxies from file.`);
      if (this.proxies.length === 0) {
        Logger.info('[ProxyManager] No proxies loaded from file. Running without proxy.');
      }
    } catch (error) {
      Logger.warn(`[ProxyManager] Unexpected init error (${error.message}). Running without proxy.`);
      this.proxies = [];
    }
  }

  /**
   * Clears the proxy configuration.
   */
  static clearProxy() {
    this.proxyConfig = null;
  }

  /**
   * Retrieves the next proxy (round-robin). Ha nincs proxy, undefined-del tér vissza – ez NEM hiba.
   * @returns {Proxy|undefined}
   */
  static getNewProxy() {
    if (this.proxies.length > 0) {
      this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
      const proxy = this.proxies[this.currentProxyIndex];
      return proxy;
    }
    // proxy nélkül futunk – nem hiba
    if (Logger.debug) Logger.debug('[ProxyManager] No proxies available; direct connection.');
    return undefined;
  }

  /**
   * Get New Proxy Socks Agent
   * @param {Proxy} proxy - The proxy to get the agent for
   * @returns {SocksProxyAgent|undefined} - The proxy agent
   */
  static getProxyAgent(proxy) {
    if (!proxy) return undefined;
    return new SocksProxyAgent(proxy.getProxyString());
  }

  /**
   * Remove invalid proxies from the list
   * @param {Proxy} proxy - The proxy to remove
   * @returns {void}
   */
  static removeProxy(proxy) {
    this.proxies = this.proxies.filter((p) => p !== proxy);
  }

  /**
   * Temporarily remove a proxy, then re-add after cooldown.
   * @param {Proxy} proxy
   * @param {number} timeout
   */
  static removeTemporarlyInvalidProxy(proxy, timeout = 60_000) {
    this.proxiesOnCooldown.push(proxy);
    this.proxies = this.proxies.filter((p) => p !== proxy);

    setTimeout(() => {
      this.proxies.push(proxy);
      this.proxiesOnCooldown = this.proxiesOnCooldown.filter((p) => p !== proxy);
    }, timeout);
  }
}

export default ProxyManager;
