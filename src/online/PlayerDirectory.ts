import type { OnlineClient, PlayerResult, PlayerLocation } from './OnlineClient';
const escape = (text: string) => text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
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
    this.timer = setInterval(() => void this.refreshLocations(),15000);
    void this.load(true); void this.refreshLocations();
  }
  private async load(reset: boolean) {
    if (this.destroyed || this.loading || (!reset && !this.next)) return;
    const version = reset ? ++this.version : this.version;
    if (reset) { this.results.clear(); this.list.replaceChildren(); this.next = null; }
    this.loading = true; this.more.hidden = false; this.more.disabled = true; this.more.textContent = 'Loading…'; this.error.textContent = '';
    try {
      const page = await this.client.players(this.input.value.trim().toLowerCase(), reset ? '' : this.next!);
      if (this.destroyed || version !== this.version) return;
      for (const player of page.players) { this.results.set(player.userId,player); this.append(player); }
      this.next = page.next;
      if (!this.results.size) this.list.innerHTML = '<p class="online-muted">No players found. Try the beginning of a username.</p>';
      this.updateLocations();
    } catch(error) {
      if (version === this.version) { this.error.textContent = error instanceof Error ? error.message : 'Search failed'; this.more.textContent='Retry'; }
    } finally {
      if (version === this.version && !this.destroyed) {
        this.loading=false; this.more.disabled=false; this.more.hidden=!this.next;
        this.more.textContent='Load more';
      }
    }
  }
  private append(player: PlayerResult) {
    const details = document.createElement('details'); details.className='player-card'; details.dataset.userId=player.userId;
    const status = player.status==='accepted' ? 'Friend' : player.status==='pending' ? player.incoming ? 'Incoming request' : 'Request sent' : 'New player';
    const own = this.client.snapshot!.worlds.find(w=>w.ownerId===this.client.snapshot!.profile.user_id);
    const world = player.world ? `<div class="online-row"><b>${escape(player.world.name)}</b><button data-world="${player.world.id}">Visit ↗</button></div>` : '<p>Become friends to visit their world.</p>';
    const action = player.status==='none' ? '<button data-action="request">Add friend</button>' : `${player.incoming && player.status==='pending' ? '<button data-action="accept">Accept request</button>' : ''}<button data-action="remove">${player.status==='pending'?'Cancel request':'Remove friend'}</button>${player.status==='accepted' && own ? '<button data-action="builder">Allow building in my world</button><button data-action="viewer">View only in my world</button>' : ''}`;
    details.innerHTML = `<summary><span><b>${escape(player.username)}</b><small>${status}</small></span><small class="player-location"></small><span aria-hidden="true">⌄</span></summary><div class="player-world">${world}<div class="online-row-actions">${action}</div></div>`;
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
