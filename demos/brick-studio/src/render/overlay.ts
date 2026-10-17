import type { FilmOverlay } from '../stage';
import { drawPlan } from './plan';

// what lies over a film's frame: its fade to black and its title, drawn over the
// picture where it is shown and into every capture, so the film is whole wherever it
// is seen. A title stands over the black of a fade; a card fills the frame in the
// studio's type, a caption runs along its foot. A frame seen through a plan has its
// plan's marks in their place (SEE: plan.ts)
// ********************************************************************************
/** the type a card is set in, and a caption */
const CARD_FONT = 'Inter, \'Helvetica Neue\', Arial, sans-serif';
const CAPTION_FONT = '\'JetBrains Mono\', ui-monospace, Menlo, monospace';
/** the light the words are set in, and the shade behind them */
const PAPER = '#FFFDF2';
const CARD_SHADE = 'rgba(16, 15, 13, 0.55)';
const CAPTION_SHADE = 'rgba(16, 15, 13, 0.7)';

// ================================================================================
/** whether an overlay draws anything */
export const isBlank = ({ fade, title, plan }: FilmOverlay): boolean => !plan && (fade <= 0) && (!title || (title.opacity <= 0));

/** draws an overlay over a picture `width` by `height` at the context's origin */
export const drawOverlay = (context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, { fade, title, plan }: FilmOverlay, width: number, height: number): void => {
  if(plan) { drawPlan(context, plan, width, height); return; }
  if(fade > 0) {
    context.fillStyle = `rgba(0, 0, 0, ${Math.min(1, fade)})`;
    context.fillRect(0, 0, width, height);
  } /* else -- no fade */
  if(!title || (title.opacity <= 0)) return/*no title over this frame*/;

  context.save();
  context.globalAlpha = title.opacity;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if(title.style === 'card') {
    context.fillStyle = CARD_SHADE;
    context.fillRect(0, 0, width, height);
    context.fillStyle = PAPER;
    context.font = `500 ${Math.round(height * 0.11)}px ${CARD_FONT}`;
    context.fillText(title.text, width / 2, height / 2, width * 0.9);
  } else {
    context.font = `500 ${Math.round(height * 0.05)}px ${CAPTION_FONT}`;
    const band = Math.min(width * 0.9, context.measureText(title.text).width + (height * 0.06));
    context.fillStyle = CAPTION_SHADE;
    context.fillRect((width - band) / 2, height * 0.84, band, height * 0.09);
    context.fillStyle = PAPER;
    context.fillText(title.text, width / 2, height * 0.885, width * 0.88);
  }
  context.restore();
};
