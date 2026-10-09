import type { OnlineClient, PlayerResult, PlayerLocation } from './OnlineClient';
const escape = (text: string) => text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const skeleton = (count: number) => Array.from({ length: count }, () => `<div class="player-card player-card-skeleton" aria-hidden="true"><div class="player-card-head"><span><i class="skeleton-line skeleton-name"></i><i class="skeleton-line skeleton-status"></i></span><i class="skeleton-line skeleton-location"></i></div><div class="player-world"><div class="online-row"><i class="skeleton-line skeleton-world"></i><i class="skeleton-line skeleton-button"></i></div></div></div>`).join('');
export class PlayerDirectory {
  private version = 0;
  private next: string | null = null;
  private loading = false;
  private debounce?: ReturnType<typeof setTimeout>;
  private timer: ReturnType<typeof setInterval>;
  private observer: IntersectionObserver;
  private results = new Map<string, PlayerResult>();
  private locations = new Map<string, PlayerLocation>();
  private input: HTMLInputElement;
  private list: HTMLElement;
  private more: HTMLButtonElement;
  private error: HTMLElement;
  private destroyed = false;
  constructor(private root: HTMLElement, private client: OnlineClient, private visit: (id: string) => void) {
    root.innerHTML = `<h2>Players & friends</h2><label class="player-search-label">Find a player<input id="player-search" type="search" maxlength="20" autocomplete="off" placeholder="Search usernames…"></label><small>Friends appear below. Type a username to find someone new.</small><div class="player-results" aria-live="polite"></div><button class="directory-more" type="button">Load more</button><p class="directory-error" role="alert"></p>`;
    this.input = root.querySelector('input')!; this.list = root.querySelector('.player-results')!;
    this.more = root.querySelector('.directory-more')!; this.error = root.querySelector('.directory-error')!;
    this.input.addEventListener('input', () => {
      clearTimeout(this.debounce); this.version++; this.loading = false; this.next = null; this.more.hidden = true;
      this.list.setAttribute('aria-busy', 'true'); this.list.innerHTML = skeleton(3); this.error.textContent = '';
      this.debounce = setTimeout(() => void this.load(true),300);
    });
    this.more.addEventListener('click', () => void this.load(false));
    this.observer = new IntersectionObserver(entries => { if (entries.some(e=>e.isIntersecting) && this.next && !this.loading) void this.load(false); }, { root:root.closest('.online-card'), rootMargin:'80px' });
    this.observer.observe(this.more);
    this.list.addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
      if (button.dataset.world) this.visit(button.dataset.world);
      else if (button.dataset.action && button.dataset.username) void this.social(button);
    });
    this.list.addEventListener('change', e => {
      const toggle = (e.target as HTMLElement).closest<HTMLInputElement>('input[data-build-toggle]');
      if (toggle) void this.setBuildAccess(toggle);
    });
    this.timer = setInterval(() => void this.refreshLocations(),15000);
    void this.load(true); void this.refreshLocations();
  }
  private async load(reset: boolean) {
    if (this.destroyed || this.loading || (!reset && !this.next)) return;
    const version = reset ? ++this.version : this.version;
    if (reset) { this.results.clear(); this.list.innerHTML = skeleton(3); this.next = null; }
    else this.list.insertAdjacentHTML('beforeend', skeleton(1));
    this.list.setAttribute('aria-busy', 'true');
    this.loading = true; this.more.hidden = false; this.more.disabled = true; this.more.textContent = 'Loading…'; this.error.textContent = '';
    try {
      const page = await this.client.players(this.input.value.trim().toLowerCase(), reset ? '' : this.next!);
      if (this.destroyed || version !== this.version) return;
      this.list.querySelectorAll('.player-card-skeleton').forEach(card => card.remove());
      for (const player of page.players) { this.results.set(player.userId,player); this.append(player); }
      this.next = page.next;
      if (!this.results.size) this.list.innerHTML = '<p class="online-muted">No players found. Try the beginning of a username.</p>';
      this.updateLocations();
    } catch(error) {
      if (version === this.version) { this.error.textContent = error instanceof Error ? error.message : 'Search failed'; this.more.textContent='Retry'; }
    } finally {
      if (version === this.version && !this.destroyed) {
        this.list.querySelectorAll('.player-card-skeleton').forEach(card => card.remove());
        this.list.removeAttribute('aria-busy');
        this.loading=false; this.more.disabled=false; this.more.hidden=!this.next;
        this.more.textContent='Load more';
      }
    }
  }
  private append(player: PlayerResult) {
    const details = document.createElement('article'); details.className='player-card'; details.dataset.userId=player.userId;
    const status = player.status==='accepted' ? 'Friend' : player.status==='pending' ? player.incoming ? 'Incoming request' : 'Request sent' : 'New player';
    const own = this.client.snapshot!.worlds.find(w=>w.ownerId===this.client.snapshot!.profile.user_id);
    const world = player.world ? `<div class="online-row"><b>${escape(player.world.name)}</b><button data-world="${player.world.id}">Visit ↗</button></div>` : '<p>Become friends to visit their world.</p>';
    const remove = player.status==='accepted'
      ? `<button class="remove-friend" data-action="remove" aria-label="Remove ${escape(player.username)} from friends" title="Remove friend"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M6 2h4M5 5v8h6V5M7 7v4m2-4v4"/></svg></button>`
      : '<button data-action="remove">Cancel request</button>';
    const buildToggle = player.status==='accepted' && own
      ? `<label class="build-toggle"><span>Allow building</span><input type="checkbox" data-build-toggle data-username="${escape(player.username)}" aria-label="Allow ${escape(player.username)} to build in my world" ${player.canBuild?'checked':''}><span class="build-switch" aria-hidden="true"></span></label>` : '';
    const action = player.status==='none' ? '<button data-action="request">Add friend</button>' : `${player.incoming && player.status==='pending' ? '<button data-action="accept">Accept request</button>' : ''}${buildToggle}${remove}`;
    details.innerHTML = `<div class="player-card-head"><span><b>${escape(player.username)}</b><small>${status}</small></span><small class="player-location"></small></div><div class="player-world">${world}<div class="online-row-actions">${action}</div></div>`;
    details.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>{ b.dataset.username=player.username; });
    this.list.append(details);
  }
  private async social(button: HTMLButtonElement) {
    button.disabled=true;
    try {
      const own=this.client.snapshot!.worlds.find(w=>w.ownerId===this.client.snapshot!.profile.user_id);
      await this.client.social(button.dataset.action as 'request'|'accept'|'remove'|'builder'|'viewer',button.dataset.username!,own?.id);
      await this.load(true); await this.refreshLocations();
    } catch(error) { this.error.textContent=error instanceof Error?error.message:'Action failed'; }
    finally { button.disabled=false; }
  }
  private async setBuildAccess(toggle: HTMLInputElement) {
    toggle.disabled = true;
    try {
      const own=this.client.snapshot!.worlds.find(w=>w.ownerId===this.client.snapshot!.profile.user_id);
      await this.client.social(toggle.checked?'builder':'viewer',toggle.dataset.username!,own?.id);
      await this.load(true);
    } catch(error) {
      toggle.checked = !toggle.checked;
      this.error.textContent=error instanceof Error?error.message:'Permission change failed';
    } finally { toggle.disabled=false; }
  }
  private async refreshLocations() {
    if (this.destroyed || document.hidden) return;
    try { const result=await this.client.locations(); if(this.destroyed)return; this.locations=new Map(result.locations.map(p=>[p.userId,p.location])); this.updateLocations(); } catch { /* next refresh retries */ }
  }
  private updateLocations() {
    for(const [id,p] of this.results) {
      const label=this.list.querySelector<HTMLElement>(`[data-user-id="${id}"] .player-location`); if(!label)continue;
      const location=this.locations.get(id);
      label.textContent=p.status!=='accepted'?'':location ? location.own ? `In their world · ${location.name}` : `Visiting ${location.owner} · ${location.name}` : 'Offline';
    }
  }
  destroy() { this.destroyed=true; this.version++; clearTimeout(this.debounce); clearInterval(this.timer); this.observer.disconnect(); }
}
