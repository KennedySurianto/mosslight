import { describe, expect, it } from "vitest";
import { chatText, chatDuration, worldName } from '../supabase/functions/_shared/social';
import { applyAction, initialProfile, initialSession, initialWorld, moveSession, tileAt } from "../supabase/functions/_shared/mosslight";

describe("server-authoritative multiplayer rules", () => {
  const seed = 1234;
  it("rejects teleports and edits by world visitors without build access", () => {
    const world = initialWorld(seed), session = initialSession();
    expect(() => moveSession(session, world, seed, 800, 736, 1, session.lastPositionAt + 100)).toThrow("too fast");
    expect(() => applyAction({ world, profile: initialProfile(), session, seed, kind: "hit", x: 21, y: 23, now: 1000, canBuild: false })).toThrow("view-only");
  });

  it("tracks repeated hits and awards a block only after durability is met", () => {
    const world = initialWorld(seed), profile = initialProfile(), session = initialSession();
    const first = applyAction({ world, profile, session, seed, kind: "hit", x: 21, y: 23, now: 1000, canBuild: true });
    expect(first.changed).toBe(false);
    expect(first.event).toEqual({ kind:'damage', x:21, y:23, hits:1 });
    const second = applyAction({ world: first.world, profile: first.profile, session: first.session, seed, kind: "hit", x: 21, y: 23, now: 1250, canBuild: true });
    expect(second.changed).toBe(true);
    expect(tileAt(second.world, 21, 23, seed)).toBe(0);
    expect(second.profile.stats.broken).toBe(1);
  });

  it('resets mining damage after the crack timeout', () => {
    const world=initialWorld(seed),profile=initialProfile(),session=initialSession();
    const first=applyAction({world,profile,session,seed,kind:'hit',x:21,y:23,now:1000,canBuild:true});
    const later=applyAction({world,profile,session:first.session,seed,kind:'hit',x:21,y:23,now:6000,canBuild:true});
    expect(later.changed).toBe(false); expect(later.session.damageHits).toBe(1);
  });
  it('bounds chat text and lifetime without interpreting markup', () => {
    expect(chatText(' <hello> ')).toBe('<hello>');
    expect(()=>chatText('x'.repeat(141))).toThrow();
    expect(()=>chatText('\n\t')).toThrow();
    expect(chatDuration('hi')).toBe(3000);
    expect(chatDuration('x'.repeat(100))).toBe(7000);
    expect(chatDuration('x'.repeat(140))).toBeLessThanOrEqual(10000);
  });
  it('validates world names at the server boundary',()=>{
    expect(worldName(' Fern Hollow ')).toBe('Fern Hollow');
    for(const value of ['', 'x'.repeat(33), 'hello\nworld',null]) expect(()=>worldName(value)).toThrow();
  });

  it("validates a position and block hit together without a prior position write", () => {
    const world = initialWorld(seed), profile = initialProfile(), session = initialSession();
    const moved = moveSession(session, world, seed, 688, 736, 1, session.lastPositionAt + 300);
    const hit = applyAction({ world, profile, session: moved, seed, kind: "hit", x: 21, y: 23,
      now: moved.lastPositionAt, canBuild: true });
    expect(hit.session.x).toBe(688);
    expect(hit.session.damageHits).toBe(1);
  });

  it("requires clearing foliage before building on that tile", () => {
    const world = initialWorld(seed), profile = initialProfile(), session = initialSession();
    // x=22 has a wildflower for this deterministic seed.
    const foliageX = Array.from({ length: 12 }, (_, n) => n + 12).find((x) => {
      const y = 22;
      try {
        const hit = applyAction({ world, profile, session, seed, kind: "hit", x, y, now: 1000, canBuild: true });
        return hit.message === "Foliage cleared";
      } catch { return false; }
    });
    expect(foliageX).toBeDefined();
    const x = foliageX!, y = 22;
    expect(() => applyAction({ world, profile, session, seed, kind: "place", x, y, now: 1000, canBuild: true })).toThrow("occupied");
    const cleared = applyAction({ world, profile, session, seed, kind: "hit", x, y, now: 1000, canBuild: true });
    const placed = applyAction({ world: cleared.world, profile: cleared.profile, session: cleared.session, seed, kind: "place", x, y, now: 1250, canBuild: true });
    expect(placed.message).toBe("Block placed");
  });
});
