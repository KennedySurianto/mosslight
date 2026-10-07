import type { OnlineClient } from './OnlineClient';
import { CHAT_MAX, worldName } from '../../supabase/functions/_shared/social';

export class WorldHud {
  private abort = new AbortController();
  private form: HTMLFormElement;
  private nameElement: HTMLButtonElement | HTMLElement;
  private editing = false;
  constructor(private root: HTMLElement, private client: OnlineClient, private inputMode: (open: boolean) => void, private toast: (message: string) => void) {
    const location = root.querySelector('.location b')!;
    const own = client.snapshot!.world.owner_id === client.snapshot!.profile.user_id;
    this.nameElement = document.createElement(own ? 'button' : 'b');
    this.nameElement.id = 'world-name';
    this.nameElement.textContent = client.snapshot!.world.name;
    if (own) {
      this.nameElement.title = 'Click to rename your world';
      this.nameElement.addEventListener('click', () => this.editName());
    }
    location.replaceWith(this.nameElement);
    const subtitle = root.querySelector('.location small')!;
    subtitle.textContent = own ? 'Your world · click its name to rename' : 'Visiting a friend';
    const button = document.createElement('button');
    button.id = 'open-chat'; button.textContent = 'Chat'; button.setAttribute('aria-label','Open world chat');
    root.querySelector('.hud-actions')!.prepend(button);
    this.form = document.createElement('form');
    this.form.id = 'world-chat'; this.form.hidden = true;
    this.form.innerHTML = `<label for="chat-message">Say something to this world</label><div><input id="chat-message" maxlength="${CHAT_MAX}" autocomplete="off" placeholder="Type a message…" required><button type="submit">Send ↗</button><button type="button" aria-label="Close chat">×</button></div><small><span id="chat-count">0</span> / ${CHAT_MAX} · Enter to send · Esc to close</small><p role="alert"></p>`;
    root.append(this.form);
    const input = this.form.querySelector('input')!;
    button.addEventListener('click', () => { this.closeName(); this.form.hidden = !this.form.hidden; this.inputMode(!this.form.hidden); if (!this.form.hidden) input.focus(); });
    this.form.querySelector('[type=button]')!.addEventListener('click', () => this.closeChat());
    input.addEventListener('input', () => { this.form.querySelector('#chat-count')!.textContent = String(input.value.length); });
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); this.closeChat(); } });
    let sending = false;
    this.form.addEventListener('submit', async e => {
      e.preventDefault(); if (sending || !input.value.trim()) return;
      sending = true; const send = this.form.querySelector<HTMLButtonElement>('[type=submit]')!; send.disabled = true;
      try { await client.chat(input.value); input.value = ''; this.form.querySelector('#chat-count')!.textContent = '0'; this.form.querySelector('p')!.textContent = ''; this.closeChat(); }
      catch (error) { this.form.querySelector('p')!.textContent = error instanceof Error ? error.message : 'Message failed'; }
      finally { sending = false; send.disabled = false; }
    });
    root.querySelector('#leave-world')?.addEventListener('click', () => { this.closeChat(); this.closeName(); }, { capture:true, signal:this.abort.signal });
  }
  private closeChat() { this.form.hidden = true; this.inputMode(false); }
  private closeName() {
    const input = this.root.querySelector('#world-name-input');
    if (input) input.replaceWith(this.nameElement);
    this.editing = false; this.inputMode(false);
  }
  private editName() {
    if (this.editing) return;
    this.closeChat(); this.editing = true;
    const input = document.createElement('input'); input.id = 'world-name-input'; input.maxLength = 32;
    input.setAttribute('aria-label','World name'); input.value = this.client.snapshot!.world.name;
    this.nameElement.replaceWith(input); this.inputMode(true); input.focus(); input.select();
    let saving = false;
    input.addEventListener('blur', () => { if (!saving) this.closeName(); });
    input.addEventListener('keydown', async e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.closeName(); }
      if (e.key !== 'Enter' || saving) return;
      e.preventDefault(); saving = true;
      try { const name = worldName(input.value); input.disabled = true; this.nameElement.textContent = await this.client.rename(name); this.closeName(); }
      catch (error) { input.disabled = false; input.focus(); this.toast(error instanceof Error ? error.message : 'Rename failed'); }
      finally { saving = false; }
    });
  }
  updateName(name: string) { this.nameElement.textContent = name; }
  destroy() { this.abort.abort(); this.form.remove(); }
}
