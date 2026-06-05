const {
    MAX_HISTORY_STATES,
    getScreenshotFilename,
    clampRectToCanvas,
    normalizeRect,
    resizeRect,
    sanitizeFilenamePart,
    setActiveTool,
    setRedactMode,
    updateBlurWarning,
    createCanvasSnapshot,
    handleKeyboardShortcuts,
    persistTitleChange,
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
        state.dataUrl = null;
        state.createdAt = null;
        state.backingCanvas = null;
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
        document.body.appendChild( warning );
        document.body.appendChild( toggle );
        document.body.appendChild( mosaicItem );
        document.body.appendChild( blurItem );

        setRedactMode( 'blur' );

        expect( state.redactMode ).toBe( 'blur' );
        expect( blurItem.classList.contains( 'active' ) ).toBe( true );
        expect( mosaicItem.classList.contains( 'active' ) ).toBe( false );
        expect( warning.classList.contains( 'hidden' ) ).toBe( false );
    } );

    it( 'should persist edited title in the temporary screenshot record', async () => {
        const putTemporaryScreenshot = jest.fn().mockResolvedValue( undefined );
        global.InfinityGauntletScreenshotStore = { putTemporaryScreenshot };
        state.id = 'shot-1';
        state.dataUrl = 'data:image/png;base64,test';
        state.createdAt = 1234;

        await persistTitleChange( '  New   Screenshot   Title  ' );

        expect( state.title ).toBe( 'New Screenshot Title' );
        expect( putTemporaryScreenshot ).toHaveBeenCalledWith( {
            id: 'shot-1',
            dataUrl: 'data:image/png;base64,test',
            title: 'New Screenshot Title',
            createdAt: 1234
        } );
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
} );
