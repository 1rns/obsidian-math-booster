import { EditorView } from '@codemirror/view';
import { BlockSubpathResult, CachedMetadata, HeadingSubpathResult, MarkdownView, Modifier, Platform, Plugin, Pos, SectionCache, parseLinktext, resolveSubpath } from "obsidian";
import { App, TAbstractFile, TFile, TFolder } from "obsidian";
import { locToEditorPosition } from 'utils/editor';
import { LeafArgs } from 'typings/type';

////////////////////
// File utilities //
////////////////////

/**
 * Similar to Vault.recurseChildren, but this function can be also called for TFile, not just TFolder.
 * Also, the callback is only called for TFile.
 */
export function iterDescendantFiles(file: TAbstractFile, callback: (descendantFile: TFile) => any) {
    if (file instanceof TFile) {
        callback(file);
    } else if (file instanceof TFolder) {
        for (const child of file.children) {
            iterDescendantFiles(child, callback);
        }
    }
}

export function getAncestors(file: TAbstractFile): TAbstractFile[] {
    const ancestors: TAbstractFile[] = [];
    let ancestor: TAbstractFile | null = file;
    while (ancestor) {
        ancestors.push(ancestor);
        if (file instanceof TFolder && file.isRoot()) {
            break;
        }
        ancestor = ancestor.parent;
    }
    ancestors.reverse();
    return ancestors;
}

export function isEqualToOrChildOf(file1: TAbstractFile, file2: TAbstractFile): boolean {
    if (file1 == file2) {
        return true;
    }
    if (file2 instanceof TFolder && file2.isRoot()) {
        return true;
    }
    let ancestor = file1.parent;
    while (true) {
        if (ancestor == file2) {
            return true;
        }
        if (ancestor) {
            if (ancestor.isRoot()) {
                return false;
            }
            ancestor = ancestor.parent
        }
    }
}

//////////////////////
// Cache & metadata //
//////////////////////

export function getSectionCacheFromPos(cache: CachedMetadata, pos: number, type: string): SectionCache | undefined {
    // pos: CodeMirror offset units
    if (cache.sections) {
        const sectionCache = Object.values(cache.sections).find((sectionCache) =>
            sectionCache.type == type
            && (sectionCache.position.start.offset == pos || sectionCache.position.end.offset == pos)
        );
        return sectionCache;
    }
}

export function getSectionCacheOfDOM(el: HTMLElement, type: string, view: EditorView, cache: CachedMetadata) {
    const pos = view.posAtDOM(el);
    return getSectionCacheFromPos(cache, pos, type);
}

export function getSectionCacheFromMouseEvent(event: MouseEvent, type: string, view: EditorView, cache: CachedMetadata) {
    const pos = view.posAtCoords(event) ?? view.posAtCoords(event, false);
    return getSectionCacheFromPos(cache, pos, type);
}

export function getProperty(app: App, file: TFile, name: string) {
    return app.metadataCache.getFileCache(file)?.frontmatter?.[name];
}

export function getPropertyLink(app: App, file: TFile, name: string) {
    const cache = app.metadataCache.getFileCache(file);
    if (cache?.frontmatterLinks) {
        for (const link of cache.frontmatterLinks) {
            if (link.key == name) {
                return link;
            }
        }
    }
}

export function getPropertyOrLinkTextInProperty(app: App, file: TFile, name: string) {
    return getPropertyLink(app, file, name)?.link ?? getProperty(app, file, name);
}

export function generateBlockID(cache: CachedMetadata, length: number = 6): string {
    let id = '';

    while (true) {
        // Reference: https://stackoverflow.com/a/58326357/13613783
        id = [...Array(length)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        if (cache?.blocks && id in cache.blocks) {
            continue;
        } else {
            break;
        }
    }
    return id;
}

export function resolveLinktext(app: App, linktext: string, sourcePath: string): { file: TFile, subpathResult: HeadingSubpathResult | BlockSubpathResult | null } | null {
    const { path, subpath } = parseLinktext(linktext);
    const targetFile = app.metadataCache.getFirstLinkpathDest(path, sourcePath);
    if (!targetFile) return null;
    const targetCache = app.metadataCache.getFileCache(targetFile);
    if (!targetCache) return null;
    const result = resolveSubpath(targetCache, subpath);
    return { file: targetFile, subpathResult: result };

}


///////////////////
// Markdown view //
///////////////////

export function getMarkdownPreviewViewEl(view: MarkdownView) {
    return Array.from(view.previewMode.containerEl.children).find((child) => child.matches(".markdown-preview-view"));
}

export function getMarkdownSourceViewEl(view: MarkdownView) {
    const firstCandidate = view.editor.cm?.dom.parentElement;
    if (firstCandidate) return firstCandidate;
    const secondCandidate = view.previewMode.containerEl.previousSibling;
    if (secondCandidate instanceof HTMLElement && secondCandidate.matches(".markdown-source-view")) {
        return secondCandidate;
    }
}

export async function openFileAndSelectPosition(file: TFile, position: Pos, ...leafArgs: LeafArgs) {
    const leaf = this.app.workspace.getLeaf(...leafArgs);
    await leaf.openFile(file);
    if (leaf.view instanceof MarkdownView) {
        leaf.view.editor.setSelection(
            locToEditorPosition(position.start),
            locToEditorPosition(position.end)
        );
        const cm = leaf.view.editor.cm;
        if (cm) {
            const lineCenter = Math.floor((position.start.line + position.end.line) / 2);
            const posCenter = cm.state.doc.line(lineCenter).from
            cm.dispatch({
                effects: EditorView.scrollIntoView(posCenter, { y: "center" }),
            });
        }
    }
}

////////////
// Others //
////////////

// compare the version of given plugin and the required version
export function isPluginOlderThan(plugin: Plugin, version: string): boolean {
    return plugin.manifest.version.localeCompare(version, undefined, { numeric: true }) < 0;
}

export function getModifierNameInPlatform(mod: Modifier): string {
    if (mod == "Mod") {
        return Platform.isMacOS || Platform.isIosApp ? "⌘" : "ctrl";
    }
    if (mod == "Shift") {
        return "shift";
    }
    if (mod == "Alt") {
        return Platform.isMacOS || Platform.isIosApp ? "⌥" : "alt";
    }
    if (mod == "Meta") {
        return Platform.isMacOS || Platform.isIosApp ? "⌘" : Platform.isWin ? "win" : "meta";
    }
    return "ctrl";
}



// export function getDataviewAPI(plugin: MathBooster): DataviewApi | undefined {
//     const dv = getAPI(plugin.app); // Dataview API
//     if (dv) {
//         return dv;
//     }
//     new Notice(`${plugin.manifest.name}: Cannot load Dataview API. Make sure that Dataview is installed & enabled.`);
// }

// export function getMathCache(cache: CachedMetadata, lineStart: number): SectionCache | undefined {
//     if (cache.sections) {
//         const sectionCache = Object.values(cache.sections).find((sectionCache) =>
//             sectionCache.type == 'math'
//             && sectionCache.position.start.line == lineStart
//         );
//         return sectionCache;
//     }
// }

// export function getMathCacheFromPos(cache: CachedMetadata, pos: number): SectionCache | undefined {
//     return getSectionCacheFromPos(cache, pos, "math");
// }

// export function findSectionCache(cache: CachedMetadata, callback: (sectionCache: SectionCache, index: number, sections: SectionCache[]) => boolean): SectionCache | undefined {
//     // pos: CodeMirror offset units
//     if (cache.sections) {
//         return Object.values(cache.sections).find(callback);
//     }
// }


// export function getBacklinks(app: App, plugin: MathBooster, file: TFile, cache: CachedMetadata, pick: (block: BlockCache) => boolean): Backlink[] | null {
//     const backlinksToNote = plugin.oldLinkMap.invMap.get(file.path); // backlinks to the note containing this theorem callout
//     const backlinks: Backlink[] = [] // backlinks to this theorem callout
//     if (backlinksToNote) {
//         for (const backlink of backlinksToNote) {
//             const sourceCache = app.metadataCache.getCache(backlink);
//             sourceCache?.links
//                 ?.forEach((link: LinkCache) => {
//                     const { subpath } = parseLinktext(link.link);
//                     const subpathResult = resolveSubpath(cache, subpath);
//                     if (subpathResult?.type == "block" && pick(subpathResult.block)) {
//                         backlinks.push({ sourcePath: backlink, link: link });
//                     }
//                 })
//         }
//     }
//     return backlinks;
// }


// export function getBlockIdsWithBacklink(file: TFile, plugin: MathBooster): string[] {
//     const dv = getDataviewAPI(plugin);
//     const cache = plugin.app.metadataCache.getFileCache(file);
//     const ids: string[] = [];
//     if (dv && cache) {
//         const page = dv.page(file.path); // Dataview page object
//         if (page) {
//             // @ts-ignore
//             for (const inlink of page.file?.inlinks) {
//                 // cache of the source of this link (source --link--> target)
//                 const sourcePath = inlink.path;
//                 const sourceCache = plugin.app.metadataCache.getCache(sourcePath);
//                 if (sourceCache) {
//                     sourceCache.links?.forEach(
//                         (item) => {
//                             const linktext = item.link;
//                             const parseResult = parseLinktext(linktext);
//                             const linkpath = parseResult.path;
//                             const subpath = parseResult.subpath;
//                             const targetFile = plugin.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
//                             if (targetFile && targetFile.path == file.path) {
//                                 const subpathResult = resolveSubpath(cache as CachedMetadata, subpath);
//                                 if (subpathResult && subpathResult.type == "block") {
//                                     const blockCache = subpathResult.block;
//                                     ids.push(blockCache.id);
//                                 }
//                             }
//                         }
//                     )

//                 }
//             }
//         }
//     }
//     return ids;
// }