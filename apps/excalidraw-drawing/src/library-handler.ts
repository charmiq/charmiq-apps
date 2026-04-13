import type { ExcalidrawAPI } from './content-bridge';

// handles Excalidraw library installation via postMessage and BroadcastChannel.
// The library browser redirects to a bridge page hosted on the platform, which
// relays EXCALIDRAW_ADD_LIBRARY messages back here
// ********************************************************************************
// == Types =======================================================================
/** shape of the library message sent from the bridge page */
interface LibraryMessage {
  readonly type: string;
  readonly libraryUrl?: string;
  readonly target?: string;
}

// == Class =======================================================================
/** installs Excalidraw libraries received from the bridge page */
export class LibraryHandler {
  private excalidrawAPI: ExcalidrawAPI | null = null;

  /** provide the Excalidraw API ref once it's ready */
  public setAPI(api: ExcalidrawAPI): void {
    this.excalidrawAPI = api;
  }

  /** start listening for library messages on both channels */
  public init(): void {
    // window.message — sent via window.opener from the bridge page
    window.addEventListener('message', (event: MessageEvent) => {
      this.handleMessage(event.data as LibraryMessage);
    });

    // BroadcastChannel — fallback when window.opener is null (sandboxed iframe)
    try {
      const channel = new BroadcastChannel('charmiq_broadcast');
      channel.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data as LibraryMessage);
      };
    } catch(error) {
      // BroadcastChannel not supported or restricted — fine, postMessage is primary
    }
  }

  // == Internal ==================================================================
  /** process a single library message */
  private async handleMessage(data: LibraryMessage): Promise<void> {
    if(!data || (data.type !== 'EXCALIDRAW_ADD_LIBRARY')) return;/*not a library message*/

    // check if the message is intended for this iframe
    const nodeId = (window as any).IFRAME_NODE_ID;
    if(data.target && data.target !== nodeId) return;/*targeted at a different iframe*/

    const { libraryUrl } = data;
    if(!libraryUrl || !this.excalidrawAPI) return;

    try {
      const response = await fetch(libraryUrl);
      const blob = await response.blob();
      await (this.excalidrawAPI as any).updateLibrary({
        libraryItems: blob,
        merge: true,
        openLibraryMenu: true
      });
    } catch(error) {
      console.error('failed to load library:', error);
    }
  }
}
