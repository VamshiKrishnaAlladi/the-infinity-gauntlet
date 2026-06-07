const {
    MAX_HISTORY_STATES,
    getScreenshotFilename,
    formatSavedAtMessage,
    formatDisplayTimestamp,
    changeSelectedRedactionMode,
    clampRectToCanvas,
    getAvailableRedactionModes,
    normalizeRect,
    resizeRect,
    sanitizeFilenamePart,
    setActiveTool,
    setRedactMode,
    updateBlurWarning,
    createCanvasSnapshot,
    handleKeyboardShortcuts,
    loadIncludeTimestampPreference,
    persistTitleChange,
    removeSelectedEdit,
    saveIncludeTimestampPreference,
    createDraftSnapshot,
    trimHistory,
    state
} = require( '../../src/screenshot-review' );

describe( 'Screenshot Review Module', () => {
    beforeEach( () => {
        document.body.innerHTML = '';
        state.tool = 'redact';
        state.redactMode = 'mosaic';
        state.undoStack = [];
        state.id = null;
        state.originalBlob = null;
        state.createdAt = null;
        state.updatedAt = null;
        state.backingCanvas = null;
        state.includeTimestamp = true;
        state.edits = [];
        state.selectedEditId = null;
        state.contextMenuEditId = null;
        clearTimeout( state.autosaveTimeout );
        clearTimeout( state.thumbnailTimeout );
        state.autosaveTimeout = null;
        state.thumbnailTimeout = null;
        state.autosavePromise = null;
        state.thumbnailSavePromise = null;
        state.lastSavedDraft = null;
        jest.clearAllMocks();
    } );

    afterEach( () => {
        document.body.innerHTML = '';
    } );

    it( 'should build filenames with local timestamp and sanitized title', () => {
        const filename = getScreenshotFilename(
            'Cluster: Backup/Policy?',
            new Date( 2026, 4, 25, 12, 15, 9 )
        );

        expect( filename ).toBe( '[2026-05-25 12-15-09] Cluster Backup Policy.png' );
    } );

    it( 'should build filenames without timestamp when disabled', () => {
        const filename = getScreenshotFilename(
            'Cluster: Backup/Policy?',
            new Date( 2026, 4, 25, 12, 15, 9 ),
            false
        );

        expect( filename ).toBe( 'Cluster Backup Policy.png' );
    } );

    it( 'should format relative and absolute timestamps', () => {
        const now = new Date( 2026, 5, 7, 22, 31 ).getTime();

        expect( formatDisplayTimestamp( now - 30 * 1000, now ) ).toBe( 'just now' );
        expect( formatDisplayTimestamp( now - 3 * 24 * 60 * 60 * 1000, now ) ).toBe( '3d ago' );
        expect( formatDisplayTimestamp( new Date( 2025, 5, 25 ).getTime(), now ) ).toBe( 'Jun 25th 2025' );
        expect( formatSavedAtMessage( now - 30 * 1000, now ) ).toBe( 'Saved - just now' );
    } );

    it( 'should load saved timestamp preference', async () => {
        const checkbox = document.createElement( 'input' );
        checkbox.id = 'include-timestamp-checkbox';
        checkbox.type = 'checkbox';
        document.body.appendChild( checkbox );
        chrome.storage.local.get.mockResolvedValue( {
            screenshotIncludeTimestamp: false
        } );

        await loadIncludeTimestampPreference();

        expect( state.includeTimestamp ).toBe( false );
        expect( checkbox.checked ).toBe( false );
    } );

    it( 'should save timestamp preference changes', async () => {
        chrome.storage.local.set.mockResolvedValue( undefined );

        await saveIncludeTimestampPreference( false );

        expect( state.includeTimestamp ).toBe( false );
        expect( chrome.storage.local.set ).toHaveBeenCalledWith( {
            screenshotIncludeTimestamp: false
        } );
    } );

    it( 'should fall back to untitled page for unsafe or empty titles', () => {
        expect( sanitizeFilenamePart( '  ' ) ).toBe( 'Untitled Page' );
        expect( sanitizeFilenamePart( 'a/b:c*d?e' ) ).toBe( 'a b c d e' );
    } );

    it( 'should normalize rectangle coordinates regardless of drag direction', () => {
        expect( normalizeRect( { x: 30, y: 40 }, { x: 10, y: 5 } ) ).toEqual( {
            x: 10,
            y: 5,
            width: 20,
            height: 35
        } );
    } );

    it( 'should resize rectangles from handles and clamp to canvas', () => {
        state.backingCanvas = { width: 100, height: 100 };

        expect( resizeRect(
            { x: 20, y: 20, width: 30, height: 30 },
            { x: 50, y: 50 },
            { x: 80, y: 90 },
            'se'
        ) ).toEqual( {
            x: 20,
            y: 20,
            width: 60,
            height: 70
        } );

        expect( clampRectToCanvas( { x: -10, y: 5, width: 30, height: 110 } ) ).toEqual( {
            x: 0,
            y: 5,
            width: 20,
            height: 95
        } );
    } );

    it( 'should cap undo history at 100 states', () => {
        state.undoStack = Array.from( { length: MAX_HISTORY_STATES + 5 }, ( _, index ) => index );

        trimHistory();

        expect( state.undoStack ).toHaveLength( MAX_HISTORY_STATES );
        expect( state.undoStack[ 0 ] ).toBe( 5 );
    } );

    it( 'should create undo snapshots without canvas readback', () => {
        const toDataURL = jest.fn( () => 'data:image/png;base64,snapshot' );
        state.backingCanvas = { toDataURL };

        expect( createCanvasSnapshot() ).toBe( 'data:image/png;base64,snapshot' );
        expect( toDataURL ).toHaveBeenCalledWith( 'image/png' );
    } );

    it( 'should show Gaussian blur warning only for redact blur mode', () => {
        const warning = document.createElement( 'div' );
        warning.id = 'blur-warning';
        warning.className = 'hidden';
        document.body.appendChild( warning );

        state.redactMode = 'blur';
        setActiveTool( 'redact' );
        updateBlurWarning();
        expect( warning.classList.contains( 'hidden' ) ).toBe( false );

        setActiveTool( 'highlight' );
        updateBlurWarning();
        expect( warning.classList.contains( 'hidden' ) ).toBe( true );
    } );

    it( 'should set redact mode and mark selected menu item active', () => {
        const warning = document.createElement( 'div' );
        warning.id = 'blur-warning';
        warning.className = 'hidden';
        const toggle = document.createElement( 'button' );
        toggle.id = 'redact-mode-toggle';
        const mosaicItem = document.createElement( 'button' );
        mosaicItem.dataset.redactMode = 'mosaic';
        const blurItem = document.createElement( 'button' );
        blurItem.dataset.redactMode = 'blur';
        const solidItem = document.createElement( 'button' );
        solidItem.dataset.redactMode = 'solid';
        document.body.appendChild( warning );
        document.body.appendChild( toggle );
        document.body.appendChild( mosaicItem );
        document.body.appendChild( blurItem );
        document.body.appendChild( solidItem );

        setRedactMode( 'blur' );

        expect( state.redactMode ).toBe( 'blur' );
        expect( blurItem.classList.contains( 'active' ) ).toBe( true );
        expect( mosaicItem.classList.contains( 'active' ) ).toBe( false );
        expect( solidItem.classList.contains( 'active' ) ).toBe( false );
        expect( warning.classList.contains( 'hidden' ) ).toBe( false );

        setRedactMode( 'solid' );

        expect( state.redactMode ).toBe( 'solid' );
        expect( solidItem.classList.contains( 'active' ) ).toBe( true );
        expect( blurItem.classList.contains( 'active' ) ).toBe( false );
        expect( warning.classList.contains( 'hidden' ) ).toBe( true );
    } );

    it( 'should update edited title and schedule draft autosave', async () => {
        jest.useFakeTimers();
        state.id = 'shot-1';
        state.createdAt = 1234;
        state.title = 'Old Screenshot Title';
        state.lastSavedDraft = createDraftSnapshot();

        await persistTitleChange( '  New   Screenshot   Title  ' );

        expect( state.title ).toBe( 'New Screenshot Title' );
        expect( state.autosaveTimeout ).not.toBeNull();
        clearTimeout( state.autosaveTimeout );
        state.autosaveTimeout = null;
        jest.useRealTimers();
    } );

    it( 'should prevent default for command undo shortcuts outside text editing', () => {
        const event = {
            key: 'z',
            metaKey: true,
            ctrlKey: false,
            shiftKey: false,
            target: document.body,
            preventDefault: jest.fn()
        };

        handleKeyboardShortcuts( event );

        expect( event.preventDefault ).toHaveBeenCalled();
    } );

    it( 'should remove selected rectangle edits', () => {
        state.edits = [
            {
                id: 'redaction-1',
                kind: 'rect',
                tool: 'redact',
                mode: 'solid',
                rect: { x: 0, y: 0, width: 10, height: 10 }
            }
        ];
        state.selectedEditId = 'redaction-1';

        expect( removeSelectedEdit() ).toBe( true );

        expect( state.edits ).toEqual( [] );
        expect( state.selectedEditId ).toBeNull();
        expect( state.undoStack ).toHaveLength( 1 );
    } );

    it( 'should list alternate redaction modes for context menu actions', () => {
        expect( getAvailableRedactionModes( {
            id: 'redaction-1',
            kind: 'rect',
            tool: 'redact',
            mode: 'solid'
        } ) ).toEqual( [ 'mosaic', 'blur' ] );

        expect( getAvailableRedactionModes( {
            id: 'highlight-1',
            kind: 'rect',
            tool: 'highlight',
            mode: null
        } ) ).toEqual( [] );
    } );

    it( 'should change selected redaction mode', () => {
        state.edits = [
            {
                id: 'redaction-1',
                kind: 'rect',
                tool: 'redact',
                mode: 'solid',
                rect: { x: 0, y: 0, width: 10, height: 10 }
            }
        ];
        state.selectedEditId = 'redaction-1';

        expect( changeSelectedRedactionMode( 'blur' ) ).toBe( true );

        expect( state.edits[ 0 ].mode ).toBe( 'blur' );
        expect( state.undoStack ).toHaveLength( 1 );
    } );

    it( 'should delete selected edits with Delete key', () => {
        state.edits = [
            {
                id: 'redaction-1',
                kind: 'rect',
                tool: 'redact',
                mode: 'solid',
                rect: { x: 0, y: 0, width: 10, height: 10 }
            }
        ];
        state.selectedEditId = 'redaction-1';
        const event = {
            key: 'Delete',
            target: document.body,
            preventDefault: jest.fn()
        };

        handleKeyboardShortcuts( event );

        expect( event.preventDefault ).toHaveBeenCalled();
        expect( state.edits ).toEqual( [] );
    } );
} );
