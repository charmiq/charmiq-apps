// font loading, text wrapping, and measurement using an offscreen canvas context
// ********************************************************************************
const FONT_FAMILY = 'Excalifont, system-ui, sans-serif';

// == TextMeasurement =============================================================
export class TextMeasurement {
  private readonly ctx: CanvasRenderingContext2D;

  public constructor() {
    const canvas = document.createElement('canvas');
    this.ctx = canvas.getContext('2d')!;
  }

  // pre-load Excalifont at common sizes so that measurements are consistent
  public async init(): Promise<void> {
    try {
      if(document.fonts?.load) {
        await document.fonts.load('16px Excalifont');
        for(const size of [14, 16, 18, 20, 24]) {
          await document.fonts.load(`${size}px Excalifont`);
        }
        // warm up the measurement context
        this.ctx.font = `16px ${FONT_FAMILY}`;
        this.ctx.measureText('M');
      }
    } catch(error) {
      console.warn('Font loading failed, using fallback:', error);
    }
  }

  // ==============================================================================
  // measure the natural (unwrapped) width and height of a block of text
  public measureTextDimensions(text: string, fontSize = 16): { width: number; height: number } {
    this.ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    const lines = text.split('\n');
    let maxWidth = 0;
    const lineHeight = fontSize * 1.2;

    for(const line of lines) {
      const w = this.ctx.measureText(line).width;
      if(w > maxWidth) maxWidth = w;
    }

    return { width: maxWidth, height: lines.length * lineHeight };
  }

  // ==============================================================================
  // wrap text to fit within a given pixel width
  public wrapText(text: string, maxWidth: number, fontSize = 16): string[] {
    if(!text || (maxWidth <= 0)) return [''];

    this.ctx.font = `${fontSize}px ${FONT_FAMILY}`;

    const charWidth = this.ctx.measureText('M').width;
    const minWidth = charWidth * 1.5;
    const effectiveMaxWidth = Math.max(maxWidth, minWidth);

    const lines: string[] = [];
    const paragraphs = text.split('\n');

    for(const paragraph of paragraphs) {
      if(paragraph === '') { lines.push(''); continue; }

      let currentLine = '';
      let i = 0;

      while(i < paragraph.length) {
        const char = paragraph[i];
        const testLine = currentLine + char;
        const w = this.ctx.measureText(testLine).width;

        if(w <= effectiveMaxWidth) {
          currentLine = testLine;
          i++;
        } else {
          if(currentLine === '') {
            // single char doesn't fit — use it anyway
            currentLine = char;
            i++;
          } else {
            const lastSpace = currentLine.lastIndexOf(' ');
            if(lastSpace > 0) {
              lines.push(currentLine.substring(0, lastSpace));
              currentLine = currentLine.substring(lastSpace + 1);
            } else {
              lines.push(currentLine);
              currentLine = '';
            }
          }
        }
      }

      if(currentLine) lines.push(currentLine);
    }

    return lines.length ? lines : [''];
  }

  // ==============================================================================
  // measure dimensions of text wrapped to a specific width
  public measureWrappedText(text: string, maxWidth: number, fontSize = 16): { width: number; height: number } {
    const lines = this.wrapText(text, maxWidth, fontSize);
    this.ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    const lineHeight = fontSize * 1.2;

    let maxLineWidth = 0;
    for(const line of lines) {
      const w = this.ctx.measureText(line).width;
      if(w > maxLineWidth) maxLineWidth = w;
    }

    return { width: Math.max(maxLineWidth, maxWidth), height: lines.length * lineHeight };
  }
}
