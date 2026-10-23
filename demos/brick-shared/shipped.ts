import { isPlatformFile, type FileKind } from './drive';

// the files an app ships for its example films (Stop Motion's sounds, Brick Studio's
// pictures), by name: each file of its kind at the top of a resource folder the
// manifest declares, named by its file's name without its extension (`engine` for
// `sound/engine.ogg`), read as that resource. A build or a scene names a shipped file
// by that name, and any other file by its Platform URI
// ********************************************************************************
// == Constants ===================================================================
/** how a shipped picture is named: lower case letters, digits and dashes */
const PICTURE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

// == Types =======================================================================
/** an app's declared resources, as the Platform lists them a page at a time */
export type ResourceLister = Readonly<{ list: (prefix: string, options?: Readonly<{ next?: string; }>) => Promise<Readonly<{ names: ReadonlyArray<string>; next?: string; }>>; }>;

// == Names =======================================================================
/** the shipped files a listing of `folder` names: each file of `kind` at its top by its
 *  name and the resource it is read as; the first of two that share a name */
export const shippedOf = (folder: string, kind: FileKind, names: ReadonlyArray<string>): ReadonlyMap<string, string> => {
  const shipped = new Map<string, string>();
  for(const resource of names) {
    const file = resource.startsWith(folder) ? resource.slice(folder.length) : '';
    const extension = kind.extensions.find(each => file.toLowerCase().endsWith(each));
    if(!extension || file.includes('/') || (file.length <= extension.length)) continue/*a subfolder, or no file of its kind*/;
    const name = file.slice(0, -extension.length);
    if(!shipped.has(name)) shipped.set(name, resource);
  }
  return shipped;
};

/** the shipped files of `kind` in `folder`, from every page of its listing */
export const listShipped = async (resources: ResourceLister, folder: string, kind: FileKind): Promise<ReadonlyMap<string, string>> => {
  const names: string[] = [];
  let page = await resources.list(folder);
  names.push(...page.names);
  while(page.next !== undefined) {
    page = await resources.list(folder, { next: page.next });
    names.push(...page.names);
  }
  return shippedOf(folder, kind, names);
};

/** the shipped files as `list` gives them, listed when first asked and kept once a
 *  listing succeeds: a failed listing rejects that ask alone, and the next asks again */
export const shippedLister = (list: () => Promise<ReadonlyMap<string, string>>): (() => Promise<ReadonlyMap<string, string>>) => {
  let listed: Promise<ReadonlyMap<string, string>> | undefined/*not yet asked, or failed*/;
  return () => {
    listed ??= list().catch((error: unknown) => { listed = undefined/*asked again next time*/; throw error; });
    return listed;
  };
};

/** whether a value names an image a build may show: a Platform file, or a picture the
 *  app ships by its name (whether it ships one so named is known only once listed) */
export const isImageName = (value: unknown): value is string => isPlatformFile(value) || ((typeof value === 'string') && PICTURE_NAME.test(value));
