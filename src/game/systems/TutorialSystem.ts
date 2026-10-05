import { GAME, SIGNS } from "../data/config";
/** Use the avatar collider and the drawn 28×30 sign, not a proximity radius. */
export function touchingSign(player: {
  x: number;
  y: number;
  width: number;
  height: number;
}): number {
  const bottom = GAME.surface * GAME.tile;
  return SIGNS.findIndex((sign) => {
    const center = sign.x * GAME.tile + 16;
    return (
      player.x + player.width / 2 >= center - 14 &&
      player.x - player.width / 2 <= center + 14 &&
      player.y >= bottom - 30 &&
      player.y - player.height <= bottom
    );
  });
}
