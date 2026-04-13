/** @jsx h */
import { h, render } from 'preact';

// ********************************************************************************
// == Types =======================================================================
type DialogType = 'warning' | 'info' | 'error';

// == Stylesheet ==================================================================
// import SCSS as a text string — the pipeline compiles SCSS → CSS and inlines
// the result into the JS bundle (no separate CSS request needed)
import componentStyles from './ays-dialog.scss';

// == Component ===================================================================
/**
 * <ays-dialog> — a customizable "Are You Sure" confirmation dialog.
 *
 * @element ays-dialog
 * @fires {CustomEvent} ays-confirmed - fired when the user confirms
 * @fires {CustomEvent} ays-cancelled - fired when the user cancels
 */
class AysDialog extends HTMLElement {
  private _isOpen = false;
  private _handleKeydown: ((e: KeyboardEvent) => void) | null = null;

  // == Lifecycle =================================================================
  public constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  public connectedCallback() {
    this.mountTemplate();
    this.setupEventListeners();
  }

  public disconnectedCallback() {
    if(this._handleKeydown) document.removeEventListener('keydown', this._handleKeydown);
  }

  public static get observedAttributes() {
    return ['open', 'type', 'primary-text', 'cancel-text'];
  }

  public attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if(name === 'open') {
      if(newValue !== null) this.show();
      else this.hide();
    } else if((name === 'type') && (oldValue !== newValue)) {
      this.mountTemplate();
    } else if(((name === 'primary-text') || (name === 'cancel-text')) && (oldValue !== newValue)) {
      this.updateButtonText();
    }
  }

  // == Attribute Accessors =======================================================
  public get type(): DialogType { return (this.getAttribute('type') as DialogType) || 'warning'; }
  public get primaryText(): string { return this.getAttribute('primary-text') || 'Continue'; }
  public get cancelText(): string | null { return this.getAttribute('cancel-text'); }

  // == Rendering =================================================================
  private mountTemplate() {
    const shadow = this.shadowRoot!;

    // render the full Preact tree (style + template) into the shadow root.
    // Preact's render() converts VNodes into real DOM nodes
    render(
      <div>
        <style>{componentStyles}</style>
        {this.template()}
      </div>,
      shadow
    );
  }

  private template(): HTMLElement {
    return (
      <div className="overlay" part="overlay">
        <div className="dialog" part="dialog" role="dialog" aria-modal="true">
          <div className="header" part="header">
            <div className="icon" part="icon">
              <slot name="icon"></slot>
            </div>
            <div className="title" part="title">
              <slot name="title">Are you sure?</slot>
            </div>
          </div>
          <div className="message" part="message">
            <slot name="message">Please confirm this action.</slot>
          </div>
          <div className="actions" part="actions">
            <button className={`btn-cancel${this.cancelText ? '' : ' hidden'}`} part="cancel-button">
              {this.cancelText || ''}
            </button>
            <button className="btn-primary" part="confirm-button">
              {this.primaryText}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // == Event Wiring ==============================================================
  private setupEventListeners() {
    const overlay = this.shadowRoot!.querySelector('.overlay')!;
    const cancelBtn = this.shadowRoot!.querySelector('.btn-cancel')!;
    const confirmBtn = this.shadowRoot!.querySelector('.btn-primary')!;

    // backdrop click to cancel
    overlay.addEventListener('click', (e) => {
      if(e.target === overlay) this.cancel();
    });

    cancelBtn.addEventListener('click', () => this.cancel());
    confirmBtn.addEventListener('click', () => this.confirm());

    // ESC key to cancel
    this._handleKeydown = (e: KeyboardEvent) => {
      if((e.key === 'Escape') && this._isOpen) this.cancel();
    };
    document.addEventListener('keydown', this._handleKeydown);
  }

  private updateButtonText() {
    const cancelBtn = this.shadowRoot!.querySelector('.btn-cancel') as HTMLElement | null;
    const confirmBtn = this.shadowRoot!.querySelector('.btn-primary') as HTMLElement | null;

    if(confirmBtn) confirmBtn.textContent = this.primaryText;
    if(cancelBtn) {
      cancelBtn.textContent = this.cancelText || '';
      if(this.cancelText) cancelBtn.classList.remove('hidden');
      else cancelBtn.classList.add('hidden');
    } /* else -- no cancel button in the template */
  }

  // == Public API ================================================================
  // -- Show ----------------------------------------------------------------------
  /** show the dialog with a fade+scale animation */
  public show() {
    this._isOpen = true;
    const overlay = this.shadowRoot!.querySelector('.overlay') as HTMLElement;
    overlay.classList.add('show');
    // requestAnimationFrame ensures the browser paints 'display:flex' before
    // the opacity transition starts — without it, the animation gets skipped
    requestAnimationFrame(() => overlay.classList.add('visible'));
    setTimeout(() => {
      (this.shadowRoot!.querySelector('.btn-primary') as HTMLElement)?.focus();
    }, 100/*wait for the transition to start before focusing*/);
  }

  // -- Hide ----------------------------------------------------------------------
  /** hide the dialog */
  public hide() {
    this._isOpen = false;
    const overlay = this.shadowRoot!.querySelector('.overlay') as HTMLElement;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.remove('show'), 200/*match CSS transition duration*/);
  }

  // -- Confirm -------------------------------------------------------------------
  /** confirm the action — fires 'ays-confirmed' and hides */
  public confirm() {
    this.dispatchEvent(new CustomEvent('ays-confirmed', {
      bubbles: true,
      composed: true/*escape shadow DOM*/,
      detail: { type: this.type }
    }));
    this.hide();
  }

  // -- Cancel --------------------------------------------------------------------
  /** cancel the action — fires 'ays-cancelled' and hides */
  public cancel() {
    this.dispatchEvent(new CustomEvent('ays-cancelled', {
      bubbles: true,
      composed: true/*escape shadow DOM*/,
      detail: { type: this.type }
    }));
    this.hide();
  }
}

// == Registration ================================================================
customElements.define('ays-dialog', AysDialog);
