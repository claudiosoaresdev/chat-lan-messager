// Anúncio e busca do serviço mDNS `chatlan` na rede local.
import { Bonjour, type Browser, type Service } from 'bonjour-service';
import { MAX_ID_LENGTH, SERVICE_TYPE } from '../shared/protocol';

const REQUERY_MS = 10_000;

export interface DiscoveryOptions {
  id: string;
  name: string;
  port: number;
  onUp(remoteId: string, host: string, port: number): void;
  onDown(remoteId: string): void;
}

const isIPv4 = (addr: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(addr);

function pickAddress(service: Service): string | null {
  const candidates = [...(service.addresses ?? []), service.referer?.address].filter(
    (a): a is string => typeof a === 'string' && a.length > 0,
  );
  // IPv4 primeiro: IPv6 link-local precisa de zone id e costuma falhar.
  return candidates.find(isIPv4) ?? candidates[0] ?? null;
}

function remoteIdOf(service: Service): string | null {
  const id = service.txt?.id;
  return typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH ? id : null;
}

export class Discovery {
  private bonjour: Bonjour | null = null;
  private browser: Browser | null = null;
  private requery: NodeJS.Timeout | null = null;

  constructor(private readonly opts: DiscoveryOptions) {}

  start() {
    const bonjour = new Bonjour(undefined, (err: unknown) => console.warn('[mdns] error', err));
    this.bonjour = bonjour;

    bonjour.publish({
      name: `${this.opts.name.slice(0, 40)}-${this.opts.id.slice(0, 8)}`,
      type: SERVICE_TYPE,
      port: this.opts.port,
      txt: { id: this.opts.id, name: this.opts.name },
    });

    const handleUp = (service: Service) => {
      const id = remoteIdOf(service);
      const host = pickAddress(service);
      if (!id || !host || id === this.opts.id) return;
      this.opts.onUp(id, host, service.port);
    };

    this.browser = bonjour.find({ type: SERVICE_TYPE });
    this.browser.on('up', handleUp);
    this.browser.on('srv-update', handleUp);
    this.browser.on('down', (service) => {
      const id = remoteIdOf(service);
      if (id && id !== this.opts.id) this.opts.onDown(id);
    });

    this.requery = setInterval(() => this.browser?.update(), REQUERY_MS);
  }

  /** Avisa a rede que saiu (unpublishAll) e libera o socket mDNS. */
  stop(): Promise<void> {
    if (this.requery) clearInterval(this.requery);
    this.browser?.stop();
    const bonjour = this.bonjour;
    this.bonjour = null;
    if (!bonjour) return Promise.resolve();
    return new Promise((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        bonjour.destroy();
        resolve();
      };
      const timeout = setTimeout(done, 1500);
      bonjour.unpublishAll(() => {
        clearTimeout(timeout);
        done();
      });
    });
  }
}
