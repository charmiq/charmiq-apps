import type { CharmIQAPI } from '../../../shared/charmiq';
import type { Film } from './film';
import type { Player } from './player';
import type { SceneError } from './recorder';
import type { StageState } from './studios';

// the Charm command surface (SEE: manifest.json `advertise`): what the film is, and
// the player's transport. A Charm writes the scene in the code editor's scene.js
// tab; these say how the film stands and show any moment of it on the studios, so a
// screenshot sees it
// ********************************************************************************
// == Types =======================================================================
/** what the surface reads from the film's wiring */
export type FilmHost = Readonly<{
  film: () => Film | undefined;
  error: () => SceneError | undefined;
  studios: () => number;
  editors: () => number;
  stage: () => StageState;
  player: Player;
  /** resolves once the main studio has drawn a frame */
  shown: (index: number) => Promise<void>;
}>;

// == Commands ====================================================================
export const exportFilmCommands = (charmiq: CharmIQAPI, host: FilmHost): void => {
  charmiq.exportCommands({
    describeFilm: () => {
      const film = host.film(), error = host.error(), stage = host.stage();
      return {
        studios: host.studios(), editors: host.editors(), stage: stage.kind,
        ...((stage.kind === 'staged') && (stage.refused.length > 0) ? { refused: stage.refused } : {}),
        ...((stage.kind === 'failed') ? { stageError: stage.message } : {}),
        ...((stage.kind === 'ambiguous') ? { stageError: `${stage.builds} studios hold a build: the set must be in one, the others empty.` } : {}),
        ...(film ? {
          title: film.scene.title, seconds: film.scene.length, fps: film.scene.fps, frames: film.frames.length,
          actors: film.scene.actors.map(actor => actor.name), views: film.scene.views.map(view => view.name),
          ...((film.scene.logs.length > 0) ? { logs: film.scene.logs.slice(-20) } : {}),
        } : {}),
        ...(error ? { error: { message: error.message, ...((error.line !== undefined) ? { line: error.line } : {}) } } : {}),
      };
    },
    seek: async ({ time, frame }: { time?: unknown; frame?: unknown; }) => {
      const film = host.film();
      if(!film) throw new Error('No film yet: the scene.js tab holds no scene that runs (describeFilm says why).');
      const index = (typeof frame === 'number') ? frame : (typeof time === 'number') ? Math.round(time * film.scene.fps) : NaN;
      if(!Number.isFinite(index)) throw new Error('Give the time (seconds) or the frame (from 0) to show.');
      host.player.pause();
      host.player.seek(index);
      const shown = host.player.current.index;
      const drawn = host.shown(shown);
      host.player.redraw()/*shown again, whether or not the playhead moved*/;
      await drawn;
      return { frame: shown, time: shown / film.scene.fps };
    },
    play: () => { host.player.play(); return { playing: true }; },
    pause: () => { host.player.pause(); return { playing: false, frame: host.player.current.index }; },
  });
};
