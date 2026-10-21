import type { FilmOverlay } from '../stage';
import { drawPlan } from './plan';

// what lies over a film's frame: the shot it leaves in a transition (its picture drawn
// apart, SEE: viewer.ts), dissolving, wiped away toward a side or opened by an iris
// from the middle; its fade, in its color (black unless named), over the whole
// picture or closing in from its edge as an iris; and its title, drawn over the
// picture where it is shown and into every capture, so the film is whole wherever it
// is seen. A title stands over a fade; a card fills the frame in the studio's type, a
// caption runs along its foot. A frame seen through a plan has its plan's marks in
// their place (SEE: plan.ts)
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
export const isBlank = ({ transition, fade, title, plan }: FilmOverlay): boolean => !plan && (!transition || (transition.left <= 0)) && (fade <= 0) && (!title || (title.opacity <= 0));

/** draws an overlay over a picture `width` by `height` at the context's origin */
export const drawOverlay = (context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, { transition, fade, fadeColor, fadeShape, title, plan }: FilmOverlay, width: number, height: number, leaving?: CanvasImageSource): void => {
  if(plan) { drawPlan(context, plan, width, height); return; }
  if(transition && leaving && (transition.left > 0)) {
    context.save();
    const { left, shape } = transition;
    if(shape === 'dissolve') context.globalAlpha = left;
    else {
      context.beginPath();
      if(shape === 'wipe-right') context.rect(width * (1 - left), 0, width * left, height)/*the edge moving right, the shot entering behind it*/;
      else if(shape === 'wipe-left') context.rect(0, 0, width * left, height);
      else if(shape === 'wipe-down') context.rect(0, height * (1 - left), width, height * left);
      else if(shape === 'wipe-up') context.rect(0, 0, width, height * left);
      else { context.rect(0, 0, width, height); context.arc(width / 2, height / 2, irisRadius(width, height, 1 - left), 0, Math.PI * 2, true)/*the shot entering within the circle*/; }
      context.clip('evenodd');
    }
    context.drawImage(leaving, 0, 0, width, height);
    context.restore();
  } /* else -- no shot left showing */
  if(fade > 0) {
    context.save();
    const [r, g, b] = fadeColor ? [1, 3, 5].map(at => parseInt(fadeColor.slice(at, at + 2), 16)) : [0, 0, 0];
    if(fadeShape === 'iris') {
      context.fillStyle = `rgb(${r}, ${g}, ${b})`;
      context.beginPath();
      context.rect(0, 0, width, height);
      context.arc(width / 2, height / 2, irisRadius(width, height, 1 - Math.min(1, fade)), 0, Math.PI * 2, true)/*the picture within the circle*/;
      context.fill('evenodd');
    } else {
      context.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, fade)})`;
      context.fillRect(0, 0, width, height);
    }
    context.restore();
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

/** an iris's radius, `open` of the way (0 closed, 1 out to the frame's corners) */
const irisRadius = (width: number, height: number, open: number): number => Math.max(0, open) * (Math.hypot(width, height) / 2);
