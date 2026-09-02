import { getCompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
/**
 * Exported for the 40-column layout test: the geometry rules are the thing
 * under test, and constructing the real layout against a real Screen is the
 * only honest way to assert them (a source pin proves a call exists, not
 * that the panels stop overlapping).
 */
export declare class DoormanLayout {
    screen: any;
    header: any;
    footer: any;
    listPanel: any;
    doorList: any;
    infoPanel: any;
    infoBox: any;
    filterPanel: any;
    filterBox: any;
    /** Stops the masthead animation; called when the door tears down. */
    stopMasthead: (() => void) | null;
    readonly width: number;
    /** The SDK's compact profile for THIS screen - the only width authority. */
    readonly compact: ReturnType<typeof getCompactProfile>;
    /** True when the canvas is the 40-column XXS tier (a C64/PETSCII caller). */
    readonly narrow: boolean;
    constructor(screen: any, nodeId: string | number);
    setHeader(content: string): void;
    setFooter(content: string): void;
    setListLabel(label: string): void;
    setListItems(items: string[]): void;
    setListSelect(idx: number): void;
    get listSelected(): number;
    setInfo(content: string): void;
    focusList(): void;
    focusFilter(): void;
    showRepoLayout(): void;
    showInstalledLayout(): void;
    render(): void;
}
//# sourceMappingURL=doorman-layout.d.ts.map